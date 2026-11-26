// New / edit purchase quotation (عرض سعر شراء): /purchase-quotations/new and /purchase-quotations/:id/edit.
// A FULL PAGE (not a modal): a document has many lines. This file loads the data and shows the page states;
// the form itself is components/QuotationEditor (it starts from the loaded data).
//
// Edit: only DRAFT / SENT quotations (week2flow §6.1); another status → a message + "عرض التفاصيل".
// An unknown / deleted id → "عرض السعر غير موجود أو محذوف".
import { useParams } from "react-router-dom";
import PageHeader from "../../components/layout/PageHeader";
import Alert from "../../components/ui/Alert";
import Button from "../../components/ui/Button";
import EmptyState from "../../components/ui/EmptyState";
import ErrorState from "../../components/ui/ErrorState";
import LoadingState from "../../components/ui/LoadingState";
import StatusBadge from "../../components/ui/StatusBadge";
import useLoadData from "../../hooks/useLoadData";
import { QUOTATION_STATUSES, getLabel } from "../../utils/labels";
import {
  getBranches,
  getInventories,
  getProductUnits,
  getProducts,
  getPurchaseQuotation,
  getSuppliers,
} from "./purchaseQuotationsApi";
import { EDITABLE_STATUSES } from "./quotationForm";
import QuotationEditor from "./components/QuotationEditor";

const LIST_LINK = "/purchase-quotations";

// The quotation, or null when it does not exist (404): the page shows "not found" instead of an error.
async function loadQuotation(id) {
  try {
    return await getPurchaseQuotation(id);
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
  const [suppliers, branches, inventories, products, quotation] = await Promise.all([
    getSuppliers(),
    getBranches(),
    getInventories(),
    getProducts(),
    id ? loadQuotation(id) : null,
  ]);
  const units = {};
  if (quotation && EDITABLE_STATUSES.includes(quotation.status)) {
    const productIds = [...new Set(quotation.lines.map((line) => line.productId))];
    const entries = await Promise.all(productIds.map(loadUnitsEntry));
    productIds.forEach((productId, index) => {
      units[productId] = entries[index];
    });
  }
  return { lists: { suppliers, branches, inventories, products }, quotation, units };
}

function PurchaseQuotationForm() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const { data, loading, error, refreshError, reload, refresh } = useLoadData(() => loadFormData(id), [id ?? ""]);
  const quotation = data?.quotation ?? null;
  const ready = !loading && !error && data;

  const title =
    isEdit && ready && quotation ? (
      <span className="inline-flex flex-wrap items-center gap-3">
        تعديل عرض السعر {quotation.code}
        <StatusBadge status={quotation.status} />
      </span>
    ) : isEdit ? (
      "تعديل عرض السعر"
    ) : (
      "عرض سعر شراء جديد"
    );
  const back =
    isEdit && quotation
      ? { to: `/purchase-quotations/${quotation.id}`, label: `عرض السعر ${quotation.code}` }
      : { to: LIST_LINK, label: "عروض أسعار الشراء" };

  function renderContent() {
    if (loading) return <LoadingState />;
    if (error) return <ErrorState message={error} onRetry={reload} />;
    if (isEdit && !quotation) {
      return (
        <EmptyState
          message="عرض السعر غير موجود أو محذوف"
          action={<Button to={LIST_LINK} variant="secondary">العودة إلى عروض الأسعار</Button>}
        />
      );
    }
    if (isEdit && !EDITABLE_STATUSES.includes(quotation.status)) {
      return (
        <EmptyState
          message={`لا يمكن تعديل هذا العرض لأن حالته «${getLabel(QUOTATION_STATUSES, quotation.status)}»`}
          action={
            <Button to={`/purchase-quotations/${quotation.id}`} variant="secondary">
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
        <QuotationEditor
          key={id ?? "new"}
          quotation={quotation}
          lists={data.lists}
          initialUnits={data.units}
          onRefreshLists={refresh}
        />
      </>
    );
  }

  return (
    <div>
      <PageHeader title={title} back={back} />
      {renderContent()}
    </div>
  );
}

export default PurchaseQuotationForm;
