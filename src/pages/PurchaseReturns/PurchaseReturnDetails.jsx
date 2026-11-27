// One purchase return (مرتجع شراء): /purchase-returns/:id — read only, with the actions.
// The buttons follow the state machine (week2flow §6.3):
//   DRAFT      تعديل · ترحيل · حذف       POSTED  إلغاء المرتجع       CANCELLED  (nothing)
// ترحيل takes every STOCK line OUT of the warehouse at the current average cost (the average does not change);
// إلغاء المرتجع puts them back at the same cost, and the quantities can be returned again on the invoice.
// After an action the return the server returned is shown right away (no reload). 409 INVALID_STATUS (someone changed
// it meanwhile) → the Arabic message + a silent refresh, so the buttons follow the real status.
// A DRAFT warns before posting (ترحيل disabled with the reason):
// - a linked return whose invoice is no longer POSTED (cancelled / deleted meanwhile): it can only be deleted;
// - STOCK lines that need more pieces than the warehouse has now (posting would refuse them).
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ClipboardList, Pencil, Send, Trash2, XCircle } from "lucide-react";
import PageHeader from "../../components/layout/PageHeader";
import DocumentActions from "../../components/documents/DocumentActions";
import TotalsBox from "../../components/documents/TotalsBox";
import Alert from "../../components/ui/Alert";
import Button from "../../components/ui/Button";
import DataTable from "../../components/ui/DataTable";
import EmptyState from "../../components/ui/EmptyState";
import ErrorState from "../../components/ui/ErrorState";
import LoadingState from "../../components/ui/LoadingState";
import StackedCell from "../../components/ui/StackedCell";
import StatusBadge from "../../components/ui/StatusBadge";
import useLoadData from "../../hooks/useLoadData";
import useRouteMessage from "../../hooks/useRouteMessage";
import { getErrorMessage, getLineError } from "../../utils/errors";
import { formatDateTime, formatDay, formatMoney, formatNumber, formatQuantity } from "../../utils/format";
import {
  cancelPurchaseReturn,
  deletePurchaseReturn,
  getCurrencies,
  getProducts,
  getPurchaseInvoice,
  getPurchaseReturn,
  getWarehouseStock,
  postPurchaseReturn,
} from "./purchaseReturnsApi";
import { INVOICE_NOT_POSTED, getDefaultCurrency, getShortLines } from "./returnForm";

const LIST_LINK = "/purchase-returns";
const INVOICE_NO_LONGER_POSTED = "الفاتورة الأصلية لم تعد مُرحّلة";

function isNotFound(err) {
  return err?.response?.status === 404;
}

// The linked invoice (its currency + status), or { missing: true } when it was deleted.
async function loadInvoice(invoiceId) {
  try {
    return { invoice: await getPurchaseInvoice(invoiceId) };
  } catch (err) {
    if (isNotFound(err)) return { invoice: null, missing: true };
    throw err;
  }
}

// The warehouse stock (only a DRAFT needs it: the "not enough stock" alert). A deleted warehouse → null.
async function loadStock(warehouseId) {
  try {
    return await getWarehouseStock(warehouseId);
  } catch (err) {
    if (isNotFound(err)) return null;
    throw err;
  }
}

// The return (null = not found) + the default currency + the primary unit name of every product ("= 24 قطعة")
// + the linked invoice (currency, status) + the stock of a DRAFT's warehouse.
async function loadDetails(id) {
  let ret;
  try {
    ret = await getPurchaseReturn(id);
  } catch (err) {
    if (isNotFound(err)) return { ret: null };
    throw err;
  }
  const [currencies, products, linked, stockRows] = await Promise.all([
    getCurrencies(),
    getProducts(),
    ret.purchaseInvoiceId ? loadInvoice(ret.purchaseInvoiceId) : { invoice: null },
    ret.status === "DRAFT" ? loadStock(ret.warehouseId) : null,
  ]);
  const primaryUnits = new Map(products.map((product) => [product.id, product.primaryItemUnit?.name ?? ""]));
  return {
    ret,
    defaultCurrency: getDefaultCurrency(currencies),
    primaryUnits,
    invoice: linked.invoice,
    invoiceMissing: Boolean(linked.missing),
    stockRows,
  };
}

function renderMoney4(value) {
  return <span dir="ltr">{formatMoney(value, { maxDecimals: 4 })}</span>;
}

// "admin — 26 نوفمبر 2026 في 7:34 م". <bdi> keeps a Latin username and the date's digits in their own order.
function renderUserAndDate(user, date) {
  return (
    <>
      <bdi>{user?.username ?? "-"}</bdi> — <bdi>{formatDateTime(date)}</bdi>
    </>
  );
}

function InfoItem({ label, children, wide = false }) {
  return (
    <div className={wide ? "sm:col-span-2 lg:col-span-3" : ""}>
      <dt className="text-xs font-medium text-slate-500">{label}</dt>
      <dd className="mt-0.5 text-sm text-slate-900">{children}</dd>
    </div>
  );
}

function PurchaseReturnDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data, loading, error, refreshError, reload, refresh, setData } = useLoadData(() => loadDetails(id), [id]);
  const [successMessage, showSuccessMessage, hideSuccessMessage] = useRouteMessage();
  const [actionError, setActionError] = useState("");
  const [errorLineIndex, setErrorLineIndex] = useState(null);

  const ret = data?.ret ?? null;
  const ready = !loading && !error && ret;
  const isDraft = ret?.status === "DRAFT";
  // A linked DRAFT whose invoice can't be used any more (cancelled / deleted meanwhile).
  const invoiceBlocked =
    Boolean(ready && isDraft && ret.purchaseInvoiceId) &&
    (data.invoiceMissing || (data.invoice && data.invoice.status !== "POSTED"));
  const shortLines = ready && isDraft && data.stockRows ? getShortLines(ret, data.stockRows) : [];
  const shortText =
    shortLines.length > 0 ? `الكمية المتاحة في المخزن لا تكفي للبنود: ${shortLines.join("، ")} — لا يمكن الترحيل الآن` : "";

  function showActionError(err, extra = "") {
    hideSuccessMessage();
    const message = getErrorMessage(err);
    setActionError(extra ? `${message} — ${extra}` : message);
    const lineError = getLineError(err);
    setErrorLineIndex(lineError ? lineError.lineIndex : null);
    // Someone changed / deleted it meanwhile: show the real state.
    if (err.response?.data?.code === "INVALID_STATUS" || isNotFound(err)) refresh();
  }

  function showUpdated(updated, message) {
    // After posting / cancelling the warehouse stock alert no longer applies (only a DRAFT has one).
    setData({ ...data, ret: updated, stockRows: null });
    setActionError("");
    setErrorLineIndex(null);
    showSuccessMessage(message);
  }

  async function handlePost() {
    try {
      showUpdated(await postPurchaseReturn(ret.id), "تم ترحيل المرتجع وإخراج الكميات من المخزن");
    } catch (err) {
      const { code, field } = err.response?.data || {};
      if (code === "BAD_REQUEST" && field === "purchaseInvoiceId") {
        // The invoice was cancelled meanwhile: say it plainly and load the real state (→ the amber alert).
        hideSuccessMessage();
        setActionError(INVOICE_NO_LONGER_POSTED);
        setErrorLineIndex(null);
        refresh();
        return;
      }
      showActionError(err, code === "QUANTITY_EXCEEDED" ? "تم ترحيل مرتجع آخر على نفس البند" : "");
    }
  }

  async function handleCancel() {
    try {
      showUpdated(await cancelPurchaseReturn(ret.id), "تم إلغاء المرتجع وإرجاع الكميات إلى المخزن");
    } catch (err) {
      showActionError(err);
    }
  }

  async function handleDelete() {
    try {
      await deletePurchaseReturn(ret.id);
      navigate(LIST_LINK, { state: { successMessage: `تم حذف مرتجع الشراء ${ret.code}` } });
    } catch (err) {
      showActionError(err);
    }
  }

  function getActions() {
    const warehouse = ret.warehouse?.name ?? "المخزن";
    const edit = {
      key: "edit",
      label: "تعديل",
      icon: Pencil,
      variant: "secondary",
      to: `/purchase-returns/${ret.id}/edit`,
    };
    const postBlockedTitle = invoiceBlocked ? INVOICE_NOT_POSTED : shortText;
    const post = {
      key: "post",
      label: "ترحيل",
      icon: Send,
      variant: "primary",
      onClick: handlePost,
      disabled: Boolean(postBlockedTitle),
      title: postBlockedTitle || undefined,
      confirm: {
        title: "ترحيل المرتجع",
        message: `سيتم إخراج كميات البنود من «${warehouse}» بمتوسط التكلفة الحالي. بعد الترحيل لا يمكن تعديل المرتجع أو حذفه، ويمكن إلغاؤه فقط.`,
        confirmLabel: "ترحيل المرتجع",
        confirmVariant: "primary",
      },
    };
    const remove = {
      key: "delete",
      label: "حذف",
      icon: Trash2,
      variant: "danger-ghost",
      onClick: handleDelete,
      confirm: {
        title: "حذف المرتجع",
        message: `هل أنت متأكد من حذف مرتجع الشراء ${ret.code}؟`,
        confirmLabel: "حذف المرتجع",
      },
    };
    const cancel = {
      key: "cancel",
      label: "إلغاء المرتجع",
      icon: XCircle,
      variant: "danger-ghost",
      onClick: handleCancel,
      confirm: {
        title: "إلغاء المرتجع",
        message: `ستعود كميات المرتجع إلى «${warehouse}» بنفس التكلفة التي خرجت بها، وتصبح متاحة للإرجاع مرة أخرى على الفاتورة. لا يمكن التراجع عن الإلغاء.`,
        confirmLabel: "إلغاء المرتجع",
        cancelLabel: "رجوع",
      },
    };
    const byStatus = { DRAFT: [edit, post, remove], POSTED: [cancel], CANCELLED: [] };
    return byStatus[ret.status] ?? [];
  }

  function renderProduct(line) {
    return (
      <StackedCell
        main={<span className="block max-w-56 whitespace-normal">{line.product?.name ?? "-"}</span>}
        sub={
          <>
            {line.product?.code}
            {line.product?.itemType === "SERVICE" && <span className="block">خدمة — لا تخرج من المخزن</span>}
            {line.notes && <span className="block max-w-56 whitespace-normal">{line.notes}</span>}
          </>
        }
      />
    );
  }

  // Under the quantity: "= 24 قطعة" (factor ≠ 1) and, for a linked line, what the invoice line bought.
  function renderQuantity(line) {
    const pieces =
      Number(line.unitFactor) !== 1
        ? `= ${formatQuantity(line.baseQuantity)} ${data.primaryUnits.get(line.productId) || "بالوحدة الأساسية"}`
        : "";
    const source = line.purchaseInvoiceLine
      ? `من بند الفاتورة: ${formatQuantity(line.purchaseInvoiceLine.quantity)} ${line.itemUnit?.name ?? ""}`
      : "";
    return (
      <StackedCell
        main={<span dir="ltr">{formatQuantity(line.quantity)}</span>}
        sub={
          pieces || source ? (
            <>
              {pieces && <span className="block">{pieces}</span>}
              {source && <span className="block max-w-36 whitespace-normal">{source}</span>}
            </>
          ) : null
        }
      />
    );
  }

  function getLineColumns() {
    return [
      { key: "number", label: "#", render: (_, index) => <span className="text-slate-500">{index + 1}</span> },
      { key: "product", label: "الصنف", render: renderProduct },
      {
        key: "unit",
        label: "الوحدة",
        render: (line) => (
          <StackedCell
            main={line.itemUnit?.name ?? "-"}
            sub={Number(line.unitFactor) !== 1 ? `المعامل ${formatNumber(line.unitFactor)}` : null}
          />
        ),
      },
      { key: "quantity", label: "الكمية", render: renderQuantity },
      { key: "unitCost", label: "سعر الوحدة", render: (line) => renderMoney4(line.unitCost) },
      {
        key: "lineTotal",
        label: "الإجمالي",
        render: (line) => <span className="font-semibold">{renderMoney4(line.lineTotal)}</span>,
      },
    ];
  }

  // "كارت الصنف" of a STOCK line once its quantities moved (POSTED / CANCELLED).
  function renderLineActions(line, index) {
    if (line.product?.itemType !== "STOCK") return null;
    return (
      <Button
        variant="ghost"
        className="px-2"
        to={`/item-card?product=${line.productId}&inventory=${ret.warehouseId}`}
        title="كارت الصنف"
        aria-label={`كارت الصنف — البند ${index + 1}`}
      >
        <ClipboardList size={16} />
      </Button>
    );
  }

  // Linked: the invoice's currency (its amounts); not linked: the default currency.
  function currencyOf() {
    if (ret.purchaseInvoiceId) return data.invoice?.currency ?? null;
    return data.defaultCurrency;
  }

  function renderInfo() {
    const invoice = ret.purchaseInvoice;
    const currency = currencyOf();
    return (
      <section className="mb-4 rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-base font-semibold text-slate-900">بيانات المرتجع</h2>
        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <InfoItem label="المورد">
            <StackedCell main={ret.supplier?.name ?? "-"} sub={ret.supplier?.code} />
          </InfoItem>
          <InfoItem label="الفاتورة الأصلية">
            {invoice ? (
              <StackedCell
                main={
                  <Link to={`/purchase-invoices/${invoice.id}`} dir="ltr" className="font-medium text-primary hover:underline">
                    {invoice.code}
                  </Link>
                }
                sub={
                  <>
                    {formatDay(invoice.invoiceDate)}
                    {invoice.supplierInvoiceNumber && (
                      <>
                        {" "}
                        · فاتورة المورد <bdi>{invoice.supplierInvoiceNumber}</bdi>
                      </>
                    )}
                  </>
                }
              />
            ) : (
              "بدون فاتورة"
            )}
          </InfoItem>
          <InfoItem label="تاريخ المرتجع">{formatDay(ret.returnDate)}</InfoItem>
          <InfoItem label="الفرع">{ret.branch?.name ?? "-"}</InfoItem>
          <InfoItem label="المخزن">{ret.warehouse?.name ?? "-"}</InfoItem>
          <InfoItem label="العملة">{currency ? `${currency.name} (${currency.code})` : "-"}</InfoItem>
          <InfoItem label="سبب الإرجاع">{ret.reason || "—"}</InfoItem>
          <InfoItem label="أنشأه">{renderUserAndDate(ret.createdByUser, ret.createdDate)}</InfoItem>
          <InfoItem label="آخر تعديل">
            {ret.modifiedByUser ? renderUserAndDate(ret.modifiedByUser, ret.modifiedDate) : "—"}
          </InfoItem>
          {ret.postedByUser && <InfoItem label="رحّله">{renderUserAndDate(ret.postedByUser, ret.postedDate)}</InfoItem>}
          {ret.cancelledByUser && (
            <InfoItem label="ألغاه">{renderUserAndDate(ret.cancelledByUser, ret.cancelledDate)}</InfoItem>
          )}
          <InfoItem label="ملاحظات" wide>
            <span className="whitespace-pre-line">{ret.notes || "—"}</span>
          </InfoItem>
        </dl>
      </section>
    );
  }

  function renderContent() {
    if (loading) return <LoadingState />;
    if (error) return <ErrorState message={error} onRetry={reload} />;
    if (!ret) {
      return (
        <EmptyState
          message="مرتجع الشراء غير موجود أو محذوف"
          action={
            <Button to={LIST_LINK} variant="secondary">
              العودة إلى مرتجعات الشراء
            </Button>
          }
        />
      );
    }
    const moved = ret.status !== "DRAFT";
    const currency = currencyOf();
    const isDefaultCurrency = !currency || currency.id === data.defaultCurrency?.id;
    return (
      <>
        {invoiceBlocked && (
          <Alert type="warning" className="mb-4">
            {INVOICE_NOT_POSTED}
          </Alert>
        )}
        {!invoiceBlocked && shortLines.length > 0 && (
          <Alert type="warning" className="mb-4">
            الكمية المتاحة في «{ret.warehouse?.name}» الآن لا تكفي للبنود: {shortLines.join("، ")}. ترحيل المرتجع
            يحتاج رصيدًا كافيًا.{" "}
            <Link to={`/purchase-returns/${ret.id}/edit`} className="font-medium underline">
              تعديل المرتجع
            </Link>
          </Alert>
        )}
        {renderInfo()}
        <section className="mb-4 rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="mb-3 text-base font-semibold text-slate-900">البنود</h2>
          <DataTable
            columns={getLineColumns()}
            rows={ret.lines}
            renderActions={moved ? renderLineActions : undefined}
            rowClassName={(_, index) => (index === errorLineIndex ? "bg-red-50" : "")}
          />
        </section>
        <TotalsBox
          subTotal={ret.subTotal}
          discountValue={ret.discountValue}
          discountPercent={ret.discountPercent}
          taxValue={ret.taxValue}
          taxPercent={ret.taxPercent}
          netTotal={ret.netTotal}
          extraRows={[{ key: "refund", label: "المبلغ المسترد", value: ret.refundAmount }]}
          currencyCaption={
            isDefaultCurrency ? undefined : `المبالغ بعملة الفاتورة: ${currency.name} (${currency.code})`
          }
        />
      </>
    );
  }

  const title = ready ? (
    <span className="inline-flex flex-wrap items-center gap-3">
      <span>
        مرتجع شراء <span dir="ltr">{ret.code}</span>
      </span>
      <StatusBadge status={ret.status} />
    </span>
  ) : (
    "مرتجع شراء"
  );

  return (
    <div>
      <PageHeader
        title={title}
        back={{ to: LIST_LINK, label: "مرتجعات الشراء" }}
        action={ready && <DocumentActions key={ret.status} actions={getActions()} />}
      />
      {successMessage && (
        <Alert type="success" className="mb-4" onClose={hideSuccessMessage}>
          {successMessage}
        </Alert>
      )}
      {actionError && (
        <Alert type="error" className="mb-4" onClose={() => setActionError("")}>
          {actionError}
        </Alert>
      )}
      {refreshError && (
        <Alert type="error" className="mb-4">
          {refreshError}
        </Alert>
      )}
      {renderContent()}
    </div>
  );
}

export default PurchaseReturnDetails;
