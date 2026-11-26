// One purchase quotation (عرض سعر شراء): /purchase-quotations/:id — read only, with the status actions.
// The buttons follow the state machine (week2flow §6.1):
//   DRAFT     تعديل · إرسال · حذف          SENT      تعديل · قبول · رفض · حذف
//   ACCEPTED  تحويل لفاتورة · حذف          REJECTED  حذف          CONVERTED  (nothing)
// After an action the quotation the server returned is shown right away (no reload). 409 INVALID_STATUS (someone
// changed it meanwhile) → the Arabic message + a silent refresh, so the buttons follow the real status.
import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Check, FileOutput, Pencil, Send, Trash2, X } from "lucide-react";
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
import { getErrorMessage } from "../../utils/errors";
import { formatDateTime, formatDay, formatMoney, formatNumber, formatQuantity } from "../../utils/format";
import {
  changePurchaseQuotationStatus,
  deletePurchaseQuotation,
  getPurchaseInvoice,
  getPurchaseQuotation,
} from "./purchaseQuotationsApi";
import { showsExpired } from "./quotationForm";
import ConvertToInvoiceModal from "./components/ConvertToInvoiceModal";

const LIST_LINK = "/purchase-quotations";

function isNotFound(err) {
  return err?.response?.status === 404;
}

// The quotation (null = not found) + the invoice it became (CONVERTED only): { code, status }, or
// { deleted: true } when that DRAFT invoice was deleted later (404).
async function loadDetails(id) {
  let quotation;
  try {
    quotation = await getPurchaseQuotation(id);
  } catch (err) {
    if (isNotFound(err)) return { quotation: null, invoice: null };
    throw err;
  }
  let invoice = null;
  if (quotation.convertedToInvoiceId) {
    try {
      invoice = await getPurchaseInvoice(quotation.convertedToInvoiceId);
    } catch (err) {
      if (!isNotFound(err)) throw err;
      invoice = { deleted: true };
    }
  }
  return { quotation, invoice };
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

const LINE_COLUMNS = [
  { key: "number", label: "#", render: (_, index) => <span className="text-slate-500">{index + 1}</span> },
  {
    key: "product",
    label: "الصنف",
    render: (line) => (
      <StackedCell
        main={<span className="block max-w-56 whitespace-normal">{line.product?.name ?? "-"}</span>}
        sub={
          <>
            {line.product?.code}
            {line.notes && <span className="block max-w-56 whitespace-normal">{line.notes}</span>}
          </>
        }
      />
    ),
  },
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
  { key: "quantity", label: "الكمية", render: (line) => <span dir="ltr">{formatQuantity(line.quantity)}</span> },
  { key: "unitPrice", label: "سعر الوحدة", render: (line) => renderMoney4(line.unitPrice) },
  { key: "discount", label: "الخصم", render: renderLineDiscount },
  {
    key: "lineTotal",
    label: "الإجمالي",
    render: (line) => <span className="font-semibold">{renderMoney4(line.lineTotal)}</span>,
  },
];

// "admin — 26 نوفمبر 2026 في 7:34 م". <bdi> keeps a Latin username and the date's digits in their own order
// (without it the RTL text shows "26 — admin نوفمبر ...").
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

function PurchaseQuotationDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data, loading, error, refreshError, reload, refresh, setData } = useLoadData(() => loadDetails(id), [id]);
  const [successMessage, showSuccessMessage, hideSuccessMessage] = useRouteMessage();
  const [actionError, setActionError] = useState("");
  const [convertOpen, setConvertOpen] = useState(false);

  const quotation = data?.quotation ?? null;
  const invoice = data?.invoice ?? null;
  const ready = !loading && !error && quotation;

  function showActionError(err) {
    hideSuccessMessage();
    setActionError(getErrorMessage(err));
    // Someone changed / deleted it meanwhile: show the real state.
    if (err.response?.data?.code === "INVALID_STATUS" || isNotFound(err)) refresh();
  }

  async function changeStatus(status, message) {
    try {
      const updated = await changePurchaseQuotationStatus(quotation.id, status);
      setData({ quotation: updated, invoice });
      setActionError("");
      showSuccessMessage(message);
    } catch (err) {
      showActionError(err);
    }
  }

  async function handleDelete() {
    try {
      await deletePurchaseQuotation(quotation.id);
      navigate(LIST_LINK, { state: { successMessage: `تم حذف عرض السعر ${quotation.code}` } });
    } catch (err) {
      showActionError(err);
    }
  }

  function handleConverted(result) {
    setConvertOpen(false);
    setData({ quotation: result.quotation, invoice: result.invoice });
    setActionError("");
    showSuccessMessage(`تم إنشاء فاتورة الشراء ${result.invoice.code} كمسودة من هذا العرض`);
  }

  function handleConvertConflict(message) {
    setConvertOpen(false);
    hideSuccessMessage();
    setActionError(message);
    refresh();
  }

  function getActions() {
    const edit = {
      key: "edit",
      label: "تعديل",
      icon: Pencil,
      variant: "secondary",
      to: `/purchase-quotations/${quotation.id}/edit`,
    };
    const remove = {
      key: "delete",
      label: "حذف",
      icon: Trash2,
      variant: "danger-ghost",
      onClick: handleDelete,
      confirm: {
        title: "حذف عرض السعر",
        message: `هل أنت متأكد من حذف عرض السعر ${quotation.code}؟`,
        confirmLabel: "حذف العرض",
      },
    };
    const send = {
      key: "send",
      label: "إرسال",
      icon: Send,
      variant: "primary",
      onClick: () => changeStatus("SENT", "تم إرسال العرض"),
      confirm: {
        title: "إرسال العرض",
        message: "سيتم تغيير حالة العرض إلى «مُرسل» (أُرسل للمورد). يظل العرض قابلًا للتعديل، ولا يمكن إعادته إلى مسودة.",
        confirmLabel: "إرسال العرض",
        confirmVariant: "primary",
      },
    };
    const accept = {
      key: "accept",
      label: "قبول",
      icon: Check,
      variant: "primary",
      onClick: () => changeStatus("ACCEPTED", "تم قبول العرض"),
      confirm: {
        title: "قبول العرض",
        message: "بعد القبول لا يمكن تعديل العرض، ويمكن تحويله إلى فاتورة شراء.",
        confirmLabel: "قبول العرض",
        confirmVariant: "primary",
      },
    };
    const reject = {
      key: "reject",
      label: "رفض",
      icon: X,
      variant: "danger-ghost",
      onClick: () => changeStatus("REJECTED", "تم رفض العرض"),
      confirm: {
        title: "رفض العرض",
        message: "بعد الرفض لا يمكن تعديل العرض أو قبوله أو تحويله، ويمكن حذفه فقط.",
        confirmLabel: "رفض العرض",
      },
    };
    const convert = {
      key: "convert",
      label: "تحويل لفاتورة",
      icon: FileOutput,
      variant: "primary",
      onClick: () => {
        setActionError("");
        setConvertOpen(true);
      },
    };
    const byStatus = {
      DRAFT: [edit, send, remove],
      SENT: [edit, accept, reject, remove],
      ACCEPTED: [convert, remove],
      REJECTED: [remove],
      CONVERTED: [],
    };
    return byStatus[quotation.status] ?? [];
  }

  function renderInvoice() {
    if (!invoice) return "—";
    if (invoice.deleted) return <span className="text-slate-400">الفاتورة محذوفة</span>;
    // Plain text for now: the purchase invoice page (Prompt 19) makes it a link.
    return (
      <span className="inline-flex items-center gap-2">
        <span dir="ltr" className="font-medium">
          {invoice.code}
        </span>
        <StatusBadge status={invoice.status} />
      </span>
    );
  }

  function renderInfo() {
    return (
      <section className="mb-4 rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-base font-semibold text-slate-900">بيانات العرض</h2>
        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <InfoItem label="المورد">
            <StackedCell main={quotation.supplier?.name ?? "-"} sub={quotation.supplier?.code} />
          </InfoItem>
          <InfoItem label="الفرع">{quotation.branch?.name ?? "-"}</InfoItem>
          <InfoItem label="المخزن">{quotation.warehouse?.name ?? "بدون مخزن"}</InfoItem>
          <InfoItem label="تاريخ العرض">{formatDay(quotation.quotationDate)}</InfoItem>
          <InfoItem label="صالح حتى">{quotation.validUntil ? formatDay(quotation.validUntil) : "—"}</InfoItem>
          {quotation.status === "CONVERTED" && <InfoItem label="الفاتورة الناتجة">{renderInvoice()}</InfoItem>}
          <InfoItem label="أنشأه">{renderUserAndDate(quotation.createdByUser, quotation.createdDate)}</InfoItem>
          <InfoItem label="آخر تعديل">
            {quotation.modifiedByUser ? renderUserAndDate(quotation.modifiedByUser, quotation.modifiedDate) : "—"}
          </InfoItem>
          <InfoItem label="ملاحظات" wide>
            <span className="whitespace-pre-line">{quotation.notes || "—"}</span>
          </InfoItem>
        </dl>
      </section>
    );
  }

  function renderContent() {
    if (loading) return <LoadingState />;
    if (error) return <ErrorState message={error} onRetry={reload} />;
    if (!quotation) {
      return (
        <EmptyState
          message="عرض السعر غير موجود أو محذوف"
          action={
            <Button to={LIST_LINK} variant="secondary">
              العودة إلى عروض الأسعار
            </Button>
          }
        />
      );
    }
    return (
      <>
        {renderInfo()}
        <section className="mb-4 rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="mb-3 text-base font-semibold text-slate-900">البنود</h2>
          <DataTable columns={LINE_COLUMNS} rows={quotation.lines} />
        </section>
        <TotalsBox
          subTotal={quotation.subTotal}
          discountValue={quotation.discountValue}
          discountPercent={quotation.discountPercent}
          taxValue={quotation.taxValue}
          taxPercent={quotation.taxPercent}
          netTotal={quotation.netTotal}
        />
      </>
    );
  }

  const title = ready ? (
    <span className="inline-flex flex-wrap items-center gap-3">
      <span>
        عرض سعر شراء <span dir="ltr">{quotation.code}</span>
      </span>
      <StatusBadge status={quotation.status} />
      {showsExpired(quotation) && <StatusBadge expired />}
    </span>
  ) : (
    "عرض سعر شراء"
  );

  return (
    <div>
      <PageHeader
        title={title}
        back={{ to: LIST_LINK, label: "عروض أسعار الشراء" }}
        action={ready && <DocumentActions key={quotation.status} actions={getActions()} />}
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

      {convertOpen && ready && (
        <ConvertToInvoiceModal
          quotation={quotation}
          onClose={() => setConvertOpen(false)}
          onConverted={handleConverted}
          onStatusConflict={handleConvertConflict}
        />
      )}
    </div>
  );
}

export default PurchaseQuotationDetails;
