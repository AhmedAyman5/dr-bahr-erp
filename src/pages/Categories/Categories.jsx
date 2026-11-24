// Categories (التصنيفات) — list page, same structure as pages/Branches.
import { useState } from "react";
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
import useAutoHideMessage from "../../hooks/useAutoHideMessage";
import useLoadData from "../../hooks/useLoadData";
import { getErrorMessage } from "../../utils/errors";
import { formatDate } from "../../utils/format";
import { deleteCategory, getCategories } from "./categoriesApi";
import CategoryFormModal from "./components/CategoryFormModal";

// Shown when DELETE returns BAD_REQUEST: active products still use this category.
const IN_USE_MESSAGE =
  "لا يمكن حذف هذا التصنيف لأنه مستخدم في أصناف حالية. انقل هذه الأصناف إلى تصنيف آخر أو احذفها أولاً.";

const COLUMNS = [
  { key: "code", label: "الكود" },
  { key: "name", label: "الاسم" },
  { key: "createdAt", label: "تاريخ الإضافة", render: (row) => formatDate(row.createdAt) },
];

// Case-insensitive search in name and code.
function matchesSearch(category, search) {
  const text = search.trim().toLowerCase();
  if (!text) return true;
  return [category.name, category.code].some((value) => (value || "").toLowerCase().includes(text));
}

function Categories() {
  // List: loaded on mount. reload() = retry (shows LoadingState), refresh() = silent (after add / edit / delete).
  const { data, loading, error, refreshError, reload, refresh } = useLoadData(getCategories);
  const categories = data ?? [];
  const [search, setSearch] = useState("");

  // Messages after an action (the success message hides by itself)
  const [successMessage, showSuccessMessage, hideSuccessMessage] = useAutoHideMessage();
  const [actionError, setActionError] = useState("");

  // Add / edit form: categoryToEdit = null → add mode
  const [formOpen, setFormOpen] = useState(false);
  const [categoryToEdit, setCategoryToEdit] = useState(null);

  // Delete
  const [categoryToDelete, setCategoryToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  function showSuccess(message) {
    setActionError("");
    showSuccessMessage(message);
  }

  function openAdd() {
    setCategoryToEdit(null);
    setFormOpen(true);
  }

  function openEdit(category) {
    setCategoryToEdit(category);
    setFormOpen(true);
  }

  function closeForm() {
    setFormOpen(false);
    setCategoryToEdit(null);
  }

  function handleSaved(message) {
    closeForm();
    showSuccess(message);
    refresh();
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      await deleteCategory(categoryToDelete.id);
      showSuccess("تم حذف التصنيف بنجاح");
    } catch (err) {
      hideSuccessMessage();
      if (err.response?.data?.code === "BAD_REQUEST") {
        setActionError(IN_USE_MESSAGE);
      } else {
        setActionError(getErrorMessage(err));
      }
    } finally {
      setDeleting(false);
      setCategoryToDelete(null);
    }
    refresh();
  }

  const filteredCategories = categories.filter((category) => matchesSearch(category, search));

  function renderContent() {
    if (loading) return <LoadingState message="جارٍ تحميل التصنيفات..." />;
    if (error) return <ErrorState message={error} onRetry={reload} />;
    if (categories.length === 0) {
      return (
        <EmptyState
          message="لا توجد تصنيفات بعد"
          action={
            <Button onClick={openAdd}>
              <Plus size={18} />
              إضافة تصنيف
            </Button>
          }
        />
      );
    }

    return (
      <>
        <div className="mb-4 flex flex-wrap items-center gap-4">
          <SearchInput value={search} onChange={setSearch} placeholder="ابحث بالاسم أو الكود" />
          <span className="text-sm text-slate-500">عدد التصنيفات: {filteredCategories.length}</span>
        </div>

        {filteredCategories.length === 0 ? (
          <EmptyState message="لا توجد نتائج مطابقة للبحث" />
        ) : (
          <DataTable
            columns={COLUMNS}
            rows={filteredCategories}
            renderActions={(category) => (
              <>
                <Button
                  variant="ghost"
                  className="px-2"
                  title="تعديل"
                  aria-label={`تعديل ${category.name}`}
                  onClick={() => openEdit(category)}
                >
                  <Pencil size={16} />
                </Button>
                <Button
                  variant="danger-ghost"
                  className="px-2"
                  title="حذف"
                  aria-label={`حذف ${category.name}`}
                  onClick={() => setCategoryToDelete(category)}
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

  return (
    <div>
      <PageHeader
        title="التصنيفات"
        subtitle="تصنيفات الأصناف مثل المشروبات والمنظفات"
        action={
          <Button onClick={openAdd}>
            <Plus size={18} />
            إضافة تصنيف
          </Button>
        }
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

      {formOpen && (
        <CategoryFormModal category={categoryToEdit} onClose={closeForm} onSaved={handleSaved} />
      )}

      <ConfirmDialog
        open={Boolean(categoryToDelete)}
        title="حذف التصنيف"
        message={`هل أنت متأكد من حذف التصنيف "${categoryToDelete?.name}"؟`}
        confirmLabel="حذف التصنيف"
        onConfirm={handleDelete}
        onCancel={() => setCategoryToDelete(null)}
        loading={deleting}
      />
    </div>
  );
}

export default Categories;
