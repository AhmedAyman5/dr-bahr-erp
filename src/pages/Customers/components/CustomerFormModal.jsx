// Add + edit form for a customer, in one modal.
// Usage (render it only while open, so the form starts fresh every time):
//   {formOpen && <CustomerFormModal customer={customerToEdit} onClose={closeForm} onSaved={handleSaved} />}
//   customer = null → add mode, customer = object → edit mode.
import { useState } from "react";
import Alert from "../../../components/ui/Alert";
import Button from "../../../components/ui/Button";
import Input from "../../../components/ui/Input";
import Modal from "../../../components/ui/Modal";
import { getErrorMessage } from "../../../utils/errors";
import { validateMoney } from "../../../utils/money";
import { createCustomer, updateCustomer } from "../customersApi";

const FORM_ID = "customer-form";

// Starting values: the current data in edit mode, empty (money = 0) in add mode.
// Money is kept as text while typing ("1500.5"); customersApi turns it into a number.
function getInitialForm(customer) {
  return {
    name: customer?.name ?? "",
    phone: customer?.phone ?? "",
    taxNumber: customer?.taxNumber ?? "",
    commercialRecord: customer?.commercialRecord ?? "",
    address: customer?.address ?? "",
    creditLimit: String(customer?.creditLimit ?? "0"),
    openingBalance: String(customer?.openingBalance ?? "0"),
  };
}

function CustomerFormModal({ customer, onClose, onSaved }) {
  const isEdit = Boolean(customer);
  const initialForm = getInitialForm(customer);

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

    // Same ranges as the backend: credit limit ≥ 0, opening balance may be negative.
    const creditLimitError = validateMoney(form.creditLimit, { min: 0 });
    if (creditLimitError) errors.creditLimit = creditLimitError;
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
        await updateCustomer(customer.id, form);
      } else {
        await createCustomer(form);
      }
      onSaved(isEdit ? "تم تعديل العميل بنجاح" : "تمت إضافة العميل بنجاح");
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
      title={isEdit ? "تعديل العميل" : "إضافة عميل"}
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
        {isEdit && <Input label="الكود" value={customer.code} readOnly className="sm:col-span-2" />}
        <Input
          label="الاسم"
          name="name"
          value={form.name}
          onChange={handleChange}
          error={fieldErrors.name}
          required
          autoFocus
        />
        <Input label="الهاتف" name="phone" type="tel" dir="ltr" value={form.phone} onChange={handleChange} />
        <Input label="الرقم الضريبي" name="taxNumber" dir="ltr" value={form.taxNumber} onChange={handleChange} />
        <Input
          label="السجل التجاري"
          name="commercialRecord"
          dir="ltr"
          value={form.commercialRecord}
          onChange={handleChange}
        />
        <Input
          label="العنوان"
          name="address"
          value={form.address}
          onChange={handleChange}
          className="sm:col-span-2"
        />
        <Input
          label="الحد الائتماني"
          name="creditLimit"
          inputMode="decimal"
          dir="ltr"
          value={form.creditLimit}
          onChange={handleChange}
          error={fieldErrors.creditLimit}
        />
        <Input
          label="الرصيد الافتتاحي"
          name="openingBalance"
          inputMode="decimal"
          dir="ltr"
          value={form.openingBalance}
          onChange={handleChange}
          error={fieldErrors.openingBalance}
        />
      </form>
    </Modal>
  );
}

export default CustomerFormModal;
