// New / edit purchase invoice (فاتورة شراء): /purchase-invoices/new and /purchase-invoices/:id/edit.
// A FULL PAGE (not a modal), like the quotation form. This file loads the data and shows the page states;
// the form itself is components/InvoiceEditor (it starts from the loaded data).
//
// Edit: only a DRAFT invoice (week2flow §6.2); another status → a message + "عرض التفاصيل".
// An unknown / deleted id → "فاتورة الشراء غير موجودة أو محذوفة".
// A draft made from a quotation shows "من عرض السعر PQ-…" (a link) under the title.
import { Link, useParams } from "react-router-dom";
import PageHeader from "../../components/layout/PageHeader";
import Alert from "../../components/ui/Alert";
import Button from "../../components/ui/Button";
import EmptyState from "../../components/ui/EmptyState";
import ErrorState from "../../components/ui/ErrorState";
import LoadingState from "../../components/ui/LoadingState";
import StatusBadge from "../../components/ui/StatusBadge";
import useLoadData from "../../hooks/useLoadData";
import { DOCUMENT_STATUSES, getLabel } from "../../utils/labels";
import {
  getBranches,
  getCurrencies,
  getInventories,
  getProductUnits,
  getProducts,
  getPurchaseInvoice,
  getSuppliers,
} from "./purchaseInvoicesApi";
import { EDITABLE_STATUSES } from "./invoiceForm";
import InvoiceEditor from "./components/InvoiceEditor";

const LIST_LINK = "/purchase-invoices";

// The invoice, or null when it does not exist (404): the page shows "not found" instead of an error.
async function loadInvoice(id) {
  try {
    return await getPurchaseInvoice(id);
  } catch (err) {
    if (err.response?.status === 404) return null;
    throw err;
  }
}

// The units of one product for the line dropdown. A deleted product (404) → "missing".
async function loadUnitsEntry(productId) {
  try {
    return { status: "ready", units: await getProductUnits(productId) };
  } catch (err) {
    if (err.response?.status === 404) return { status: "missing", units: [] };
    return { status: "error", units: [] };
  }
}

// Everything the form needs. Edit: also the units of every product already on the lines.
async function loadFormData(id) {
  const [suppliers, branches, inventories, products, currencies, invoice] = await Promise.all([
    getSuppliers(),
    getBranches(),
    getInventories(),
    getProducts(),
    getCurrencies(),
    id ? loadInvoice(id) : null,
  ]);
  const units = {};
  if (invoice && EDITABLE_STATUSES.includes(invoice.status)) {
    const productIds = [...new Set(invoice.lines.map((line) => line.productId))];
    const entries = await Promise.all(productIds.map(loadUnitsEntry));
    productIds.forEach((productId, index) => {
      units[productId] = entries[index];
    });
  }
  return { lists: { suppliers, branches, inventories, products, currencies }, invoice, units };
}

function PurchaseInvoiceForm() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const { data, loading, error, refreshError, reload, refresh } = useLoadData(() => loadFormData(id), [id ?? ""]);
  const invoice = data?.invoice ?? null;
  const ready = !loading && !error && data;

  const title =
    isEdit && ready && invoice ? (
      <span className="inline-flex flex-wrap items-center gap-3">
        <span>
          تعديل فاتورة الشراء <span dir="ltr">{invoice.code}</span>
        </span>
        <StatusBadge status={invoice.status} />
      </span>
    ) : isEdit ? (
      "تعديل فاتورة الشراء"
    ) : (
      "فاتورة شراء جديدة"
    );
  const quotation = invoice?.convertedFromQuotation;
  const subtitle = quotation ? (
    <>
      من عرض السعر{" "}
      <Link to={`/purchase-quotations/${quotation.id}`} dir="ltr" className="font-medium text-primary hover:underline">
        {quotation.code}
      </Link>
    </>
  ) : null;
  const back =
    isEdit && invoice
      ? { to: `/purchase-invoices/${invoice.id}`, label: `فاتورة الشراء ${invoice.code}` }
      : { to: LIST_LINK, label: "فواتير الشراء" };

  function renderContent() {
    if (loading) return <LoadingState />;
    if (error) return <ErrorState message={error} onRetry={reload} />;
    if (isEdit && !invoice) {
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
    if (isEdit && !EDITABLE_STATUSES.includes(invoice.status)) {
      return (
        <EmptyState
          message={`لا يمكن تعديل هذه الفاتورة لأن حالتها «${getLabel(DOCUMENT_STATUSES, invoice.status)}»`}
          action={
            <Button to={`/purchase-invoices/${invoice.id}`} variant="secondary">
              عرض التفاصيل
            </Button>
          }
        />
      );
    }
    return (
      <>
        {refreshError && (
          <Alert type="error" className="mb-4">
            {refreshError}
          </Alert>
        )}
        <InvoiceEditor
          key={id ?? "new"}
          invoice={invoice}
          lists={data.lists}
          initialUnits={data.units}
          onRefreshLists={refresh}
        />
      </>
    );
  }

  return (
    <div>
      <PageHeader title={title} subtitle={subtitle} back={back} />
      {renderContent()}
    </div>
  );
}

export default PurchaseInvoiceForm;
