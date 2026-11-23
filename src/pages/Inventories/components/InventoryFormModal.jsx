// Add + edit form for a warehouse (مخزن), in one modal.
// Usage (render it only while open, so the form starts fresh every time):
//   {formOpen && (
//     <InventoryFormModal inventory={inventoryToEdit} branches={branches} defaultBranchId={branchFilter}
//       onClose={closeForm} onSaved={handleSaved} />
//   )}
//   inventory = null → add mode, inventory = object → edit mode.
//   defaultBranchId → preselected branch in add mode ("" = none).
import { useState } from "react";
import Alert from "../../../components/ui/Alert";
import Button from "../../../components/ui/Button";
import Input from "../../../components/ui/Input";
import Modal from "../../../components/ui/Modal";
import Select from "../../../components/ui/Select";
import { getErrorMessage } from "../../../utils/errors";
import { createInventory, updateInventory } from "../inventoriesApi";

const FORM_ID = "inventory-form";

// Required text with at least 2 characters → Arabic error, or "" when valid.
function checkText(value, label) {
  const text = value.trim();
  if (!text) return `${label} مطلوب`;
  if (text.length < 2) return `${label} يجب أن يكون حرفين على الأقل`;
  return "";
}

function InventoryFormModal({ inventory, branches, defaultBranchId = "", onClose, onSaved }) {
  const isEdit = Boolean(inventory);
  const initialForm = {
    branchId: inventory?.branchId ?? defaultBranchId,
    name: inventory?.name ?? "",
    address: inventory?.address ?? "",
  };

  const [form, setForm] = useState(initialForm);
  const [fieldErrors, setFieldErrors] = useState({});
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const isDirty =
    form.branchId !== initialForm.branchId ||
    form.name !== initialForm.name ||
    form.address !== initialForm.address;

  const branchOptions = branches.map((branch) => ({ value: branch.id, label: branch.name }));
  // Edit mode: the branch may have been deleted since.
  const editBranchName = branches.find((branch) => branch.id === inventory?.branchId)?.name ?? "فرع محذوف";

  function handleChange(event) {
    const { name, value } = event.target;
    setForm({ ...form, [name]: value });
    setFieldErrors({ ...fieldErrors, [name]: "" });
  }

  function validate() {
    const errors = {};
    if (!isEdit && !form.branchId) errors.branchId = "الفرع مطلوب";
    const nameError = checkText(form.name, "الاسم");
    if (nameError) errors.name = nameError;
    const addressError = checkText(form.address, "العنوان");
    if (addressError) errors.address = addressError;
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
        await updateInventory(inventory.id, form);
      } else {
        await createInventory(form.branchId, form);
      }
      onSaved(isEdit ? "تم تعديل المخزن بنجاح" : "تمت إضافة المخزن بنجاح");
    } catch (err) {
      // Keep the typed data so the user can fix it and try again.
      setError(getErrorMessage(err));
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      title={isEdit ? "تعديل المخزن" : "إضافة مخزن"}
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

      <form id={FORM_ID} onSubmit={handleSubmit} noValidate className="space-y-4">
        {isEdit ? (
          <div>
            <Input label="الفرع" value={editBranchName} readOnly />
            <p className="mt-1 text-xs text-slate-500">لا يمكن تغيير فرع المخزن</p>
          </div>
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
          label="الاسم"
          name="name"
          value={form.name}
          onChange={handleChange}
          error={fieldErrors.name}
          required
          autoFocus={isEdit || Boolean(defaultBranchId)}
        />
        <Input
          label="العنوان"
          name="address"
          value={form.address}
          onChange={handleChange}
          error={fieldErrors.address}
          required
        />
      </form>
    </Modal>
  );
}

export default InventoryFormModal;
