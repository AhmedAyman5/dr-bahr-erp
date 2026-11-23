// Add + edit form for a user account (مستخدم), in one modal.
// Usage (render it only while open, so the form starts fresh every time):
//   {formOpen && (
//     <UserFormModal user={userToEdit} users={users} employees={employees} branches={branches}
//       currentUserId={currentUser?.id} onClose={closeForm} onSaved={handleSaved} />
//   )}
//   user = null → add mode, user = object → edit mode.
//   onSaved(message, savedUser) runs after a successful save.
//
// Rules:
// - Add: password + confirmation required. Edit: both optional, sent only when typed.
// - Choosing an employee sets the branch to the employee's branch and locks the branch Select.
// - The employee Select lists only employees without an active user (+ this user's own employee).
// - The logged-in user cannot change their own role.
import { useState } from "react";
import Alert from "../../../components/ui/Alert";
import Button from "../../../components/ui/Button";
import Input from "../../../components/ui/Input";
import Modal from "../../../components/ui/Modal";
import Select from "../../../components/ui/Select";
import { getErrorMessage } from "../../../utils/errors";
import { ROLES } from "../../../utils/labels";
import { createUser, updateUser } from "../usersApi";
import PasswordInput from "./PasswordInput";

const FORM_ID = "user-form";
const MIN_PASSWORD_LENGTH = 6;
// Simple shape check (something@something.something); the backend checks it fully.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function UserFormModal({ user, users, employees, branches, currentUserId, onClose, onSaved }) {
  const isEdit = Boolean(user);
  const isSelf = isEdit && user.id === currentUserId;

  // If the user's employee still exists, the branch always follows the employee's branch.
  const savedEmployee = employees.find((employee) => employee.id === user?.employeeId);
  const initialForm = {
    username: user?.username ?? "",
    password: "",
    confirmPassword: "",
    role: user?.role ?? "",
    email: user?.email ?? "",
    employeeId: user?.employeeId ?? "",
    branchId: savedEmployee ? savedEmployee.branchId : (user?.branchId ?? ""),
  };

  const [form, setForm] = useState(initialForm);
  const [fieldErrors, setFieldErrors] = useState({});
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const isDirty = Object.keys(initialForm).some((key) => form[key] !== initialForm[key]);

  // Employees that already have an active user cannot get a second one.
  const takenEmployeeIds = users
    .filter((other) => other.employeeId && other.id !== user?.id)
    .map((other) => other.employeeId);
  const employeeOptions = employees
    .filter((employee) => !takenEmployeeIds.includes(employee.id))
    .map((employee) => ({ value: employee.id, label: `${employee.fullName} (${employee.code})` }));
  // Edit mode: the saved employee / branch may have been deleted since.
  if (form.employeeId && !employeeOptions.some((option) => option.value === form.employeeId)) {
    employeeOptions.push({ value: form.employeeId, label: "موظف محذوف" });
  }
  const branchOptions = branches.map((branch) => ({ value: branch.id, label: branch.name }));
  if (form.branchId && !branchOptions.some((option) => option.value === form.branchId)) {
    branchOptions.push({ value: form.branchId, label: "فرع محذوف" });
  }

  const selectedEmployee = employees.find((employee) => employee.id === form.employeeId);
  const branchLocked = Boolean(selectedEmployee);

  function handleChange(event) {
    const { name, value } = event.target;
    setForm({ ...form, [name]: value });
    setFieldErrors({ ...fieldErrors, [name]: "" });
  }

  // With an employee: the branch becomes the employee's branch.
  // "بدون موظف": the branch is editable again and keeps its current value.
  function handleEmployeeChange(event) {
    const employeeId = event.target.value;
    const employee = employees.find((item) => item.id === employeeId);
    setForm({ ...form, employeeId, branchId: employee ? employee.branchId : form.branchId });
  }

  function validate() {
    const errors = {};

    const username = form.username.trim();
    if (!username) {
      errors.username = "اسم المستخدم مطلوب";
    } else if (/\s/.test(username)) {
      errors.username = "اسم المستخدم لا يجب أن يحتوي على مسافات";
    }

    // Add: the password is required. Edit: empty = keep the current password.
    if (!isEdit && !form.password) {
      errors.password = "كلمة المرور مطلوبة";
    } else if (form.password && form.password.length < MIN_PASSWORD_LENGTH) {
      errors.password = `كلمة المرور يجب ألا تقل عن ${MIN_PASSWORD_LENGTH} أحرف`;
    }
    if ((form.password || form.confirmPassword) && form.confirmPassword !== form.password) {
      errors.confirmPassword = "كلمتا المرور غير متطابقتين";
    }

    if (!form.role) errors.role = "الصلاحية مطلوبة";

    const email = form.email.trim();
    if (email && !EMAIL_PATTERN.test(email)) errors.email = "البريد الإلكتروني غير صحيح";

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    if (!validate()) return;

    setSaving(true);
    try {
      const savedUser = isEdit ? await updateUser(user.id, form) : await createUser(form);
      onSaved(isEdit ? "تم تعديل المستخدم بنجاح" : "تمت إضافة المستخدم بنجاح", savedUser);
    } catch (err) {
      // Keep the typed data so the user can fix it and try again.
      setError(getErrorMessage(err));
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      size="lg"
      title={isEdit ? "تعديل المستخدم" : "إضافة مستخدم"}
      onClose={onClose}
      dirty={isDirty}
      cancelLabel="إلغاء"
      closeDisabled={saving}
      footer={
        <Button type="submit" form={FORM_ID} loading={saving}>
          حفظ
        </Button>
      }
    >
      {error && (
        <Alert type="error" className="mb-4">
          {error}
        </Alert>
      )}

      {/* Two columns on desktop / tablet, one on small screens. */}
      <form id={FORM_ID} onSubmit={handleSubmit} noValidate className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Input
          label="اسم المستخدم"
          name="username"
          dir="ltr"
          autoComplete="off"
          spellCheck={false}
          value={form.username}
          onChange={handleChange}
          error={fieldErrors.username}
          required
          autoFocus
        />
        <div>
          <Select
            label="الصلاحية"
            name="role"
            value={form.role}
            onChange={handleChange}
            options={ROLES}
            placeholder="اختر الصلاحية"
            error={fieldErrors.role}
            required
            readOnly={isSelf}
          />
          {isSelf && <p className="mt-1 text-xs text-slate-500">لا يمكنك تغيير صلاحية حسابك</p>}
        </div>

        <PasswordInput
          label={isEdit ? "كلمة مرور جديدة" : "كلمة المرور"}
          name="password"
          value={form.password}
          onChange={handleChange}
          error={fieldErrors.password}
          required={!isEdit}
        />
        <PasswordInput
          label={isEdit ? "تأكيد كلمة المرور الجديدة" : "تأكيد كلمة المرور"}
          name="confirmPassword"
          value={form.confirmPassword}
          onChange={handleChange}
          error={fieldErrors.confirmPassword}
          required={!isEdit}
        />
        {isEdit && (
          <p className="-mt-2 text-xs text-slate-500 sm:col-span-2">اتركها فارغة للإبقاء على كلمة المرور الحالية</p>
        )}

        <Input
          label="البريد الإلكتروني"
          name="email"
          type="email"
          dir="ltr"
          autoComplete="off"
          value={form.email}
          onChange={handleChange}
          error={fieldErrors.email}
        />
        <Select
          label="الموظف"
          name="employeeId"
          value={form.employeeId}
          onChange={handleEmployeeChange}
          options={employeeOptions}
          placeholder="بدون موظف"
        />
        <div>
          <Select
            label="الفرع"
            name="branchId"
            value={form.branchId}
            onChange={handleChange}
            options={branchOptions}
            placeholder="بدون فرع"
            readOnly={branchLocked}
          />
          {branchLocked && <p className="mt-1 text-xs text-slate-500">الفرع يتحدد من فرع الموظف</p>}
        </div>
      </form>
    </Modal>
  );
}

export default UserFormModal;
