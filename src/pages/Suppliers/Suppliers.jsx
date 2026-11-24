// Suppliers (الموردين) — list + add / edit / delete. Same structure as pages/Branches.
import { useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import PageHeader from "../../components/layout/PageHeader";
import Alert from "../../components/ui/Alert";
import BalanceCell from "../../components/ui/BalanceCell";
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
import { deleteSupplier, getSuppliers } from "./suppliersApi";
import SupplierFormModal from "./components/SupplierFormModal";

// dir="ltr" keeps phone numbers and emails the right way round in RTL.
// The opening balance shows the amount + "مدين" / "دائن" and its meaning (see BalanceCell).
const COLUMNS = [
  { key: "code", label: "الكود" },
  { key: "name", label: "الاسم" },
  { key: "contactPerson", label: "الشخص المسؤول", render: (row) => row.contactPerson || "-" },
  { key: "phone", label: "الهاتف", render: (row) => (row.phone ? <span dir="ltr">{row.phone}</span> : "-") },
  { key: "email", label: "البريد الإلكتروني", render: (row) => (row.email ? <span dir="ltr">{row.email}</span> : "-") },
  {
    key: "openingBalance",
    label: "الرصيد الافتتاحي",
    render: (row) => <BalanceCell value={row.openingBalance} party="supplier" />,
  },
];

// Case-insensitive search in name, code, phone, contact person and email.
function matchesSearch(supplier, search) {
  const text = search.trim().toLowerCase();
  if (!text) return true;
  return [supplier.name, supplier.code, supplier.phone, supplier.contactPerson, supplier.email].some(
    (value) => (value || "").toLowerCase().includes(text),
  );
}

function Suppliers() {
  // List: loaded on mount. reload() = retry (shows LoadingState), refresh() = silent (after add / edit / delete).
  const { data, loading, error, refreshError, reload, refresh } = useLoadData(getSuppliers);
  const suppliers = data ?? [];
  const [search, setSearch] = useState("");

  // Messages after an action (the success message hides by itself)
  const [successMessage, showSuccessMessage, hideSuccessMessage] = useAutoHideMessage();
  const [actionError, setActionError] = useState("");

  // Add / edit form: supplierToEdit = null → add mode
  const [formOpen, setFormOpen] = useState(false);
  const [supplierToEdit, setSupplierToEdit] = useState(null);

  // Delete
  const [supplierToDelete, setSupplierToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  function showSuccess(message) {
    setActionError("");
    showSuccessMessage(message);
  }

  function openAdd() {
    setSupplierToEdit(null);
    setFormOpen(true);
  }

  function openEdit(supplier) {
    setSupplierToEdit(supplier);
    setFormOpen(true);
  }

  function closeForm() {
    setFormOpen(false);
    setSupplierToEdit(null);
  }

  function handleSaved(message) {
    closeForm();
    showSuccess(message);
    refresh();
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      await deleteSupplier(supplierToDelete.id);
      showSuccess("تم حذف المورد بنجاح");
    } catch (err) {
      hideSuccessMessage();
      setActionError(getErrorMessage(err));
    } finally {
      setDeleting(false);
      setSupplierToDelete(null);
    }
    refresh();
  }

  const filteredSuppliers = suppliers.filter((supplier) => matchesSearch(supplier, search));

  function renderContent() {
    if (loading) return <LoadingState message="جارٍ تحميل الموردين..." />;
    if (error) return <ErrorState message={error} onRetry={reload} />;
    if (suppliers.length === 0) {
      return (
        <EmptyState
          message="لا يوجد موردين بعد"
          action={
            <Button onClick={openAdd}>
              <Plus size={18} />
              إضافة مورد
            </Button>
          }
        />
      );
    }

    return (
      <>
        <div className="mb-4 flex flex-wrap items-center gap-4">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="ابحث بالاسم أو الكود أو الهاتف أو الشخص المسؤول أو البريد"
          />
          <span className="text-sm text-slate-500">عدد الموردين: {filteredSuppliers.length}</span>
        </div>

        {filteredSuppliers.length === 0 ? (
          <EmptyState message="لا توجد نتائج مطابقة للبحث" />
        ) : (
          <DataTable
            columns={COLUMNS}
            rows={filteredSuppliers}
            renderActions={(supplier) => (
              <>
                <Button
                  variant="ghost"
                  className="px-2"
                  title="تعديل"
                  aria-label={`تعديل ${supplier.name}`}
                  onClick={() => openEdit(supplier)}
                >
                  <Pencil size={16} />
                </Button>
                <Button
                  variant="danger-ghost"
                  className="px-2"
                  title="حذف"
                  aria-label={`حذف ${supplier.name}`}
                  onClick={() => setSupplierToDelete(supplier)}
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
        title="الموردين"
        subtitle="بيانات الموردين والأرصدة الافتتاحية"
        action={
          <Button onClick={openAdd}>
            <Plus size={18} />
            إضافة مورد
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

      {formOpen && <SupplierFormModal supplier={supplierToEdit} onClose={closeForm} onSaved={handleSaved} />}

      <ConfirmDialog
        open={Boolean(supplierToDelete)}
        title="حذف المورد"
        message={`هل أنت متأكد من حذف المورد "${supplierToDelete?.name}"؟`}
        confirmLabel="حذف المورد"
        onConfirm={handleDelete}
        onCancel={() => setSupplierToDelete(null)}
        loading={deleting}
      />
    </div>
  );
}

export default Suppliers;
