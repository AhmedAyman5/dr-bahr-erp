// Add + edit form for a category, in one modal.
// Usage (render it only while open, so the form starts fresh every time):
//   {formOpen && <CategoryFormModal category={categoryToEdit} onClose={closeForm} onSaved={handleSaved} />}
//   category = null → add mode, category = object → edit mode.
import { useState } from "react";
import Alert from "../../../components/ui/Alert";
import Button from "../../../components/ui/Button";
import Input from "../../../components/ui/Input";
import Modal from "../../../components/ui/Modal";
import { getErrorMessage } from "../../../utils/errors";
import { createCategory, updateCategory } from "../categoriesApi";

const FORM_ID = "category-form";

function CategoryFormModal({ category, onClose, onSaved }) {
  const isEdit = Boolean(category);
  const initialForm = { name: category?.name ?? "" };

  const [form, setForm] = useState(initialForm);
  const [fieldErrors, setFieldErrors] = useState({});
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const isDirty = form.name !== initialForm.name;

  function handleChange(event) {
    const { name, value } = event.target;
    setForm({ ...form, [name]: value });
    setFieldErrors({ ...fieldErrors, [name]: "" });
  }

  // The backend only requires a non-empty name (no minimum length).
  function validate() {
    const errors = {};
    if (!form.name.trim()) errors.name = "الاسم مطلوب";
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
        await updateCategory(category.id, form);
      } else {
        await createCategory(form);
      }
      onSaved(isEdit ? "تم تعديل التصنيف بنجاح" : "تمت إضافة التصنيف بنجاح");
    } catch (err) {
      // Keep the typed data so the user can fix it and try again.
      setError(getErrorMessage(err));
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      title={isEdit ? "تعديل التصنيف" : "إضافة تصنيف"}
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
        {isEdit && <Input label="الكود" value={category.code} readOnly />}
        <Input
          label="الاسم"
          name="name"
          value={form.name}
          onChange={handleChange}
          error={fieldErrors.name}
          required
          autoFocus
        />
      </form>
    </Modal>
  );
}

export default CategoryFormModal;
