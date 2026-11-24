// Customers (العملاء) — list + add / edit / delete. Same structure as pages/Branches.
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
import { formatMoney } from "../../utils/format";
import { deleteCustomer, getCustomers } from "./customersApi";
import CustomerFormModal from "./components/CustomerFormModal";

// dir="ltr" keeps numbers the right way round in RTL.
// The opening balance shows the amount + "مدين" / "دائن" and its meaning (see BalanceCell).
const COLUMNS = [
  { key: "code", label: "الكود" },
  { key: "name", label: "الاسم" },
  { key: "phone", label: "الهاتف", render: (row) => (row.phone ? <span dir="ltr">{row.phone}</span> : "-") },
  {
    key: "creditLimit",
    label: "الحد الائتماني",
    render: (row) => <span dir="ltr">{formatMoney(row.creditLimit)}</span>,
  },
  {
    key: "openingBalance",
    label: "الرصيد الافتتاحي",
    render: (row) => <BalanceCell value={row.openingBalance} party="customer" />,
  },
];

// Case-insensitive search in name, code, phone and tax number.
function matchesSearch(customer, search) {
  const text = search.trim().toLowerCase();
  if (!text) return true;
  return [customer.name, customer.code, customer.phone, customer.taxNumber].some((value) =>
    (value || "").toLowerCase().includes(text),
  );
}

function Customers() {
  // List: loaded on mount. reload() = retry (shows LoadingState), refresh() = silent (after add / edit / delete).
  const { data, loading, error, refreshError, reload, refresh } = useLoadData(getCustomers);
  const customers = data ?? [];
  const [search, setSearch] = useState("");

  // Messages after an action (the success message hides by itself)
  const [successMessage, showSuccessMessage, hideSuccessMessage] = useAutoHideMessage();
  const [actionError, setActionError] = useState("");

  // Add / edit form: customerToEdit = null → add mode
  const [formOpen, setFormOpen] = useState(false);
  const [customerToEdit, setCustomerToEdit] = useState(null);

  // Delete
  const [customerToDelete, setCustomerToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  function showSuccess(message) {
    setActionError("");
    showSuccessMessage(message);
  }

  function openAdd() {
    setCustomerToEdit(null);
    setFormOpen(true);
  }

  function openEdit(customer) {
    setCustomerToEdit(customer);
    setFormOpen(true);
  }

  function closeForm() {
    setFormOpen(false);
    setCustomerToEdit(null);
  }

  function handleSaved(message) {
    closeForm();
    showSuccess(message);
    refresh();
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      await deleteCustomer(customerToDelete.id);
      showSuccess("تم حذف العميل بنجاح");
    } catch (err) {
      hideSuccessMessage();
      setActionError(getErrorMessage(err));
    } finally {
      setDeleting(false);
      setCustomerToDelete(null);
    }
    refresh();
  }

  const filteredCustomers = customers.filter((customer) => matchesSearch(customer, search));

  function renderContent() {
    if (loading) return <LoadingState message="جارٍ تحميل العملاء..." />;
    if (error) return <ErrorState message={error} onRetry={reload} />;
    if (customers.length === 0) {
      return (
        <EmptyState
          message="لا يوجد عملاء بعد"
          action={
            <Button onClick={openAdd}>
              <Plus size={18} />
              إضافة عميل
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
            placeholder="ابحث بالاسم أو الكود أو الهاتف أو الرقم الضريبي"
          />
          <span className="text-sm text-slate-500">عدد العملاء: {filteredCustomers.length}</span>
        </div>

        {filteredCustomers.length === 0 ? (
          <EmptyState message="لا توجد نتائج مطابقة للبحث" />
        ) : (
          <DataTable
            columns={COLUMNS}
            rows={filteredCustomers}
            renderActions={(customer) => (
              <>
                <Button
                  variant="ghost"
                  className="px-2"
                  title="تعديل"
                  aria-label={`تعديل ${customer.name}`}
                  onClick={() => openEdit(customer)}
                >
                  <Pencil size={16} />
                </Button>
                <Button
                  variant="danger-ghost"
                  className="px-2"
                  title="حذف"
                  aria-label={`حذف ${customer.name}`}
                  onClick={() => setCustomerToDelete(customer)}
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
        title="العملاء"
        subtitle="بيانات العملاء والحدود الائتمانية"
        action={
          <Button onClick={openAdd}>
            <Plus size={18} />
            إضافة عميل
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

      {formOpen && <CustomerFormModal customer={customerToEdit} onClose={closeForm} onSaved={handleSaved} />}

      <ConfirmDialog
        open={Boolean(customerToDelete)}
        title="حذف العميل"
        message={`هل أنت متأكد من حذف العميل "${customerToDelete?.name}"؟`}
        confirmLabel="حذف العميل"
        onConfirm={handleDelete}
        onCancel={() => setCustomerToDelete(null)}
        loading={deleting}
      />
    </div>
  );
}

export default Customers;
