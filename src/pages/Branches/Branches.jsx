// Branches (الفروع) — the reference CRUD list page.
// New list pages copy this structure: list + <page>Api.js + components/<Name>FormModal.jsx.
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
import { deleteBranch, getBranches } from "./branchesApi";
import BranchFormModal from "./components/BranchFormModal";

const SUCCESS_HIDE_MS = 4000;

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
  // List
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  // Messages after an action
  const [successMessage, setSuccessMessage] = useState("");
  const [actionError, setActionError] = useState("");

  // Add / edit form: branchToEdit = null → add mode
  const [formOpen, setFormOpen] = useState(false);
  const [branchToEdit, setBranchToEdit] = useState(null);

  // Delete
  const [branchToDelete, setBranchToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  // Used for the first load, the retry button and after every add / edit / delete.
  async function loadBranches() {
    setLoading(true);
    setError("");
    try {
      setBranches(await getBranches());
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // Loading data on mount is the normal use of an effect; the lint rule cannot tell.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadBranches();
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
    loadBranches();
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      await deleteBranch(branchToDelete.id);
      showSuccess("تم حذف الفرع بنجاح");
    } catch (err) {
      setSuccessMessage("");
      setActionError(getErrorMessage(err));
    } finally {
      setDeleting(false);
      setBranchToDelete(null);
    }
    loadBranches();
  }

  const filteredBranches = branches.filter((branch) => matchesSearch(branch, search));

  function renderContent() {
    if (loading) return <LoadingState message="جارٍ تحميل الفروع..." />;
    if (error) return <ErrorState message={error} onRetry={loadBranches} />;
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
