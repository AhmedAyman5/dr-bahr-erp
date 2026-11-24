// Product Stock (أرصدة المخزون) — the products of ONE warehouse with their quantity and cost price.
// Same structure as pages/Branches, plus a warehouse Select at the top.
// The selected warehouse lives in the URL (?inventory=<id>), so a refresh keeps it.
// No totals / stock value here: calculations belong to the backend.
import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Pencil, Plus, Trash2 } from "lucide-react";
import PageHeader from "../../components/layout/PageHeader";
import Alert from "../../components/ui/Alert";
import Button from "../../components/ui/Button";
import ConfirmDialog from "../../components/ui/ConfirmDialog";
import DataTable from "../../components/ui/DataTable";
import EmptyState from "../../components/ui/EmptyState";
import ErrorState from "../../components/ui/ErrorState";
import LoadingState from "../../components/ui/LoadingState";
import SearchInput from "../../components/ui/SearchInput";
import Select from "../../components/ui/Select";
import useAutoHideMessage from "../../hooks/useAutoHideMessage";
import useLoadData from "../../hooks/useLoadData";
import { getErrorMessage } from "../../utils/errors";
import { formatMoney } from "../../utils/format";
import { getBranches, getInventories, getProducts, getStock, removeStock } from "./productStockApi";
import StockFormModal from "./components/StockFormModal";

// Quantity and cost are Decimal(18,4): at least 2, at most 4 decimals.
function renderNumber(value) {
  return <span dir="ltr">{formatMoney(value, { maxDecimals: 4 })}</span>;
}

// Low stock: the product has a reorder limit (> 0) and the quantity is at or below it.
function isLowStock(record) {
  const reorderLimit = Number(record.product?.reorderLimit);
  return reorderLimit > 0 && Number(record.quantity) <= reorderLimit;
}

function renderQuantity(record) {
  return (
    <div className="flex items-center gap-2">
      {renderNumber(record.quantity)}
      {isLowStock(record) && (
        <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
          أقل من حد الطلب
        </span>
      )}
    </div>
  );
}

const COLUMNS = [
  { key: "productCode", label: "كود الصنف", render: (row) => row.product?.code ?? "-" },
  { key: "productName", label: "الصنف", render: (row) => row.product?.name ?? "-" },
  { key: "category", label: "التصنيف", render: (row) => row.product?.category?.name ?? "-" },
  { key: "unit", label: "الوحدة", render: (row) => row.product?.primaryItemUnit?.name ?? "-" },
  { key: "quantity", label: "الكمية", render: renderQuantity },
  { key: "costPrice", label: "سعر التكلفة", render: (row) => renderNumber(row.costPrice) },
];

// Case-insensitive search in the product name, code and barcode.
function matchesSearch(record, search) {
  const text = search.trim().toLowerCase();
  if (!text) return true;
  const { name, code, barcode } = record.product || {};
  return [name, code, barcode].some((value) => (value || "").toLowerCase().includes(text));
}

// Warehouses (+ branches for their labels) and products (for the add form), loaded together.
async function loadBaseData() {
  const [inventories, branches, products] = await Promise.all([getInventories(), getBranches(), getProducts()]);
  return { inventories, branches, products };
}

function ProductStock() {
  // Selected warehouse id from the URL ("" = none).
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedId = searchParams.get("inventory") || "";

  // Base data, loaded on mount. reload = retry, refreshBase = silent (a chosen product was deleted meanwhile).
  const {
    data: baseData,
    loading,
    error,
    refreshError: baseRefreshError,
    reload,
    refresh: refreshBase,
  } = useLoadData(loadBaseData);
  const inventories = baseData?.inventories ?? [];
  const branches = baseData?.branches ?? [];
  const products = baseData?.products ?? [];

  // Only a warehouse that exists in the list is loaded (an old id in the URL is never requested).
  const selectedInventory = inventories.find((inventory) => inventory.id === selectedId);
  const activeId = selectedInventory?.id ?? "";

  // Stock of the selected warehouse: loaded again whenever another warehouse is selected.
  // An answer for a previous warehouse (fast switching) is ignored by the hook.
  // refreshStock = silent, after every add / edit / remove.
  const {
    data: stockData,
    loading: stockLoading,
    error: stockError,
    refreshError: stockRefreshError,
    reload: reloadStock,
    refresh: refreshStock,
  } = useLoadData(async () => (activeId ? getStock(activeId) : []), [activeId]);
  const stock = stockData ?? [];
  const [search, setSearch] = useState("");

  // Messages after an action (the success message hides by itself)
  const [successMessage, showSuccessMessage, hideSuccessMessage] = useAutoHideMessage();
  const [actionError, setActionError] = useState("");

  // Add / edit form: recordToEdit = null → add mode
  const [formOpen, setFormOpen] = useState(false);
  const [recordToEdit, setRecordToEdit] = useState(null);

  // Remove
  const [recordToRemove, setRecordToRemove] = useState(null);
  const [removing, setRemoving] = useState(false);

  function selectInventory(id) {
    setSearch("");
    setSearchParams(id ? { inventory: id } : {});
  }

  // Keep the URL valid once the warehouses are known: an id that no longer exists is cleared,
  // and when there is exactly one warehouse it is selected automatically.
  const autoId = inventories.length === 1 ? inventories[0].id : "";
  const fixUrl = !loading && !error && !selectedInventory && autoId !== selectedId;
  useEffect(() => {
    if (fixUrl) setSearchParams(autoId ? { inventory: autoId } : {}, { replace: true });
  }, [fixUrl, autoId, setSearchParams]);

  function showSuccess(message) {
    setActionError("");
    showSuccessMessage(message);
  }

  function openAdd() {
    setRecordToEdit(null);
    setFormOpen(true);
  }

  function openEdit(record) {
    setRecordToEdit(record);
    setFormOpen(true);
  }

  function closeForm() {
    setFormOpen(false);
    setRecordToEdit(null);
  }

  function handleSaved(message) {
    closeForm();
    showSuccess(message);
    refreshStock();
  }

  async function handleRemove() {
    setRemoving(true);
    try {
      await removeStock(recordToRemove.id);
      showSuccess("تمت إزالة الصنف من المخزن بنجاح");
    } catch (err) {
      hideSuccessMessage();
      setActionError(getErrorMessage(err));
    } finally {
      setRemoving(false);
      setRecordToRemove(null);
    }
    refreshStock();
  }

  // "<warehouse> — <branch>" for the Select and the forms.
  function inventoryLabel(inventory) {
    const branchName = branches.find((branch) => branch.id === inventory.branchId)?.name ?? "فرع محذوف";
    return `${inventory.name} — ${branchName}`;
  }

  const noInventories = !loading && !error && inventories.length === 0;
  const inventoryOptions = inventories.map((inventory) => ({ value: inventory.id, label: inventoryLabel(inventory) }));

  // The add form lists only stock products (not services) that are not in this warehouse yet.
  const stockProducts = products.filter((product) => product.itemType === "STOCK");
  const availableProducts = stockProducts.filter(
    (product) => !stock.some((record) => record.productId === product.id),
  );

  const filteredStock = stock.filter((record) => matchesSearch(record, search));

  // The same add button in the header and in the empty state.
  function renderAddButton() {
    return (
      <Button
        onClick={openAdd}
        disabled={!activeId || stockLoading || Boolean(stockError)}
        title={activeId ? undefined : "اختر مخزناً أولاً"}
      >
        <Plus size={18} />
        إضافة صنف للمخزن
      </Button>
    );
  }

  function renderStock() {
    if (!activeId) return <EmptyState message="اختر مخزناً لعرض أرصدته" />;
    if (stockLoading) return <LoadingState message="جارٍ تحميل أرصدة المخزن..." />;
    if (stockError) return <ErrorState message={stockError} onRetry={reloadStock} />;
    if (stock.length === 0) {
      return <EmptyState message="لا توجد أصناف في هذا المخزن بعد" action={renderAddButton()} />;
    }

    return (
      <>
        <div className="mb-4 flex flex-wrap items-center gap-4">
          <SearchInput value={search} onChange={setSearch} placeholder="ابحث باسم الصنف أو الكود أو الباركود" />
          <span className="text-sm text-slate-500">عدد الأصناف في المخزن: {filteredStock.length}</span>
        </div>

        {filteredStock.length === 0 ? (
          <EmptyState message="لا توجد نتائج مطابقة للبحث" />
        ) : (
          <DataTable
            columns={COLUMNS}
            rows={filteredStock}
            renderActions={(record) => (
              <>
                <Button
                  variant="ghost"
                  className="px-2"
                  title="تعديل"
                  aria-label={`تعديل ${record.product?.name}`}
                  onClick={() => openEdit(record)}
                >
                  <Pencil size={16} />
                </Button>
                <Button
                  variant="danger-ghost"
                  className="px-2"
                  title="إزالة من المخزن"
                  aria-label={`إزالة ${record.product?.name}`}
                  onClick={() => setRecordToRemove(record)}
                >
                  <Trash2 size={16} />
                </Button>
              </>
            )}
          />
        )}
      </>
    );
  }

  function renderContent() {
    if (loading) return <LoadingState message="جارٍ تحميل المخازن..." />;
    if (error) return <ErrorState message={error} onRetry={reload} />;
    if (noInventories) return null; // the hint above explains what to do

    return (
      <>
        <Select
          aria-label="المخزن"
          value={selectedId}
          onChange={(event) => selectInventory(event.target.value)}
          options={inventoryOptions}
          placeholder="اختر المخزن"
          className="mb-4 w-full max-w-sm"
        />
        {renderStock()}
      </>
    );
  }

  return (
    <div>
      <PageHeader title="أرصدة المخزون" subtitle="كميات الأصناف وتكلفتها في كل مخزن" action={renderAddButton()} />

      {noInventories && (
        <Alert type="warning" className="mb-4">
          لعرض أرصدة المخزون يجب إضافة مخزن أولاً.{" "}
          <Link to="/inventories" className="font-medium text-primary underline hover:text-primary-hover">
            إضافة مخزن
          </Link>
        </Alert>
      )}
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
      {(baseRefreshError || stockRefreshError) && (
        <Alert type="error" className="mb-4">
          {baseRefreshError || stockRefreshError}
        </Alert>
      )}

      {renderContent()}

      {formOpen && selectedInventory && (
        <StockFormModal
          record={recordToEdit}
          inventoryId={activeId}
          inventoryLabel={inventoryLabel(selectedInventory)}
          availableProducts={availableProducts}
          hasStockProducts={stockProducts.length > 0}
          onClose={closeForm}
          onSaved={handleSaved}
          onRefreshLists={refreshBase}
        />
      )}

      <ConfirmDialog
        open={Boolean(recordToRemove)}
        title="إزالة الصنف من المخزن"
        message={`هل أنت متأكد من إزالة "${recordToRemove?.product?.name}" من "${selectedInventory?.name}"؟`}
        confirmLabel="إزالة الصنف"
        onConfirm={handleRemove}
        onCancel={() => setRecordToRemove(null)}
        loading={removing}
      />
    </div>
  );
}

export default ProductStock;
