// Add + edit form for an employee (موظف), in one modal.
// Usage (render it only while open, so the form starts fresh every time):
//   {formOpen && (
//     <EmployeeFormModal employee={employeeToEdit} branches={branches} defaultBranchId={branchFilter}
//       onClose={closeForm} onSaved={handleSaved} />
//   )}
//   employee = null → add mode, employee = object → edit mode.
//   defaultBranchId → preselected branch in add mode ("" = none).
import { useState } from "react";
import Alert from "../../../components/ui/Alert";
import Button from "../../../components/ui/Button";
import Input from "../../../components/ui/Input";
import Modal from "../../../components/ui/Modal";
import Select from "../../../components/ui/Select";
import { getErrorMessage } from "../../../utils/errors";
import { createEmployee, updateEmployee } from "../employeesApi";

const FORM_ID = "employee-form";

// "2025-01-01T00:00:00.000Z" → "2025-01-01" for <input type="date">.
// The date part is used as is (no Date object), so the day never shifts with the time zone.
function toDateInput(value) {
  return value ? value.slice(0, 10) : "";
}

function EmployeeFormModal({ employee, branches, defaultBranchId = "", onClose, onSaved }) {
  const isEdit = Boolean(employee);
  const initialForm = {
    branchId: employee?.branchId ?? defaultBranchId,
    fullName: employee?.fullName ?? "",
    nationalId: employee?.nationalId ?? "",
    jobTitle: employee?.jobTitle ?? "",
    hireDate: toDateInput(employee?.hireDate),
  };

  const [form, setForm] = useState(initialForm);
  const [fieldErrors, setFieldErrors] = useState({});
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const isDirty = Object.keys(initialForm).some((key) => form[key] !== initialForm[key]);

  const branchOptions = branches.map((branch) => ({ value: branch.id, label: branch.name }));
  // Edit mode: the branch may have been deleted since.
  const editBranchName = branches.find((branch) => branch.id === employee?.branchId)?.name ?? "فرع محذوف";

  function handleChange(event) {
    const { name, value } = event.target;
    setForm({ ...form, [name]: value });
    setFieldErrors({ ...fieldErrors, [name]: "" });
  }

  function validate() {
    const errors = {};
    if (!isEdit && !form.branchId) errors.branchId = "الفرع مطلوب";
    if (!form.fullName.trim()) errors.fullName = "الاسم بالكامل مطلوب";

    // Optional, but when filled: exactly 14 digits.
    const nationalId = form.nationalId.trim();
    if (nationalId && !/^\d{14}$/.test(nationalId)) {
      errors.nationalId = "الرقم القومي يجب أن يكون 14 رقماً";
    }

    // The backend cannot clear a saved hire date, only change it.
    if (initialForm.hireDate && !form.hireDate) {
      errors.hireDate = "لا يمكن حذف تاريخ التعيين بعد حفظه، يمكنك تعديله فقط";
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    if (!validate()) return;

    setSaving(true);
    try {
      if (isEdit) {
        await updateEmployee(employee.id, form);
      } else {
        await createEmployee(form.branchId, form);
      }
      onSaved(isEdit ? "تم تعديل الموظف بنجاح" : "تمت إضافة الموظف بنجاح");
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
      title={isEdit ? "تعديل الموظف" : "إضافة موظف"}
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
        {isEdit ? (
          <>
            <Input label="الكود" value={employee.code} readOnly />
            <div>
              <Input label="الفرع" value={editBranchName} readOnly />
              <p className="mt-1 text-xs text-slate-500">لا يمكن تغيير فرع الموظف</p>
            </div>
          </>
        ) : (
          <Select
            label="الفرع"
            name="branchId"
            value={form.branchId}
            onChange={handleChange}
            options={branchOptions}
            placeholder="اختر الفرع"
            error={fieldErrors.branchId}
            required
            autoFocus={!defaultBranchId}
          />
        )}
        <Input
          label="الاسم بالكامل"
          name="fullName"
          value={form.fullName}
          onChange={handleChange}
          error={fieldErrors.fullName}
          required
          autoFocus={isEdit || Boolean(defaultBranchId)}
        />
        <Input
          label="الرقم القومي"
          name="nationalId"
          dir="ltr"
          inputMode="numeric"
          value={form.nationalId}
          onChange={handleChange}
          error={fieldErrors.nationalId}
        />
        <Input label="الوظيفة" name="jobTitle" value={form.jobTitle} onChange={handleChange} />
        <Input
          label="تاريخ التعيين"
          name="hireDate"
          type="date"
          value={form.hireDate}
          onChange={handleChange}
          error={fieldErrors.hireDate}
        />
      </form>
    </Modal>
  );
}

export default EmployeeFormModal;
