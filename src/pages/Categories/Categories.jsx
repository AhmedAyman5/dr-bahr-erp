// Categories (التصنيفات) — list page, same structure as pages/Branches.
import { useEffect, useState } from "react";
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
import { getErrorMessage } from "../../utils/errors";
import { formatDate } from "../../utils/format";
import { deleteCategory, getCategories } from "./categoriesApi";
import CategoryFormModal from "./components/CategoryFormModal";

const SUCCESS_HIDE_MS = 4000;

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
  // List
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  // Messages after an action
  const [successMessage, setSuccessMessage] = useState("");
  const [actionError, setActionError] = useState("");

  // Add / edit form: categoryToEdit = null → add mode
  const [formOpen, setFormOpen] = useState(false);
  const [categoryToEdit, setCategoryToEdit] = useState(null);

  // Delete
  const [categoryToDelete, setCategoryToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  // Used for the first load, the retry button and after every add / edit / delete.
  async function loadCategories() {
    setLoading(true);
    setError("");
    try {
      setCategories(await getCategories());
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // Loading data on mount is the normal use of an effect; the lint rule cannot tell.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadCategories();
  }, []);

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
    loadCategories();
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      await deleteCategory(categoryToDelete.id);
      showSuccess("تم حذف التصنيف بنجاح");
    } catch (err) {
      setSuccessMessage("");
      if (err.response?.data?.code === "BAD_REQUEST") {
        setActionError(IN_USE_MESSAGE);
      } else {
        setActionError(getErrorMessage(err));
      }
    } finally {
      setDeleting(false);
      setCategoryToDelete(null);
    }
    loadCategories();
  }

  const filteredCategories = categories.filter((category) => matchesSearch(category, search));

  function renderContent() {
    if (loading) return <LoadingState message="جارٍ تحميل التصنيفات..." />;
    if (error) return <ErrorState message={error} onRetry={loadCategories} />;
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
