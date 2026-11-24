// Item Units (الوحدات) — list page, same structure as pages/Branches.
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
import { deleteItemUnit, getItemUnits } from "./itemUnitsApi";
import ItemUnitFormModal from "./components/ItemUnitFormModal";

// Shown when DELETE returns BAD_REQUEST: active products still use this unit.
const IN_USE_MESSAGE =
  "لا يمكن حذف هذه الوحدة لأنها الوحدة الأساسية لأصناف حالية. غيّر وحدة هذه الأصناف أو احذفها أولاً.";

const COLUMNS = [
  { key: "code", label: "الكود" },
  { key: "name", label: "الاسم" },
  { key: "createdAt", label: "تاريخ الإضافة", render: (row) => formatDate(row.createdAt) },
];

// Case-insensitive search in name and code.
function matchesSearch(itemUnit, search) {
  const text = search.trim().toLowerCase();
  if (!text) return true;
  return [itemUnit.name, itemUnit.code].some((value) => (value || "").toLowerCase().includes(text));
}

function ItemUnits() {
  // List: loaded on mount. reload() = retry (shows LoadingState), refresh() = silent (after add / edit / delete).
  const { data, loading, error, refreshError, reload, refresh } = useLoadData(getItemUnits);
  const itemUnits = data ?? [];
  const [search, setSearch] = useState("");

  // Messages after an action (the success message hides by itself)
  const [successMessage, showSuccessMessage, hideSuccessMessage] = useAutoHideMessage();
  const [actionError, setActionError] = useState("");

  // Add / edit form: unitToEdit = null → add mode
  const [formOpen, setFormOpen] = useState(false);
  const [unitToEdit, setUnitToEdit] = useState(null);

  // Delete
  const [unitToDelete, setUnitToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  function showSuccess(message) {
    setActionError("");
    showSuccessMessage(message);
  }

  function openAdd() {
    setUnitToEdit(null);
    setFormOpen(true);
  }

  function openEdit(itemUnit) {
    setUnitToEdit(itemUnit);
    setFormOpen(true);
  }

  function closeForm() {
    setFormOpen(false);
    setUnitToEdit(null);
  }

  function handleSaved(message) {
    closeForm();
    showSuccess(message);
    refresh();
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      await deleteItemUnit(unitToDelete.id);
      showSuccess("تم حذف الوحدة بنجاح");
    } catch (err) {
      hideSuccessMessage();
      if (err.response?.data?.code === "BAD_REQUEST") {
        setActionError(IN_USE_MESSAGE);
      } else {
        setActionError(getErrorMessage(err));
      }
    } finally {
      setDeleting(false);
      setUnitToDelete(null);
    }
    refresh();
  }

  const filteredUnits = itemUnits.filter((itemUnit) => matchesSearch(itemUnit, search));

  function renderContent() {
    if (loading) return <LoadingState message="جارٍ تحميل الوحدات..." />;
    if (error) return <ErrorState message={error} onRetry={reload} />;
    if (itemUnits.length === 0) {
      return (
        <EmptyState
          message="لا توجد وحدات بعد"
          action={
            <Button onClick={openAdd}>
              <Plus size={18} />
              إضافة وحدة
            </Button>
          }
        />
      );
    }

    return (
      <>
        <div className="mb-4 flex flex-wrap items-center gap-4">
          <SearchInput value={search} onChange={setSearch} placeholder="ابحث بالاسم أو الكود" />
          <span className="text-sm text-slate-500">عدد الوحدات: {filteredUnits.length}</span>
        </div>

        {filteredUnits.length === 0 ? (
          <EmptyState message="لا توجد نتائج مطابقة للبحث" />
        ) : (
          <DataTable
            columns={COLUMNS}
            rows={filteredUnits}
            renderActions={(itemUnit) => (
              <>
                <Button
                  variant="ghost"
                  className="px-2"
                  title="تعديل"
                  aria-label={`تعديل ${itemUnit.name}`}
                  onClick={() => openEdit(itemUnit)}
                >
                  <Pencil size={16} />
                </Button>
                <Button
                  variant="danger-ghost"
                  className="px-2"
                  title="حذف"
                  aria-label={`حذف ${itemUnit.name}`}
                  onClick={() => setUnitToDelete(itemUnit)}
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
        title="الوحدات"
        subtitle="وحدات القياس مثل القطعة والكرتونة والكيلو"
        action={
          <Button onClick={openAdd}>
            <Plus size={18} />
            إضافة وحدة
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

      {formOpen && <ItemUnitFormModal itemUnit={unitToEdit} onClose={closeForm} onSaved={handleSaved} />}

      <ConfirmDialog
        open={Boolean(unitToDelete)}
        title="حذف الوحدة"
        message={`هل أنت متأكد من حذف الوحدة "${unitToDelete?.name}"؟`}
        confirmLabel="حذف الوحدة"
        onConfirm={handleDelete}
        onCancel={() => setUnitToDelete(null)}
        loading={deleting}
      />
    </div>
  );
}

export default ItemUnits;
