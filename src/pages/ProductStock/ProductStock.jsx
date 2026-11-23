// Product Stock (أرصدة المخزون) — the products of ONE warehouse with their quantity and cost price.
// Same structure as pages/Branches, plus a warehouse Select at the top.
// The selected warehouse lives in the URL (?inventory=<id>), so a refresh keeps it.
// No totals / stock value here: calculations belong to the backend.
import { useEffect, useRef, useState } from "react";
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
import { getErrorMessage } from "../../utils/errors";
import { formatMoney } from "../../utils/format";
import { getBranches, getInventories, getProducts, getStock, removeStock } from "./productStockApi";
import StockFormModal from "./components/StockFormModal";

const SUCCESS_HIDE_MS = 4000;

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

function ProductStock() {
  // Selected warehouse id from the URL ("" = none).
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedId = searchParams.get("inventory") || "";

  // Base data: warehouses (+ branches for their labels) and products (for the add form).
  const [inventories, setInventories] = useState([]);
  const [branches, setBranches] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Stock of the selected warehouse.
  const [stock, setStock] = useState([]);
  const [stockLoading, setStockLoading] = useState(false);
  const [stockError, setStockError] = useState("");
  const [search, setSearch] = useState("");
  // Number of the latest stock request: an older answer (previous warehouse) is ignored.
  const latestStockRequest = useRef(0);

  // Messages after an action
  const [successMessage, setSuccessMessage] = useState("");
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

  // First load + retry.
  async function loadBaseData() {
    setLoading(true);
    setError("");
    try {
      const [inventoriesData, branchesData, productsData] = await Promise.all([
        getInventories(),
        getBranches(),
        getProducts(),
      ]);
      setInventories(inventoriesData);
      setBranches(branchesData);
      setProducts(productsData);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  // Stock of one warehouse: after choosing it, retry, and every add / edit / remove.
  async function loadStock(inventoryId) {
    latestStockRequest.current += 1;
    const requestNumber = latestStockRequest.current;
    setStockLoading(true);
    setStockError("");
    setStock([]);
    try {
      const data = await getStock(inventoryId);
      if (requestNumber === latestStockRequest.current) setStock(data);
    } catch (err) {
      if (requestNumber === latestStockRequest.current) setStockError(getErrorMessage(err));
    } finally {
      if (requestNumber === latestStockRequest.current) setStockLoading(false);
    }
  }

  useEffect(() => {
    // Loading data on mount is the normal use of an effect; the lint rule cannot tell.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadBaseData();
  }, []);

  // Only a warehouse that exists in the list is loaded (an old id in the URL is never requested).
  const selectedInventory = inventories.find((inventory) => inventory.id === selectedId);
  const activeId = selectedInventory?.id ?? "";

  // Keep the URL valid once the warehouses are known: an id that no longer exists is cleared,
  // and when there is exactly one warehouse it is selected automatically.
  useEffect(() => {
    if (loading || error || selectedInventory) return;
    const autoId = inventories.length === 1 ? inventories[0].id : "";
    if (autoId !== selectedId) {
      setSearchParams(autoId ? { inventory: autoId } : {}, { replace: true });
    }
  }, [loading, error, inventories, selectedInventory, selectedId, setSearchParams]);

  useEffect(() => {
    if (!activeId) return;
    // Same as above: load the stock whenever another (existing) warehouse is selected.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadStock(activeId);
  }, [activeId]);

  // Hide the success message by itself after a few seconds.
  useEffect(() => {
    if (!successMessage) return;
    const timer = setTimeout(() => setSuccessMessage(""), SUCCESS_HIDE_MS);
    return () => clearTimeout(timer);
  }, [successMessage]);

  function showSuccess(message) {
    setActionError("");
    setSuccessMessage(message);
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
    loadStock(activeId);
  }

  async function handleRemove() {
    setRemoving(true);
    try {
      await removeStock(recordToRemove.id);
      showSuccess("تمت إزالة الصنف من المخزن بنجاح");
    } catch (err) {
      setSuccessMessage("");
      setActionError(getErrorMessage(err));
    } finally {
      setRemoving(false);
      setRecordToRemove(null);
    }
    loadStock(activeId);
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
    if (stockError) return <ErrorState message={stockError} onRetry={() => loadStock(activeId)} />;
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
    if (error) return <ErrorState message={error} onRetry={loadBaseData} />;
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
        <Alert type="success" className="mb-4" onClose={() => setSuccessMessage("")}>
          {successMessage}
        </Alert>
      )}
      {actionError && (
        <Alert type="error" className="mb-4" onClose={() => setActionError("")}>
          {actionError}
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
