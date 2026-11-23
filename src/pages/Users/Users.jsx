// Users (المستخدمين) — the accounts that can log in. Same structure as pages/Branches.
// The API returns only employeeId / branchId, so names come from the employees and branches
// lists (loaded together with the users).
// The logged-in user is marked "(أنت)" and cannot delete their own account.
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
import Select from "../../components/ui/Select";
import { getUser, updateSessionUser } from "../../services/session";
import { getErrorMessage } from "../../utils/errors";
import { formatDateTime } from "../../utils/format";
import { getLabel, ROLES } from "../../utils/labels";
import { deleteUser, getBranches, getEmployees, getUsers } from "./usersApi";
import UserFormModal from "./components/UserFormModal";

const SUCCESS_HIDE_MS = 4000;

function Users() {
  // List (+ employees and branches for names, filters and the form)
  const [users, setUsers] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState(""); // "" = all roles
  const [branchFilter, setBranchFilter] = useState(""); // "" = all branches

  // Messages after an action
  const [successMessage, setSuccessMessage] = useState("");
  const [actionError, setActionError] = useState("");

  // Add / edit form: userToEdit = null → add mode
  const [formOpen, setFormOpen] = useState(false);
  const [userToEdit, setUserToEdit] = useState(null);

  // Delete
  const [userToDelete, setUserToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  // The logged-in user (only the id is used, it never changes).
  const currentUserId = getUser()?.id;

  // Used for the first load, the retry button and after every add / edit / delete.
  async function loadData() {
    setLoading(true);
    setError("");
    try {
      const [usersData, employeesData, branchesData] = await Promise.all([
        getUsers(),
        getEmployees(),
        getBranches(),
      ]);
      setUsers(usersData);
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
    setUserToEdit(null);
    setFormOpen(true);
  }

  function openEdit(user) {
    setUserToEdit(user);
    setFormOpen(true);
  }

  function closeForm() {
    setFormOpen(false);
    setUserToEdit(null);
  }

  function handleSaved(message, savedUser) {
    // Own account changed → update the stored user, so the Header shows the new username.
    if (savedUser?.id === currentUserId) {
      updateSessionUser({ username: savedUser.username, role: savedUser.role });
    }
    closeForm();
    showSuccess(message);
    loadData();
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      await deleteUser(userToDelete.id);
      showSuccess("تم حذف المستخدم بنجاح");
    } catch (err) {
      setSuccessMessage("");
      setActionError(getErrorMessage(err));
    } finally {
      setDeleting(false);
      setUserToDelete(null);
    }
    loadData();
  }

  // Name by id; undefined when the record is not in the list (deleted).
  function findEmployeeName(employeeId) {
    return employees.find((employee) => employee.id === employeeId)?.fullName;
  }
  function findBranchName(branchId) {
    return branches.find((branch) => branch.id === branchId)?.name;
  }

  // Case-insensitive search in username, email and employee name.
  function matchesSearch(user) {
    const text = search.trim().toLowerCase();
    if (!text) return true;
    return [user.username, user.email, findEmployeeName(user.employeeId)].some((value) =>
      (value || "").toLowerCase().includes(text),
    );
  }

  const columns = [
    {
      key: "username",
      label: "اسم المستخدم",
      render: (row) => (
        <span className="flex items-center gap-2">
          <span dir="ltr">{row.username}</span>
          {row.id === currentUserId && (
            <span className="rounded-full bg-primary-soft px-2 py-0.5 text-xs font-medium text-primary">(أنت)</span>
          )}
        </span>
      ),
    },
    {
      key: "role",
      label: "الصلاحية",
      render: (row) => (
        <span
          className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
            row.role === "SUPERADMIN" ? "bg-primary-soft text-primary" : "bg-slate-100 text-slate-700"
          }`}
        >
          {getLabel(ROLES, row.role)}
        </span>
      ),
    },
    {
      key: "employeeId",
      label: "الموظف",
      render: (row) => {
        if (!row.employeeId) return "-";
        return findEmployeeName(row.employeeId) ?? <span className="text-slate-400">موظف محذوف</span>;
      },
    },
    {
      key: "branchId",
      label: "الفرع",
      render: (row) => {
        if (!row.branchId) return "-";
        return findBranchName(row.branchId) ?? <span className="text-slate-400">فرع محذوف</span>;
      },
    },
    {
      key: "email",
      label: "البريد الإلكتروني",
      render: (row) => (row.email ? <span dir="ltr">{row.email}</span> : "-"),
    },
    {
      key: "lastLoginDate",
      label: "آخر دخول",
      render: (row) =>
        row.lastLoginDate ? (
          formatDateTime(row.lastLoginDate)
        ) : (
          <span className="text-slate-400">لم يسجل الدخول بعد</span>
        ),
    },
  ];

  const branchOptions = branches.map((branch) => ({ value: branch.id, label: branch.name }));

  // Role filter, branch filter and search work together.
  const filteredUsers = users.filter(
    (user) =>
      (!roleFilter || user.role === roleFilter) &&
      (!branchFilter || user.branchId === branchFilter) &&
      matchesSearch(user),
  );

  // The same add button in the header and in the empty state.
  function renderAddButton() {
    return (
      <Button onClick={openAdd}>
        <Plus size={18} />
        إضافة مستخدم
      </Button>
    );
  }

  function renderActions(user) {
    const isSelf = user.id === currentUserId;
    return (
      <>
        <Button
          variant="ghost"
          className="px-2"
          title="تعديل"
          aria-label={`تعديل ${user.username}`}
          onClick={() => openEdit(user)}
        >
          <Pencil size={16} />
        </Button>
        <Button
          variant="danger-ghost"
          className="px-2"
          title={isSelf ? "لا يمكنك حذف حسابك" : "حذف"}
          aria-label={`حذف ${user.username}`}
          disabled={isSelf}
          onClick={() => setUserToDelete(user)}
        >
          <Trash2 size={16} />
        </Button>
      </>
    );
  }

  function renderContent() {
    if (loading) return <LoadingState message="جارٍ تحميل المستخدمين..." />;
    if (error) return <ErrorState message={error} onRetry={loadData} />;
    if (users.length === 0) {
      return <EmptyState message="لا يوجد مستخدمين بعد" action={renderAddButton()} />;
    }

    return (
      <>
        <div className="mb-4 flex flex-wrap items-center gap-4">
          <Select
            aria-label="تصفية حسب الصلاحية"
            value={roleFilter}
            onChange={(event) => setRoleFilter(event.target.value)}
            options={ROLES}
            placeholder="كل الصلاحيات"
            className="w-full max-w-48"
          />
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
            placeholder="ابحث باسم المستخدم أو البريد أو اسم الموظف"
          />
          <span className="text-sm text-slate-500">عدد المستخدمين: {filteredUsers.length}</span>
        </div>

        {filteredUsers.length === 0 ? (
          <EmptyState message="لا توجد نتائج مطابقة" />
        ) : (
          <DataTable columns={columns} rows={filteredUsers} renderActions={renderActions} />
        )}
      </>
    );
  }

  return (
    <div>
      <PageHeader title="المستخدمين" subtitle="حسابات الدخول على النظام وصلاحياتها" action={renderAddButton()} />

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
        <UserFormModal
          user={userToEdit}
          users={users}
          employees={employees}
          branches={branches}
          currentUserId={currentUserId}
          onClose={closeForm}
          onSaved={handleSaved}
        />
      )}

      <ConfirmDialog
        open={Boolean(userToDelete)}
        title="حذف المستخدم"
        message={`هل أنت متأكد من حذف المستخدم "${userToDelete?.username}"؟ لن يتمكن من الدخول على النظام بعد الحذف.`}
        confirmLabel="حذف المستخدم"
        onConfirm={handleDelete}
        onCancel={() => setUserToDelete(null)}
        loading={deleting}
      />
    </div>
  );
}

export default Users;
