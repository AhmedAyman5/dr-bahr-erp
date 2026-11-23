// Employees (الموظفين) — list page, same structure as pages/Inventories.
// Every employee belongs to a branch; the API returns only branchId, so the branch
// names come from the branches list (loaded together with the employees).
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
import { deleteEmployee, getBranches, getEmployees } from "./employeesApi";
import EmployeeFormModal from "./components/EmployeeFormModal";

const SUCCESS_HIDE_MS = 4000;

// Case-insensitive search in code, name, national ID and job title.
function matchesSearch(employee, search) {
  const text = search.trim().toLowerCase();
  if (!text) return true;
  return [employee.code, employee.fullName, employee.nationalId, employee.jobTitle].some((value) =>
    (value || "").toLowerCase().includes(text),
  );
}

// The API sends hireDate as "2025-01-01T00:00:00.000Z" (a calendar day, not a moment).
// Only the date part is formatted, read as local time, so the day never shifts.
function formatHireDate(value) {
  if (!value) return "-";
  return formatDate(`${value.slice(0, 10)}T00:00:00`);
}

function Employees() {
  // List (+ branches for names, filter and form)
  const [employees, setEmployees] = useState([]);
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [branchFilter, setBranchFilter] = useState(""); // "" = all branches

  // Messages after an action
  const [successMessage, setSuccessMessage] = useState("");
  const [actionError, setActionError] = useState("");

  // Add / edit form: employeeToEdit = null → add mode
  const [formOpen, setFormOpen] = useState(false);
  const [employeeToEdit, setEmployeeToEdit] = useState(null);

  // Delete
  const [employeeToDelete, setEmployeeToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  // Used for the first load, the retry button and after every add / edit / delete.
  async function loadData() {
    setLoading(true);
    setError("");
    try {
      const [employeesData, branchesData] = await Promise.all([getEmployees(), getBranches()]);
      setEmployees(employeesData);
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
    setEmployeeToEdit(null);
    setFormOpen(true);
  }

  function openEdit(employee) {
    setEmployeeToEdit(employee);
    setFormOpen(true);
  }

  function closeForm() {
    setFormOpen(false);
    setEmployeeToEdit(null);
  }

  function handleSaved(message) {
    closeForm();
    showSuccess(message);
    loadData();
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      await deleteEmployee(employeeToDelete.id);
      showSuccess("تم حذف الموظف بنجاح");
    } catch (err) {
      setSuccessMessage("");
      setActionError(getErrorMessage(err));
    } finally {
      setDeleting(false);
      setEmployeeToDelete(null);
    }
    loadData();
  }

  // Branch name by id; undefined when the branch is not in the list (deleted).
  function findBranchName(branchId) {
    return branches.find((branch) => branch.id === branchId)?.name;
  }

  const columns = [
    { key: "code", label: "الكود" },
    { key: "fullName", label: "الاسم" },
    {
      key: "branchId",
      label: "الفرع",
      render: (row) => findBranchName(row.branchId) ?? <span className="text-slate-400">فرع محذوف</span>,
    },
    { key: "jobTitle", label: "الوظيفة", render: (row) => row.jobTitle || "-" },
    {
      key: "nationalId",
      label: "الرقم القومي",
      render: (row) => (row.nationalId ? <span dir="ltr">{row.nationalId}</span> : "-"),
    },
    { key: "hireDate", label: "تاريخ التعيين", render: (row) => formatHireDate(row.hireDate) },
  ];

  const noBranches = !loading && !error && branches.length === 0;
  const branchOptions = branches.map((branch) => ({ value: branch.id, label: branch.name }));

  // Branch filter and search work together.
  const filteredEmployees = employees.filter(
    (employee) => (!branchFilter || employee.branchId === branchFilter) && matchesSearch(employee, search),
  );

  // The same add button in the header and in the empty state.
  function renderAddButton() {
    return (
      <Button onClick={openAdd} disabled={noBranches} title={noBranches ? "أضف فرعاً أولاً" : undefined}>
        <Plus size={18} />
        إضافة موظف
      </Button>
    );
  }

  function renderContent() {
    if (loading) return <LoadingState message="جارٍ تحميل الموظفين..." />;
    if (error) return <ErrorState message={error} onRetry={loadData} />;
    if (employees.length === 0) {
      return <EmptyState message="لا يوجد موظفين بعد" action={renderAddButton()} />;
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
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="ابحث بالاسم أو الكود أو الرقم القومي أو الوظيفة"
          />
          <span className="text-sm text-slate-500">عدد الموظفين: {filteredEmployees.length}</span>
        </div>

        {filteredEmployees.length === 0 ? (
          <EmptyState message="لا توجد نتائج مطابقة" />
        ) : (
          <DataTable
            columns={columns}
            rows={filteredEmployees}
            renderActions={(employee) => (
              <>
                <Button
                  variant="ghost"
                  className="px-2"
                  title="تعديل"
                  aria-label={`تعديل ${employee.fullName}`}
                  onClick={() => openEdit(employee)}
                >
                  <Pencil size={16} />
                </Button>
                <Button
                  variant="danger-ghost"
                  className="px-2"
                  title="حذف"
                  aria-label={`حذف ${employee.fullName}`}
                  onClick={() => setEmployeeToDelete(employee)}
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
      <PageHeader title="الموظفين" subtitle="بيانات الموظفين وتوزيعهم على الفروع" action={renderAddButton()} />

      {noBranches && (
        <Alert type="warning" className="mb-4">
          لإضافة موظف يجب إضافة فرع أولاً.{" "}
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
        <EmployeeFormModal
          employee={employeeToEdit}
          branches={branches}
          defaultBranchId={branchFilter}
          onClose={closeForm}
          onSaved={handleSaved}
        />
      )}

      <ConfirmDialog
        open={Boolean(employeeToDelete)}
        title="حذف الموظف"
        message={`هل أنت متأكد من حذف الموظف "${employeeToDelete?.fullName}"؟`}
        confirmLabel="حذف الموظف"
        onConfirm={handleDelete}
        onCancel={() => setEmployeeToDelete(null)}
        loading={deleting}
      />
    </div>
  );
}

export default Employees;
