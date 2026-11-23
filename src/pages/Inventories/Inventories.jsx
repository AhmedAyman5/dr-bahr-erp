// Inventories (المخازن = warehouses) — list page, same structure as pages/Branches.
// Every warehouse belongs to a branch; the API returns only branchId, so the branch
// names come from the branches list (loaded together with the warehouses).
import { useEffect, useState } from "react";
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
import { getErrorMessage } from "../../utils/errors";
import { formatDate } from "../../utils/format";
import { deleteInventory, getBranches, getInventories } from "./inventoriesApi";
import InventoryFormModal from "./components/InventoryFormModal";

const SUCCESS_HIDE_MS = 4000;

// Case-insensitive search in name and address.
function matchesSearch(inventory, search) {
  const text = search.trim().toLowerCase();
  if (!text) return true;
  return [inventory.name, inventory.address].some((value) => (value || "").toLowerCase().includes(text));
}

function Inventories() {
  // List (+ branches for names, filter and form)
  const [inventories, setInventories] = useState([]);
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [branchFilter, setBranchFilter] = useState(""); // "" = all branches

  // Messages after an action
  const [successMessage, setSuccessMessage] = useState("");
  const [actionError, setActionError] = useState("");

  // Add / edit form: inventoryToEdit = null → add mode
  const [formOpen, setFormOpen] = useState(false);
  const [inventoryToEdit, setInventoryToEdit] = useState(null);

  // Delete
  const [inventoryToDelete, setInventoryToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  // Used for the first load, the retry button and after every add / edit / delete.
  async function loadData() {
    setLoading(true);
    setError("");
    try {
      const [inventoriesData, branchesData] = await Promise.all([getInventories(), getBranches()]);
      setInventories(inventoriesData);
      setBranches(branchesData);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // Loading data on mount is the normal use of an effect; the lint rule cannot tell.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadData();
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
    loadData();
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      await deleteInventory(inventoryToDelete.id);
      showSuccess("تم حذف المخزن بنجاح");
    } catch (err) {
      setSuccessMessage("");
      setActionError(getErrorMessage(err));
    } finally {
      setDeleting(false);
      setInventoryToDelete(null);
    }
    loadData();
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
    if (error) return <ErrorState message={error} onRetry={loadData} />;
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
