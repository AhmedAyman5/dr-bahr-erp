// Add + edit form for a branch, in one modal.
// Usage (render it only while open, so the form starts fresh every time):
//   {formOpen && <BranchFormModal branch={branchToEdit} onClose={closeForm} onSaved={handleSaved} />}
//   branch = null → add mode, branch = object → edit mode.
import { useState } from "react";
import Alert from "../../../components/ui/Alert";
import Button from "../../../components/ui/Button";
import Input from "../../../components/ui/Input";
import Modal from "../../../components/ui/Modal";
import { getErrorMessage } from "../../../utils/errors";
import { createBranch, updateBranch } from "../branchesApi";

const FORM_ID = "branch-form";

function BranchFormModal({ branch, onClose, onSaved }) {
  const isEdit = Boolean(branch);
  const initialForm = { name: branch?.name ?? "", address: branch?.address ?? "" };

  const [form, setForm] = useState(initialForm);
  const [fieldErrors, setFieldErrors] = useState({});
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const isDirty = form.name !== initialForm.name || form.address !== initialForm.address;

  function handleChange(event) {
    const { name, value } = event.target;
    setForm({ ...form, [name]: value });
    setFieldErrors({ ...fieldErrors, [name]: "" });
  }

  function validate() {
    const errors = {};
    const name = form.name.trim();
    if (!name) errors.name = "الاسم مطلوب";
    else if (name.length < 2) errors.name = "الاسم يجب أن يكون حرفين على الأقل";
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
        await updateBranch(branch.id, form);
      } else {
        await createBranch(form);
      }
      onSaved(isEdit ? "تم تعديل الفرع بنجاح" : "تمت إضافة الفرع بنجاح");
    } catch (err) {
      // Keep the typed data so the user can fix it and try again.
      setError(getErrorMessage(err));
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      title={isEdit ? "تعديل الفرع" : "إضافة فرع"}
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
        {isEdit && <Input label="الكود" value={branch.code} readOnly />}
        <Input
          label="الاسم"
          name="name"
          value={form.name}
          onChange={handleChange}
          error={fieldErrors.name}
          required
          autoFocus
        />
        <Input label="العنوان" name="address" value={form.address} onChange={handleChange} />
      </form>
    </Modal>
  );
}

export default BranchFormModal;
