// Inventories (المخازن = warehouses) — list page, same structure as pages/Branches.
// Every warehouse belongs to a branch; the API returns only branchId, so the branch
// names come from the branches list (loaded together with the warehouses).
import { useState } from "react";
import { Link } from "react-router-dom";
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
import { formatDate } from "../../utils/format";
import { deleteInventory, getBranches, getInventories } from "./inventoriesApi";
import InventoryFormModal from "./components/InventoryFormModal";

// Case-insensitive search in name and address.
function matchesSearch(inventory, search) {
  const text = search.trim().toLowerCase();
  if (!text) return true;
  return [inventory.name, inventory.address].some((value) => (value || "").toLowerCase().includes(text));
}

// The warehouses and the branches (for their names, the filter and the form), loaded together.
async function loadPageData() {
  const [inventories, branches] = await Promise.all([getInventories(), getBranches()]);
  return { inventories, branches };
}

function Inventories() {
  // List (+ branches for names, filter and form): loaded on mount.
  // reload() = retry (shows LoadingState), refresh() = silent (after add / edit / delete).
  const { data, loading, error, refreshError, reload, refresh } = useLoadData(loadPageData);
  const inventories = data?.inventories ?? [];
  const branches = data?.branches ?? [];
  const [search, setSearch] = useState("");
  const [branchFilter, setBranchFilter] = useState(""); // "" = all branches

  // Messages after an action (the success message hides by itself)
  const [successMessage, showSuccessMessage, hideSuccessMessage] = useAutoHideMessage();
  const [actionError, setActionError] = useState("");

  // Add / edit form: inventoryToEdit = null → add mode
  const [formOpen, setFormOpen] = useState(false);
  const [inventoryToEdit, setInventoryToEdit] = useState(null);

  // Delete
  const [inventoryToDelete, setInventoryToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  function showSuccess(message) {
    setActionError("");
    showSuccessMessage(message);
  }

  function openAdd() {
    setInventoryToEdit(null);
    setFormOpen(true);
  }

  function openEdit(inventory) {
    setInventoryToEdit(inventory);
    setFormOpen(true);
  }

  function closeForm() {
    setFormOpen(false);
    setInventoryToEdit(null);
  }

  function handleSaved(message) {
    closeForm();
    showSuccess(message);
    refresh();
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      await deleteInventory(inventoryToDelete.id);
      showSuccess("تم حذف المخزن بنجاح");
    } catch (err) {
      hideSuccessMessage();
      setActionError(getErrorMessage(err));
    } finally {
      setDeleting(false);
      setInventoryToDelete(null);
    }
    refresh();
  }

  // Branch name by id; undefined when the branch is not in the list (deleted).
  function findBranchName(branchId) {
    return branches.find((branch) => branch.id === branchId)?.name;
  }

  const columns = [
    { key: "name", label: "الاسم" },
    {
      key: "branchId",
      label: "الفرع",
      render: (row) => findBranchName(row.branchId) ?? <span className="text-slate-400">فرع محذوف</span>,
    },
    { key: "address", label: "العنوان", render: (row) => row.address || "-" },
    { key: "createdAt", label: "تاريخ الإضافة", render: (row) => formatDate(row.createdAt) },
  ];

  const noBranches = !loading && !error && branches.length === 0;
  const branchOptions = branches.map((branch) => ({ value: branch.id, label: branch.name }));

  // Branch filter and search work together.
  const filteredInventories = inventories.filter(
    (inventory) =>
      (!branchFilter || inventory.branchId === branchFilter) && matchesSearch(inventory, search),
  );

  // The same add button in the header and in the empty state.
  function renderAddButton() {
    return (
      <Button onClick={openAdd} disabled={noBranches} title={noBranches ? "أضف فرعاً أولاً" : undefined}>
        <Plus size={18} />
        إضافة مخزن
      </Button>
    );
  }

  function renderContent() {
    if (loading) return <LoadingState message="جارٍ تحميل المخازن..." />;
    if (error) return <ErrorState message={error} onRetry={reload} />;
    if (inventories.length === 0) {
      return <EmptyState message="لا توجد مخازن بعد" action={renderAddButton()} />;
    }

    return (
      <>
        <div className="mb-4 flex flex-wrap items-center gap-4">
          <Select
            aria-label="تصفية حسب الفرع"
            value={branchFilter}
            onChange={(event) => setBranchFilter(event.target.value)}
            options={branchOptions}
            placeholder="كل الفروع"
            className="w-full max-w-56"
          />
          <SearchInput value={search} onChange={setSearch} placeholder="ابحث بالاسم أو العنوان" />
          <span className="text-sm text-slate-500">عدد المخازن: {filteredInventories.length}</span>
        </div>

        {filteredInventories.length === 0 ? (
          <EmptyState message="لا توجد نتائج مطابقة" />
        ) : (
          <DataTable
            columns={columns}
            rows={filteredInventories}
            renderActions={(inventory) => (
              <>
                <Button
                  variant="ghost"
                  className="px-2"
                  title="تعديل"
                  aria-label={`تعديل ${inventory.name}`}
                  onClick={() => openEdit(inventory)}
                >
                  <Pencil size={16} />
                </Button>
                <Button
                  variant="danger-ghost"
                  className="px-2"
                  title="حذف"
                  aria-label={`حذف ${inventory.name}`}
                  onClick={() => setInventoryToDelete(inventory)}
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
      <PageHeader title="المخازن" subtitle="مخازن الشركة وتبعيتها للفروع" action={renderAddButton()} />

      {noBranches && (
        <Alert type="warning" className="mb-4">
          لإضافة مخزن يجب إضافة فرع أولاً.{" "}
          <Link to="/branches" className="font-medium text-primary underline hover:text-primary-hover">
            إضافة فرع
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
      {refreshError && (
        <Alert type="error" className="mb-4">
          {refreshError}
        </Alert>
      )}

      {renderContent()}

      {formOpen && (
        <InventoryFormModal
          inventory={inventoryToEdit}
          branches={branches}
          defaultBranchId={branchFilter}
          onClose={closeForm}
          onSaved={handleSaved}
        />
      )}

      <ConfirmDialog
        open={Boolean(inventoryToDelete)}
        title="حذف المخزن"
        message={`هل أنت متأكد من حذف المخزن "${inventoryToDelete?.name}"؟`}
        confirmLabel="حذف المخزن"
        onConfirm={handleDelete}
        onCancel={() => setInventoryToDelete(null)}
        loading={deleting}
      />
    </div>
  );
}

export default Inventories;
