// Add + edit form for a currency, in one modal.
// Usage (render it only while open, so the form starts fresh every time):
//   {formOpen && (
//     <CurrencyFormModal currency={currencyToEdit} isFirstCurrency={currencies.length === 0} onClose={closeForm} onSaved={handleSaved} />
//   )}
//   currency = null → add mode, currency = object → edit mode.
//   isFirstCurrency = true → the "عملة أساسية" checkbox starts checked (the first currency should be the default).
import { useState } from "react";
import Alert from "../../../components/ui/Alert";
import Button from "../../../components/ui/Button";
import Input from "../../../components/ui/Input";
import Modal from "../../../components/ui/Modal";
import { getErrorMessage } from "../../../utils/errors";
import { createCurrency, updateCurrency } from "../currenciesApi";

const FORM_ID = "currency-form";

// Same rule as the backend: exactly 3 capital letters (ISO code).
const CODE_PATTERN = /^[A-Z]{3}$/;
const CODE_INVALID = "كود العملة 3 حروف إنجليزية كبيرة (مثل EGP)";

// Messages that only make sense on this form (the code field of a currency).
const CODE_ERRORS = {
  VALIDATION_FAILED: CODE_INVALID,
  ALREADY_EXISTS: "كود العملة مستخدم بالفعل",
  BELONGS_TO_DELETED: "كود العملة مرتبط بعملة محذوفة",
};

function CurrencyFormModal({ currency, isFirstCurrency = false, onClose, onSaved }) {
  const isEdit = Boolean(currency);
  // The current default can't be unset here: the user makes ANOTHER currency the default instead.
  const isCurrentDefault = Boolean(currency?.isDefault);

  // makeDefault = the user chose to make this currency the default (never true for the current default,
  // so isDefault is never sent for it).
  const initialForm = {
    code: currency?.code ?? "",
    name: currency?.name ?? "",
    symbol: currency?.symbol ?? "",
    makeDefault: !isEdit && isFirstCurrency,
  };

  const [form, setForm] = useState(initialForm);
  const [fieldErrors, setFieldErrors] = useState({});
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const isDirty =
    form.code !== initialForm.code ||
    form.name !== initialForm.name ||
    form.symbol !== initialForm.symbol ||
    form.makeDefault !== initialForm.makeDefault;

  function handleChange(event) {
    const { name, value, type, checked } = event.target;
    let newValue = type === "checkbox" ? checked : value;
    // The code is always in capital letters, even when typed in lowercase.
    if (name === "code") newValue = value.toUpperCase();
    setForm({ ...form, [name]: newValue });
    setFieldErrors({ ...fieldErrors, [name]: "" });
  }

  function validate() {
    const errors = {};
    if (!CODE_PATTERN.test(form.code.trim())) errors.code = CODE_INVALID;
    if (!form.name.trim()) errors.name = "اسم العملة مطلوب";
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
        await updateCurrency(currency.id, form);
      } else {
        await createCurrency(form);
      }
      onSaved(isEdit ? "تم تعديل العملة بنجاح" : "تمت إضافة العملة بنجاح");
    } catch (err) {
      // Keep the typed data so the user can fix it and try again.
      const { code, field } = err.response?.data || {};
      const codeMessage = field === "code" ? CODE_ERRORS[code] : "";
      if (codeMessage) {
        setError(codeMessage);
        setFieldErrors({ ...fieldErrors, code: codeMessage });
      } else {
        setError(getErrorMessage(err));
      }
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      title={isEdit ? "تعديل العملة" : "إضافة عملة"}
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
        <Input
          label="كود العملة"
          name="code"
          value={form.code}
          onChange={handleChange}
          error={fieldErrors.code}
          maxLength={3}
          placeholder="EGP"
          dir="ltr"
          autoComplete="off"
          required
          autoFocus
        />
        <Input
          label="اسم العملة"
          name="name"
          value={form.name}
          onChange={handleChange}
          error={fieldErrors.name}
          placeholder="جنيه مصري"
          required
        />
        <Input label="الرمز" name="symbol" value={form.symbol} onChange={handleChange} placeholder="ج.م أو $" />

        <div>
          <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
            <input
              type="checkbox"
              name="makeDefault"
              checked={isCurrentDefault || form.makeDefault}
              disabled={isCurrentDefault}
              onChange={handleChange}
              className="h-4 w-4 rounded border-slate-300 accent-primary focus-visible:ring-2 focus-visible:ring-primary/40"
            />
            عملة أساسية
          </label>
          <p className="mt-1 text-xs text-slate-500">
            {isCurrentDefault
              ? "لتغيير العملة الأساسية اجعل عملة أخرى أساسية"
              : "تقييم المخزون يكون دائمًا بالعملة الأساسية، وتوجد عملة أساسية واحدة فقط."}
          </p>
        </div>
      </form>
    </Modal>
  );
}

export default CurrencyFormModal;
