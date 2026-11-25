// Products (الأصناف) — list page, same structure as pages/Branches.
// Every product needs a category and a unit, so those lists are loaded together with the products
// (for the category filter, the form Selects and the "add these first" hint).
// Row action "الوحدات" opens ProductUnitsModal (وحدات الصنف, Week 2): not for SERVICE products.
import { useState } from "react";
import { Link } from "react-router-dom";
import { Boxes, Pencil, Plus, Trash2 } from "lucide-react";
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
import { ITEM_TYPES, getLabel } from "../../utils/labels";
import { deleteProduct, getCategories, getItemUnits, getProducts } from "./productsApi";
import ProductFormModal from "./components/ProductFormModal";
import ProductUnitsModal from "./components/ProductUnitsModal";

// Prices are Decimal(18,4): show at least 2 and at most 4 decimals ("15" → "15.00").
function renderPrice(value) {
  return <span dir="ltr">{formatMoney(value, { maxDecimals: 4 })}</span>;
}

// Small colored label for the item type: مخزني (blue) / خدمي (gray).
function renderItemType(row) {
  const isService = row.itemType === "SERVICE";
  return (
    <span
      className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${
        isService ? "bg-slate-100 text-slate-600" : "bg-primary-soft text-primary"
      }`}
    >
      {getLabel(ITEM_TYPES, row.itemType)}
    </span>
  );
}

const COLUMNS = [
  { key: "code", label: "الكود" },
  { key: "barcode", label: "الباركود", render: (row) => (row.barcode ? <span dir="ltr">{row.barcode}</span> : "-") },
  { key: "name", label: "الاسم" },
  { key: "category", label: "التصنيف", render: (row) => row.category?.name ?? "-" },
  { key: "primaryItemUnit", label: "الوحدة", render: (row) => row.primaryItemUnit?.name ?? "-" },
  { key: "itemType", label: "النوع", render: renderItemType },
  { key: "retailPrice", label: "سعر التجزئة", render: (row) => renderPrice(row.retailPrice) },
  { key: "wholesalePrice", label: "سعر الجملة", render: (row) => renderPrice(row.wholesalePrice) },
  { key: "bulkWholesalePrice", label: "سعر جملة الجملة", render: (row) => renderPrice(row.bulkWholesalePrice) },
];

// Case-insensitive search in name, code and barcode.
function matchesSearch(product, search) {
  const text = search.trim().toLowerCase();
  if (!text) return true;
  return [product.name, product.code, product.barcode].some((value) =>
    (value || "").toLowerCase().includes(text),
  );
}

// The products, categories and units (for the filter and the form), loaded together.
async function loadPageData() {
  const [products, categories, units] = await Promise.all([getProducts(), getCategories(), getItemUnits()]);
  return { products, categories, units };
}

function Products() {
  // List (+ categories and units for the filter and the form): loaded on mount.
  // reload() = retry (shows LoadingState), refresh() = silent (after add / edit / delete).
  const { data, loading, error, refreshError, reload, refresh } = useLoadData(loadPageData);
  const products = data?.products ?? [];
  const categories = data?.categories ?? [];
  const units = data?.units ?? [];

  // Filters ("" = all)
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");

  // Messages after an action (the success message hides by itself)
  const [successMessage, showSuccessMessage, hideSuccessMessage] = useAutoHideMessage();
  const [actionError, setActionError] = useState("");

  // Add / edit form: productToEdit = null → add mode
  const [formOpen, setFormOpen] = useState(false);
  const [productToEdit, setProductToEdit] = useState(null);

  // Product units (وحدات الصنف) of one product; null = closed.
  const [unitsProduct, setUnitsProduct] = useState(null);

  // Delete
  const [productToDelete, setProductToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  function showSuccess(message) {
    setActionError("");
    showSuccessMessage(message);
  }

  function openAdd() {
    setProductToEdit(null);
    setFormOpen(true);
  }

  function openEdit(product) {
    setProductToEdit(product);
    setFormOpen(true);
  }

  function closeForm() {
    setFormOpen(false);
    setProductToEdit(null);
  }

  function handleSaved(message) {
    closeForm();
    showSuccess(message);
    refresh();
  }

  // The product was deleted meanwhile (the units modal got a 404): close it and refresh the list.
  function handleProductMissing() {
    setUnitsProduct(null);
    hideSuccessMessage();
    setActionError("الصنف غير موجود أو محذوف");
    refresh();
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      await deleteProduct(productToDelete.id);
      showSuccess("تم حذف الصنف بنجاح");
    } catch (err) {
      hideSuccessMessage();
      setActionError(getErrorMessage(err));
    } finally {
      setDeleting(false);
      setProductToDelete(null);
    }
    refresh();
  }

  // A product needs a category and a unit: without them adding is not possible.
  const loaded = !loading && !error;
  const noCategories = loaded && categories.length === 0;
  const noUnits = loaded && units.length === 0;
  const cannotAdd = noCategories || noUnits;

  let addDisabledTitle;
  if (noCategories && noUnits) addDisabledTitle = "أضف تصنيفاً ووحدة أولاً";
  else if (noCategories) addDisabledTitle = "أضف تصنيفاً أولاً";
  else if (noUnits) addDisabledTitle = "أضف وحدة أولاً";

  const categoryOptions = categories.map((category) => ({ value: category.id, label: category.name }));

  // Category filter, type filter and search work together.
  const filteredProducts = products.filter(
    (product) =>
      (!categoryFilter || product.categoryId === categoryFilter) &&
      (!typeFilter || product.itemType === typeFilter) &&
      matchesSearch(product, search),
  );

  // The same add button in the header and in the empty state.
  function renderAddButton() {
    return (
      <Button onClick={openAdd} disabled={cannotAdd} title={addDisabledTitle}>
        <Plus size={18} />
        إضافة صنف
      </Button>
    );
  }

  function renderContent() {
    if (loading) return <LoadingState message="جارٍ تحميل الأصناف..." />;
    if (error) return <ErrorState message={error} onRetry={reload} />;
    if (products.length === 0) {
      return <EmptyState message="لا توجد أصناف بعد" action={renderAddButton()} />;
    }

    return (
      <>
        <div className="mb-4 flex flex-wrap items-center gap-4">
          <Select
            aria-label="تصفية حسب التصنيف"
            value={categoryFilter}
            onChange={(event) => setCategoryFilter(event.target.value)}
            options={categoryOptions}
            placeholder="كل التصنيفات"
            className="w-full max-w-48"
          />
          <Select
            aria-label="تصفية حسب النوع"
            value={typeFilter}
            onChange={(event) => setTypeFilter(event.target.value)}
            options={ITEM_TYPES}
            placeholder="كل الأنواع"
            className="w-full max-w-40"
          />
          <SearchInput value={search} onChange={setSearch} placeholder="ابحث بالاسم أو الكود أو الباركود" />
          <span className="text-sm text-slate-500">عدد الأصناف: {filteredProducts.length}</span>
        </div>

        {filteredProducts.length === 0 ? (
          <EmptyState message="لا توجد نتائج مطابقة" />
        ) : (
          <DataTable
            columns={COLUMNS}
            rows={filteredProducts}
            renderActions={(product) => (
              <>
                {/* SERVICE products have no packing units (no stock). */}
                <Button
                  variant="ghost"
                  className="px-2"
                  title={product.itemType === "SERVICE" ? "الخدمات ليس لها وحدات تعبئة" : "الوحدات"}
                  aria-label={`وحدات ${product.name}`}
                  disabled={product.itemType === "SERVICE"}
                  onClick={() => setUnitsProduct(product)}
                >
                  <Boxes size={16} />
                </Button>
                <Button
                  variant="ghost"
                  className="px-2"
                  title="تعديل"
                  aria-label={`تعديل ${product.name}`}
                  onClick={() => openEdit(product)}
                >
                  <Pencil size={16} />
                </Button>
                <Button
                  variant="danger-ghost"
                  className="px-2"
                  title="حذف"
                  aria-label={`حذف ${product.name}`}
                  onClick={() => setProductToDelete(product)}
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

  const linkClass = "font-medium text-primary underline hover:text-primary-hover";

  return (
    <div>
      <PageHeader title="الأصناف" subtitle="الأصناف وأسعار البيع والتصنيفات" action={renderAddButton()} />

      {cannotAdd && (
        <Alert type="warning" className="mb-4">
          لإضافة صنف يجب إضافة تصنيف ووحدة أولاً.{" "}
          <span className="inline-flex gap-3">
            {noCategories && (
              <Link to="/categories" className={linkClass}>
                إضافة تصنيف
              </Link>
            )}
            {noUnits && (
              <Link to="/units" className={linkClass}>
                إضافة وحدة
              </Link>
            )}
          </span>
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
      {refreshError && (
        <Alert type="error" className="mb-4">
          {refreshError}
        </Alert>
      )}

      {renderContent()}

      {formOpen && (
        <ProductFormModal
          product={productToEdit}
          categories={categories}
          units={units}
          onClose={closeForm}
          onSaved={handleSaved}
          onRefreshLists={refresh}
        />
      )}

      {unitsProduct && (
        <ProductUnitsModal
          product={unitsProduct}
          onClose={() => setUnitsProduct(null)}
          onProductMissing={handleProductMissing}
        />
      )}

      <ConfirmDialog
        open={Boolean(productToDelete)}
        title="حذف الصنف"
        message={`هل أنت متأكد من حذف الصنف "${productToDelete?.name}"؟`}
        confirmLabel="حذف الصنف"
        onConfirm={handleDelete}
        onCancel={() => setProductToDelete(null)}
        loading={deleting}
      />
    </div>
  );
}

export default Products;
