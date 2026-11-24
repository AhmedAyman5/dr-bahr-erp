// Add + edit form for a supplier, in one modal.
// Usage (render it only while open, so the form starts fresh every time):
//   {formOpen && <SupplierFormModal supplier={supplierToEdit} onClose={closeForm} onSaved={handleSaved} />}
//   supplier = null → add mode, supplier = object → edit mode.
import { useState } from "react";
import Alert from "../../../components/ui/Alert";
import BalancePreview from "../../../components/ui/BalancePreview";
import Button from "../../../components/ui/Button";
import Input from "../../../components/ui/Input";
import Modal from "../../../components/ui/Modal";
import { getErrorMessage } from "../../../utils/errors";
import { validateMoney } from "../../../utils/money";
import { createSupplier, updateSupplier } from "../suppliersApi";

const FORM_ID = "supplier-form";

// A simple format check (name@domain.ext); the backend does the full check.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Starting values: the current data in edit mode, empty (money = 0) in add mode.
// Money is kept as text while typing ("1500.5"); suppliersApi turns it into a number.
function getInitialForm(supplier) {
  return {
    name: supplier?.name ?? "",
    contactPerson: supplier?.contactPerson ?? "",
    phone: supplier?.phone ?? "",
    email: supplier?.email ?? "",
    taxNumber: supplier?.taxNumber ?? "",
    openingBalance: String(supplier?.openingBalance ?? "0"),
  };
}

function SupplierFormModal({ supplier, onClose, onSaved }) {
  const isEdit = Boolean(supplier);
  const initialForm = getInitialForm(supplier);

  const [form, setForm] = useState(initialForm);
  const [fieldErrors, setFieldErrors] = useState({});
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const isDirty = Object.keys(initialForm).some((key) => form[key] !== initialForm[key]);

  function handleChange(event) {
    const { name, value } = event.target;
    setForm({ ...form, [name]: value });
    setFieldErrors({ ...fieldErrors, [name]: "" });
  }

  function validate() {
    const errors = {};
    if (!form.name.trim()) errors.name = "الاسم مطلوب";

    const email = form.email.trim();
    if (email && !EMAIL_PATTERN.test(email)) errors.email = "البريد الإلكتروني غير صحيح";

    // Same range as the backend: the opening balance may be negative (the supplier owes us).
    const openingBalanceError = validateMoney(form.openingBalance);
    if (openingBalanceError) errors.openingBalance = openingBalanceError;

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
        await updateSupplier(supplier.id, form);
      } else {
        await createSupplier(form);
      }
      onSaved(isEdit ? "تم تعديل المورد بنجاح" : "تمت إضافة المورد بنجاح");
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
      title={isEdit ? "تعديل المورد" : "إضافة مورد"}
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
        {isEdit && <Input label="الكود" value={supplier.code} readOnly className="sm:col-span-2" />}
        <Input
          label="الاسم"
          name="name"
          value={form.name}
          onChange={handleChange}
          error={fieldErrors.name}
          required
          autoFocus
        />
        <Input label="الشخص المسؤول" name="contactPerson" value={form.contactPerson} onChange={handleChange} />
        <Input label="الهاتف" name="phone" type="tel" dir="ltr" value={form.phone} onChange={handleChange} />
        <Input
          label="البريد الإلكتروني"
          name="email"
          type="email"
          dir="ltr"
          value={form.email}
          onChange={handleChange}
          error={fieldErrors.email}
        />
        <Input label="الرقم الضريبي" name="taxNumber" dir="ltr" value={form.taxNumber} onChange={handleChange} />
        <div>
          <Input
            label="الرصيد الافتتاحي"
            name="openingBalance"
            inputMode="decimal"
            dir="ltr"
            value={form.openingBalance}
            onChange={handleChange}
            error={fieldErrors.openingBalance}
          />
          {/* Hint + live preview: "سيتم تسجيله: 500.00 مدين — لنا عند المورد" */}
          <BalancePreview value={form.openingBalance} party="supplier" />
        </div>
      </form>
    </Modal>
  );
}

export default SupplierFormModal;
