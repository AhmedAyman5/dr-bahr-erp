// One purchase invoice (فاتورة شراء): /purchase-invoices/:id — read only, with the actions.
// The buttons follow the state machine (week2flow §6.2):
//   DRAFT      تعديل · ترحيل · حذف       POSTED  إلغاء الفاتورة (not while a POSTED return exists)
//   CANCELLED  (nothing)
// ترحيل adds every STOCK line to the warehouse (stock cost = the line after discounts, in the default currency);
// إلغاء takes those quantities out again (refused when part of them was already used).
// After an action the invoice the server returned is shown right away (no reload). 409 INVALID_STATUS (someone
// changed it meanwhile) → the Arabic message + a silent refresh, so the buttons follow the real status.
// A DRAFT warns before posting: lines without a required expiry date (ترحيل disabled), a duplicate supplier bill.
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
import { dayToText } from "../../utils/dates";
import { getErrorMessage, getLineError } from "../../utils/errors";
import { formatDateTime, formatDay, formatMoney, formatNumber, formatQuantity } from "../../utils/format";
import { PAYMENT_TYPES, getLabel } from "../../utils/labels";
import {
  cancelPurchaseInvoice,
  deletePurchaseInvoice,
  getCurrencies,
  getProducts,
  getPurchaseInvoice,
  postPurchaseInvoice,
  searchSupplierInvoices,
} from "./purchaseInvoicesApi";
import { findDuplicateInvoice, getDefaultCurrency, getMissingExpiryLines } from "./invoiceForm";

const LIST_LINK = "/purchase-invoices";
const RETURN_BLOCKS_CANCEL = "عليها مرتجع مُرحّل، ألغِ المرتجع أولًا";

function isNotFound(err) {
  return err?.response?.status === 404;
}

// A DRAFT with a supplier bill number: another invoice of the same supplier with the same number, or null.
// A failed check shows nothing (a warning only).
async function loadDuplicate(invoice) {
  if (invoice.status !== "DRAFT" || !invoice.supplierInvoiceNumber) return null;
  try {
    const invoices = await searchSupplierInvoices(invoice.supplierId, invoice.supplierInvoiceNumber);
    return findDuplicateInvoice(invoices, invoice.supplierInvoiceNumber, invoice.id);
  } catch {
    return null;
  }
}

// The invoice (null = not found) + the default currency (its symbol: stock costs are in it) + the primary unit
// name of every product ("= 120 قطعة") + the duplicate bill warning of a draft.
async function loadDetails(id) {
  let invoice;
  try {
    invoice = await getPurchaseInvoice(id);
  } catch (err) {
    if (isNotFound(err)) return { invoice: null };
    throw err;
  }
  const [currencies, products, duplicate] = await Promise.all([getCurrencies(), getProducts(), loadDuplicate(invoice)]);
  const primaryUnits = new Map(products.map((product) => [product.id, product.primaryItemUnit?.name ?? ""]));
  return { invoice, defaultCurrency: getDefaultCurrency(currencies), primaryUnits, duplicate };
}

function renderMoney4(value) {
  return <span dir="ltr">{formatMoney(value, { maxDecimals: 4 })}</span>;
}

// "10%" / the amount / "—".
function renderLineDiscount(line) {
  if (line.discountPercent !== null && line.discountPercent !== undefined) {
    return <span dir="ltr">{`${formatNumber(line.discountPercent)}%`}</span>;
  }
  if (line.discountValue !== null && line.discountValue !== undefined) return renderMoney4(line.discountValue);
  return "—";
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

const RETURN_COLUMNS = [
  { key: "code", label: "رقم المرتجع", render: (row) => <span dir="ltr">{row.code}</span> },
  { key: "returnDate", label: "التاريخ", render: (row) => formatDay(row.returnDate) },
  { key: "status", label: "الحالة", render: (row) => <StatusBadge status={row.status} /> },
  {
    key: "netTotal",
    label: "الصافي",
    render: (row) => (
      <span dir="ltr" className="font-semibold">
        {formatMoney(row.netTotal)}
      </span>
    ),
  },
];

function PurchaseInvoiceDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data, loading, error, refreshError, reload, refresh, setData } = useLoadData(() => loadDetails(id), [id]);
  const [successMessage, showSuccessMessage, hideSuccessMessage] = useRouteMessage();
  const [actionError, setActionError] = useState("");
  const [errorLineIndex, setErrorLineIndex] = useState(null);

  const invoice = data?.invoice ?? null;
  const ready = !loading && !error && invoice;
  const defaultSymbol = data?.defaultCurrency?.symbol || data?.defaultCurrency?.code || "";
  const isDefaultCurrency = invoice?.currencyId === data?.defaultCurrency?.id;

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
    setData({ ...data, invoice: updated, duplicate: null });
    setActionError("");
    setErrorLineIndex(null);
    showSuccessMessage(message);
  }

  async function handlePost() {
    try {
      showUpdated(await postPurchaseInvoice(invoice.id), "تم ترحيل الفاتورة وإضافة الكميات إلى المخزن");
    } catch (err) {
      const { code, field } = err.response?.data || {};
      const missingExpiry = code === "VALIDATION_FAILED" && /^lines\.\d+\.expiryDate$/.test(field ?? "");
      showActionError(err, missingExpiry ? "عدّل الفاتورة لإضافته" : "");
    }
  }

  async function handleCancel() {
    try {
      showUpdated(await cancelPurchaseInvoice(invoice.id), "تم إلغاء الفاتورة وسحب كمياتها من المخزن");
    } catch (err) {
      const used = err.response?.data?.code === "INSUFFICIENT_STOCK";
      showActionError(err, used ? "تم صرف جزء من بضاعة هذه الفاتورة، لذلك لا يمكن إلغاؤها" : "");
    }
  }

  async function handleDelete() {
    try {
      await deletePurchaseInvoice(invoice.id);
      navigate(LIST_LINK, { state: { successMessage: `تم حذف فاتورة الشراء ${invoice.code}` } });
    } catch (err) {
      showActionError(err);
    }
  }

  function getActions(missingExpiryText) {
    const warehouse = invoice.warehouse?.name ?? "المخزن";
    const edit = {
      key: "edit",
      label: "تعديل",
      icon: Pencil,
      variant: "secondary",
      to: `/purchase-invoices/${invoice.id}/edit`,
    };
    const post = {
      key: "post",
      label: "ترحيل",
      icon: Send,
      variant: "primary",
      onClick: handlePost,
      disabled: Boolean(missingExpiryText),
      title: missingExpiryText,
      confirm: {
        title: "ترحيل الفاتورة",
        message: `سيتم إضافة كميات البنود إلى «${warehouse}» وتحديث متوسط التكلفة. بعد الترحيل لا يمكن تعديل الفاتورة أو حذفها، ويمكن إلغاؤها فقط.`,
        confirmLabel: "ترحيل الفاتورة",
        confirmVariant: "primary",
      },
    };
    const quotationNote = invoice.convertedFromQuotation
      ? ` عرض السعر ${invoice.convertedFromQuotation.code} سيبقى بحالة «تم التحويل لفاتورة» ولن يمكن تحويله مرة أخرى.`
      : "";
    const remove = {
      key: "delete",
      label: "حذف",
      icon: Trash2,
      variant: "danger-ghost",
      onClick: handleDelete,
      confirm: {
        title: "حذف الفاتورة",
        message: `هل أنت متأكد من حذف فاتورة الشراء ${invoice.code}؟${quotationNote}`,
        confirmLabel: "حذف الفاتورة",
      },
    };
    const hasPostedReturn = (invoice.purchaseReturns ?? []).some((item) => item.status === "POSTED");
    const cancel = {
      key: "cancel",
      label: "إلغاء الفاتورة",
      icon: XCircle,
      variant: "danger-ghost",
      onClick: handleCancel,
      disabled: hasPostedReturn,
      title: hasPostedReturn ? RETURN_BLOCKS_CANCEL : undefined,
      confirm: {
        title: "إلغاء الفاتورة",
        message: `سيتم سحب كميات الفاتورة من «${warehouse}» (حركة «إلغاء فاتورة شراء» في كارت الصنف). تبقى الفاتورة ظاهرة بحالة «ملغي»، ولا يمكن التراجع عن الإلغاء.`,
        confirmLabel: "إلغاء الفاتورة",
        cancelLabel: "رجوع",
      },
    };
    const byStatus = { DRAFT: [edit, post, remove], POSTED: [cancel], CANCELLED: [] };
    return byStatus[invoice.status] ?? [];
  }

  // The gray line under the product: "صلاحية 30/06/2027 · تشغيلة B12" + the line notes.
  function renderProduct(line) {
    const details = [
      line.expiryDate ? `صلاحية ${dayToText(line.expiryDate)}` : "",
      line.batchNumber ? `تشغيلة ${line.batchNumber}` : "",
    ].filter(Boolean);
    return (
      <StackedCell
        main={<span className="block max-w-56 whitespace-normal">{line.product?.name ?? "-"}</span>}
        sub={
          <>
            {line.product?.code}
            {details.length > 0 && (
              <span dir="auto" className="block max-w-56 whitespace-normal">
                {details.join(" · ")}
              </span>
            )}
            {line.notes && <span className="block max-w-56 whitespace-normal">{line.notes}</span>}
          </>
        }
      />
    );
  }

  // Under the price: the cost of ONE piece in the warehouse (default currency) once posted; SERVICE: no stock.
  function renderPriceSub(line) {
    if (line.product?.itemType === "SERVICE") return "خدمة — لا تدخل المخزن";
    if (invoice.status === "DRAFT") return null;
    return (
      <>
        تكلفة القطعة في المخزن: <span dir="ltr">{formatMoney(line.stockUnitCost, { maxDecimals: 4 })}</span>{" "}
        {defaultSymbol}
      </>
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
      {
        key: "quantity",
        label: "الكمية",
        render: (line) => (
          <StackedCell
            main={<span dir="ltr">{formatQuantity(line.quantity)}</span>}
            sub={
              Number(line.unitFactor) !== 1
                ? `= ${formatQuantity(line.baseQuantity)} ${data.primaryUnits.get(line.productId) || "بالوحدة الأساسية"}`
                : null
            }
          />
        ),
      },
      {
        key: "unitCost",
        label: "سعر شراء الوحدة",
        render: (line) => {
          const sub = renderPriceSub(line);
          return (
            <StackedCell
              main={renderMoney4(line.unitCost)}
              sub={sub && <span className="block max-w-36 whitespace-normal">{sub}</span>}
            />
          );
        },
      },
      { key: "discount", label: "الخصم", render: renderLineDiscount },
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
        to={`/item-card?product=${line.productId}&inventory=${invoice.warehouseId}`}
        title="كارت الصنف"
        aria-label={`كارت الصنف — البند ${index + 1}`}
      >
        <ClipboardList size={16} />
      </Button>
    );
  }

  function renderInfo() {
    const quotation = invoice.convertedFromQuotation;
    return (
      <section className="mb-4 rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-base font-semibold text-slate-900">بيانات الفاتورة</h2>
        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <InfoItem label="المورد">
            <StackedCell main={invoice.supplier?.name ?? "-"} sub={invoice.supplier?.code} />
          </InfoItem>
          <InfoItem label="رقم فاتورة المورد">
            {invoice.supplierInvoiceNumber ? <bdi>{invoice.supplierInvoiceNumber}</bdi> : "—"}
          </InfoItem>
          <InfoItem label="تاريخ الفاتورة">{formatDay(invoice.invoiceDate)}</InfoItem>
          <InfoItem label="الفرع">{invoice.branch?.name ?? "-"}</InfoItem>
          <InfoItem label="المخزن">{invoice.warehouse?.name ?? "-"}</InfoItem>
          <InfoItem label="طريقة الدفع">{getLabel(PAYMENT_TYPES, invoice.paymentType)}</InfoItem>
          {invoice.paymentType === "CREDIT" && (
            <InfoItem label="تاريخ الاستحقاق">{invoice.dueDate ? formatDay(invoice.dueDate) : "—"}</InfoItem>
          )}
          <InfoItem label="العملة">
            {invoice.currency ? `${invoice.currency.name} (${invoice.currency.code})` : "-"}
          </InfoItem>
          {!isDefaultCurrency && (
            <InfoItem label="سعر الصرف">
              {/* One LTR run, so it reads "1 USD = 50.50 ج.م" (the symbol stays after the amount). */}
              <span dir="ltr">
                1 {invoice.currency?.code} = {formatMoney(invoice.exchangeRate, { maxDecimals: 4 })} {defaultSymbol}
              </span>
            </InfoItem>
          )}
          {quotation && (
            <InfoItem label="من عرض السعر">
              <Link to={`/purchase-quotations/${quotation.id}`} dir="ltr" className="font-medium text-primary hover:underline">
                {quotation.code}
              </Link>
            </InfoItem>
          )}
          <InfoItem label="أنشأها">{renderUserAndDate(invoice.createdByUser, invoice.createdDate)}</InfoItem>
          <InfoItem label="آخر تعديل">
            {invoice.modifiedByUser ? renderUserAndDate(invoice.modifiedByUser, invoice.modifiedDate) : "—"}
          </InfoItem>
          {invoice.postedByUser && (
            <InfoItem label="رحّلها">{renderUserAndDate(invoice.postedByUser, invoice.postedDate)}</InfoItem>
          )}
          {invoice.cancelledByUser && (
            <InfoItem label="ألغاها">{renderUserAndDate(invoice.cancelledByUser, invoice.cancelledDate)}</InfoItem>
          )}
          <InfoItem label="ملاحظات" wide>
            <span className="whitespace-pre-line">{invoice.notes || "—"}</span>
          </InfoItem>
        </dl>
      </section>
    );
  }

  function renderReturns() {
    if (invoice.status === "DRAFT") return null;
    const returns = invoice.purchaseReturns ?? [];
    return (
      <section className="mt-4 rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-base font-semibold text-slate-900">المرتجعات</h2>
        {returns.length === 0 ? (
          <p className="text-sm text-slate-500">لا توجد مرتجعات على هذه الفاتورة</p>
        ) : (
          <DataTable columns={RETURN_COLUMNS} rows={returns} />
        )}
      </section>
    );
  }

  function renderContent(missingExpiry) {
    if (loading) return <LoadingState />;
    if (error) return <ErrorState message={error} onRetry={reload} />;
    if (!invoice) {
      return (
        <EmptyState
          message="فاتورة الشراء غير موجودة أو محذوفة"
          action={
            <Button to={LIST_LINK} variant="secondary">
              العودة إلى فواتير الشراء
            </Button>
          }
        />
      );
    }
    const moved = invoice.status !== "DRAFT";
    const paymentRows = [
      { key: "paid", label: "المدفوع", value: invoice.paidAmount },
      { key: "remaining", label: "المتبقي", value: invoice.remainingAmount, strong: true },
    ];
    return (
      <>
        {missingExpiry.length > 0 && (
          <Alert type="warning" className="mb-4">
            أدخل تاريخ الصلاحية للبنود: {missingExpiry.join("، ")} قبل الترحيل.{" "}
            <Link to={`/purchase-invoices/${invoice.id}/edit`} className="font-medium underline">
              تعديل الفاتورة
            </Link>
          </Alert>
        )}
        {data.duplicate && (
          <Alert type="warning" className="mb-4">
            هذا الرقم مسجل بالفعل في الفاتورة <span dir="ltr">{data.duplicate.code}</span> لنفس المورد — تأكد قبل
            الترحيل حتى لا تُضاف الكميات مرتين.
          </Alert>
        )}
        {renderInfo()}
        <section className="mb-4 rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="mb-3 text-base font-semibold text-slate-900">البنود</h2>
          <DataTable
            columns={getLineColumns()}
            rows={invoice.lines}
            renderActions={moved ? renderLineActions : undefined}
            rowClassName={(_, index) => (index === errorLineIndex ? "bg-red-50" : "")}
          />
        </section>
        <TotalsBox
          subTotal={invoice.subTotal}
          discountValue={invoice.discountValue}
          discountPercent={invoice.discountPercent}
          taxValue={invoice.taxValue}
          taxPercent={invoice.taxPercent}
          netTotal={invoice.netTotal}
          extraRows={paymentRows}
          currencyCaption={
            isDefaultCurrency || !invoice.currency
              ? undefined
              : `المبالغ بعملة: ${invoice.currency.name} (${invoice.currency.code})`
          }
        />
        {renderReturns()}
      </>
    );
  }

  const missingExpiry = ready && invoice.status === "DRAFT" ? getMissingExpiryLines(invoice) : [];
  const missingExpiryText =
    missingExpiry.length > 0 ? `أدخل تاريخ الصلاحية للبنود: ${missingExpiry.join("، ")} قبل الترحيل` : "";

  const title = ready ? (
    <span className="inline-flex flex-wrap items-center gap-3">
      <span>
        فاتورة شراء <span dir="ltr">{invoice.code}</span>
      </span>
      <StatusBadge status={invoice.status} />
    </span>
  ) : (
    "فاتورة شراء"
  );

  return (
    <div>
      <PageHeader
        title={title}
        back={{ to: LIST_LINK, label: "فواتير الشراء" }}
        action={ready && <DocumentActions key={invoice.status} actions={getActions(missingExpiryText)} />}
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
      {renderContent(missingExpiry)}
    </div>
  );
}

export default PurchaseInvoiceDetails;
