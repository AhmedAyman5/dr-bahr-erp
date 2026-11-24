// Branches (الفروع) — the reference CRUD list page.
// New list pages copy this structure: list + <page>Api.js + components/<Name>FormModal.jsx.
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
import { deleteBranch, getBranches } from "./branchesApi";
import BranchFormModal from "./components/BranchFormModal";

const COLUMNS = [
  { key: "code", label: "الكود" },
  { key: "name", label: "الاسم" },
  { key: "address", label: "العنوان", render: (row) => row.address || "-" },
  { key: "createdAt", label: "تاريخ الإضافة", render: (row) => formatDate(row.createdAt) },
];

// Case-insensitive search in name, code and address.
function matchesSearch(branch, search) {
  const text = search.trim().toLowerCase();
  if (!text) return true;
  return [branch.name, branch.code, branch.address].some((value) =>
    (value || "").toLowerCase().includes(text),
  );
}

function Branches() {
  // List: loaded on mount. reload() = retry (shows LoadingState), refresh() = silent (after add / edit / delete).
  const { data, loading, error, refreshError, reload, refresh } = useLoadData(getBranches);
  const branches = data ?? [];
  const [search, setSearch] = useState("");

  // Messages after an action (the success message hides by itself)
  const [successMessage, showSuccessMessage, hideSuccessMessage] = useAutoHideMessage();
  const [actionError, setActionError] = useState("");

  // Add / edit form: branchToEdit = null → add mode
  const [formOpen, setFormOpen] = useState(false);
  const [branchToEdit, setBranchToEdit] = useState(null);

  // Delete
  const [branchToDelete, setBranchToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  function showSuccess(message) {
    setActionError("");
    showSuccessMessage(message);
  }

  function openAdd() {
    setBranchToEdit(null);
    setFormOpen(true);
  }

  function openEdit(branch) {
    setBranchToEdit(branch);
    setFormOpen(true);
  }

  function closeForm() {
    setFormOpen(false);
    setBranchToEdit(null);
  }

  function handleSaved(message) {
    closeForm();
    showSuccess(message);
    refresh();
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      await deleteBranch(branchToDelete.id);
      showSuccess("تم حذف الفرع بنجاح");
    } catch (err) {
      hideSuccessMessage();
      setActionError(getErrorMessage(err));
    } finally {
      setDeleting(false);
      setBranchToDelete(null);
    }
    refresh();
  }

  const filteredBranches = branches.filter((branch) => matchesSearch(branch, search));

  function renderContent() {
    if (loading) return <LoadingState message="جارٍ تحميل الفروع..." />;
    if (error) return <ErrorState message={error} onRetry={reload} />;
    if (branches.length === 0) {
      return (
        <EmptyState
          message="لا توجد فروع بعد"
          action={
            <Button onClick={openAdd}>
              <Plus size={18} />
              إضافة فرع
            </Button>
          }
        />
      );
    }

    return (
      <>
        <div className="mb-4 flex flex-wrap items-center gap-4">
          <SearchInput value={search} onChange={setSearch} placeholder="ابحث بالاسم أو الكود أو العنوان" />
          <span className="text-sm text-slate-500">عدد الفروع: {filteredBranches.length}</span>
        </div>

        {filteredBranches.length === 0 ? (
          <EmptyState message="لا توجد نتائج مطابقة للبحث" />
        ) : (
          <DataTable
            columns={COLUMNS}
            rows={filteredBranches}
            renderActions={(branch) => (
              <>
                <Button
                  variant="ghost"
                  className="px-2"
                  title="تعديل"
                  aria-label={`تعديل ${branch.name}`}
                  onClick={() => openEdit(branch)}
                >
                  <Pencil size={16} />
                </Button>
                <Button
                  variant="danger-ghost"
                  className="px-2"
                  title="حذف"
                  aria-label={`حذف ${branch.name}`}
                  onClick={() => setBranchToDelete(branch)}
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
        title="الفروع"
        subtitle="إدارة فروع الشركة"
        action={
          <Button onClick={openAdd}>
            <Plus size={18} />
            إضافة فرع
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

      {formOpen && <BranchFormModal branch={branchToEdit} onClose={closeForm} onSaved={handleSaved} />}

      <ConfirmDialog
        open={Boolean(branchToDelete)}
        title="حذف الفرع"
        message={`هل أنت متأكد من حذف الفرع "${branchToDelete?.name}"؟`}
        confirmLabel="حذف الفرع"
        onConfirm={handleDelete}
        onCancel={() => setBranchToDelete(null)}
        loading={deleting}
      />
    </div>
  );
}

export default Branches;
