// New / edit purchase return (مرتجع شراء): /purchase-returns/new (also /new?invoice=<id>, from the invoice's
// "عمل مرتجع") and /purchase-returns/:id/edit. A FULL PAGE (not a modal), like the invoice form. This file loads the
// data and shows the page states; the form itself is components/ReturnEditor (it starts from the loaded data).
//
// Edit: only a DRAFT return (week2flow §6.3); another status → a message + "عرض التفاصيل".
// An unknown / deleted id → "مرتجع الشراء غير موجود أو محذوف".
import { useParams, useSearchParams } from "react-router-dom";
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
  getPurchaseReturn,
  getSuppliers,
} from "./purchaseReturnsApi";
import { EDITABLE_STATUSES } from "./returnForm";
import ReturnEditor from "./components/ReturnEditor";

const LIST_LINK = "/purchase-returns";

// The return, or null when it does not exist (404): the page shows "not found" instead of an error.
async function loadReturn(id) {
  try {
    return await getPurchaseReturn(id);
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

// Everything the form needs. Edit of a not-linked DRAFT: also the units of every product already on the lines.
async function loadFormData(id) {
  const [suppliers, branches, inventories, products, currencies, ret] = await Promise.all([
    getSuppliers(),
    getBranches(),
    getInventories(),
    getProducts(),
    getCurrencies(),
    id ? loadReturn(id) : null,
  ]);
  const units = {};
  if (ret && EDITABLE_STATUSES.includes(ret.status) && !ret.purchaseInvoiceId) {
    const productIds = [...new Set(ret.lines.map((line) => line.productId))];
    const entries = await Promise.all(productIds.map(loadUnitsEntry));
    productIds.forEach((productId, index) => {
      units[productId] = entries[index];
    });
  }
  return { lists: { suppliers, branches, inventories, products, currencies }, ret, units };
}

function PurchaseReturnForm() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const isEdit = Boolean(id);
  // ?invoice=<id> (new only): the invoice is chosen and locked.
  const linkInvoiceId = isEdit ? "" : searchParams.get("invoice") || "";
  const { data, loading, error, refreshError, reload, refresh } = useLoadData(() => loadFormData(id), [id ?? ""]);
  const ret = data?.ret ?? null;
  const ready = !loading && !error && data;

  const title =
    isEdit && ready && ret ? (
      <span className="inline-flex flex-wrap items-center gap-3">
        <span>
          تعديل مرتجع الشراء <span dir="ltr">{ret.code}</span>
        </span>
        <StatusBadge status={ret.status} />
      </span>
    ) : isEdit ? (
      "تعديل مرتجع الشراء"
    ) : (
      "مرتجع شراء جديد"
    );
  const back =
    isEdit && ret
      ? { to: `/purchase-returns/${ret.id}`, label: `مرتجع الشراء ${ret.code}` }
      : { to: LIST_LINK, label: "مرتجعات الشراء" };

  function renderContent() {
    if (loading) return <LoadingState />;
    if (error) return <ErrorState message={error} onRetry={reload} />;
    if (isEdit && !ret) {
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
    if (isEdit && !EDITABLE_STATUSES.includes(ret.status)) {
      return (
        <EmptyState
          message={`لا يمكن تعديل هذا المرتجع لأن حالته «${getLabel(DOCUMENT_STATUSES, ret.status)}»`}
          action={
            <Button to={`/purchase-returns/${ret.id}`} variant="secondary">
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
        <ReturnEditor
          key={id ?? `new-${linkInvoiceId}`}
          ret={ret}
          lists={data.lists}
          initialUnits={data.units}
          linkInvoiceId={linkInvoiceId}
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

export default PurchaseReturnForm;
