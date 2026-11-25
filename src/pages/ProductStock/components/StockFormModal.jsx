// Add a product to a warehouse (opening balance) / adjust its stock (تسوية), in one modal.
// Usage (render it only while open, so the form starts fresh every time):
//   {formOpen && (
//     <StockFormModal record={recordToEdit} inventoryId={activeId} inventoryLabel="مخزن 1 — فرع 1"
//       availableProducts={availableProducts} hasStockProducts={true} onClose={closeForm} onSaved={handleSaved}
//       onRefreshLists={refreshBase} />
//   )}
//   record = null → add mode, record = stock record (with product) → adjustment mode.
//   availableProducts: STOCK products that are not in this warehouse yet (add mode only).
//   onRefreshLists() reloads the product list silently (called when the chosen product was deleted).
//
// Adjustment (Week 2): the server writes an ADJUSTMENT movement with the difference, and needs a
// reason when quantity or cost changes. Only the changed values are sent; حفظ is disabled while
// nothing changed.
import { useState } from "react";
import { Link } from "react-router-dom";
import Alert from "../../../components/ui/Alert";
import Button from "../../../components/ui/Button";
import Input from "../../../components/ui/Input";
import Modal from "../../../components/ui/Modal";
import Select from "../../../components/ui/Select";
import { getErrorMessage } from "../../../utils/errors";
import { validateMoney } from "../../../utils/money";
import { addStock, adjustStock } from "../productStockApi";

const FORM_ID = "stock-form";

// quantity and costPrice are Decimal(18,4) and may not be negative.
const DECIMAL_RULES = { min: 0, maxDecimals: 4 };

// The adjustment reason: required, max 250 characters. The chips fill the box with a common reason.
const REASON_MAX_LENGTH = 250;
const REASON_CHIPS = ["جرد", "تالف", "خطأ في الإدخال"];
const REASON_REQUIRED = "سبب التسوية مطلوب عند تغيير الكمية أو التكلفة";

function productLabel(product) {
  return `${product.name} (${product.code})`;
}

// Starting values. Both numbers are required, so they start empty in add mode.
function getInitialForm(record) {
  return {
    productId: record?.productId ?? "",
    quantity: String(record?.quantity ?? ""),
    costPrice: String(record?.costPrice ?? ""),
    reason: "",
  };
}

// True when the typed number differs from the saved one ("100" and "100.0" are the same).
// Empty or invalid text also counts as changed, so حفظ shows its error instead of staying disabled.
function isNumberChanged(text, savedValue) {
  return text.trim() === "" || Number(text) !== Number(savedValue);
}

function StockFormModal({
  record,
  inventoryId,
  inventoryLabel,
  availableProducts,
  hasStockProducts,
  onClose,
  onSaved,
  onRefreshLists,
}) {
  const isEdit = Boolean(record);
  const initialForm = getInitialForm(record);

  const [form, setForm] = useState(initialForm);
  const [fieldErrors, setFieldErrors] = useState({});
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const isDirty = Object.keys(initialForm).some((key) => form[key] !== initialForm[key]);

  // Adjustment: what changed compared to the saved stock.
  const changed = {
    quantity: isEdit && isNumberChanged(form.quantity, record.quantity),
    costPrice: isEdit && isNumberChanged(form.costPrice, record.costPrice),
  };
  const nothingChanged = isEdit && !changed.quantity && !changed.costPrice;

  // The chosen product (for its unit next to the quantity).
  const product = isEdit ? record.product : availableProducts.find((item) => item.id === form.productId);
  const unitName = product?.primaryItemUnit?.name;
  const noProductToAdd = !isEdit && availableProducts.length === 0;

  const productOptions = availableProducts.map((item) => ({ value: item.id, label: productLabel(item) }));

  function handleChange(event) {
    const { name, value } = event.target;
    setForm({ ...form, [name]: value });
    setFieldErrors({ ...fieldErrors, [name]: "" });
  }

  function pickReason(reason) {
    setForm({ ...form, reason });
    setFieldErrors({ ...fieldErrors, reason: "" });
  }

  function validate() {
    const errors = {};
    if (!isEdit && !form.productId) errors.productId = "الصنف مطلوب";

    const quantityError = form.quantity.trim() === "" ? "الكمية مطلوبة" : validateMoney(form.quantity, DECIMAL_RULES);
    if (quantityError) errors.quantity = quantityError;
    const costError = form.costPrice.trim() === "" ? "متوسط التكلفة مطلوب" : validateMoney(form.costPrice, DECIMAL_RULES);
    if (costError) errors.costPrice = costError;

    if (isEdit) {
      const reason = form.reason.trim();
      if (!reason) errors.reason = REASON_REQUIRED;
      else if (reason.length > REASON_MAX_LENGTH) errors.reason = `الحد الأقصى ${REASON_MAX_LENGTH} حرفاً`;
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    if (nothingChanged) return; // حفظ is disabled; this also covers Enter in a field
    if (!validate()) return;

    setSaving(true);
    try {
      if (isEdit) {
        await adjustStock(record.id, form, changed);
      } else {
        // Also when the backend restores an old (removed) record: for the user it is an add.
        await addStock(inventoryId, form);
      }
      onSaved(isEdit ? "تمت تسوية الرصيد بنجاح" : "تمت إضافة الصنف للمخزن بنجاح");
    } catch (err) {
      // Keep the typed data so the user can fix it and try again.
      const { code, field } = err.response?.data || {};
      if (code === "VALIDATION_FAILED" && field === "reason") {
        // The backend's own reason check (the form checks it too).
        setError(REASON_REQUIRED);
        setFieldErrors({ ...fieldErrors, reason: REASON_REQUIRED });
      } else {
        setError(getErrorMessage(err));
      }
      // The chosen product was deleted meanwhile (400 DOES_NOT_EXIST): clear the choice and reload
      // the products, so the deleted one disappears from the Select.
      if (code === "DOES_NOT_EXIST" && field === "productId") {
        setForm({ ...form, productId: "" });
        onRefreshLists();
      }
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      title={isEdit ? "تسوية الرصيد" : "إضافة صنف للمخزن"}
      onClose={onClose}
      dirty={isDirty}
      cancelLabel="إلغاء"
      closeDisabled={saving}
      footer={
        <Button
          type="submit"
          form={FORM_ID}
          loading={saving}
          disabled={noProductToAdd || nothingChanged}
          title={nothingChanged ? "غيّر الكمية أو متوسط التكلفة أولاً" : undefined}
        >
          حفظ
        </Button>
      }
    >
      {error && (
        <Alert type="error" className="mb-4">
          {error}
        </Alert>
      )}

      {noProductToAdd && (
        <Alert type="warning" className="mb-4">
          {hasStockProducts ? (
            "كل الأصناف المخزنية موجودة في هذا المخزن"
          ) : (
            <>
              لا توجد أصناف مخزنية بعد.{" "}
              <Link to="/products" className="font-medium text-primary underline hover:text-primary-hover">
                إضافة صنف
              </Link>
            </>
          )}
        </Alert>
      )}

      {isEdit && (
        <p className="mb-4 text-xs text-slate-500">تُسجَّل التسوية في كارت الصنف بالفرق بين الرصيد الحالي والجديد.</p>
      )}

      <form id={FORM_ID} onSubmit={handleSubmit} noValidate className="space-y-4">
        <Input label="المخزن" value={inventoryLabel} readOnly />
        {isEdit ? (
          <Input label="الصنف" value={productLabel(record.product)} readOnly />
        ) : (
          <Select
            label="الصنف"
            name="productId"
            value={form.productId}
            onChange={handleChange}
            options={productOptions}
            placeholder="اختر الصنف"
            error={fieldErrors.productId}
            readOnly={noProductToAdd}
            required
            autoFocus
          />
        )}
        <Input
          label={unitName ? `الكمية (${unitName})` : "الكمية"}
          name="quantity"
          inputMode="decimal"
          dir="ltr"
          value={form.quantity}
          onChange={handleChange}
          error={fieldErrors.quantity}
          required
          autoFocus={isEdit}
        />
        <Input
          label="متوسط التكلفة"
          name="costPrice"
          inputMode="decimal"
          dir="ltr"
          value={form.costPrice}
          onChange={handleChange}
          error={fieldErrors.costPrice}
          required
        />

        {isEdit && (
          <div>
            <Input
              label="سبب التسوية"
              name="reason"
              value={form.reason}
              onChange={handleChange}
              maxLength={REASON_MAX_LENGTH}
              placeholder="مثل: جرد"
              error={fieldErrors.reason}
              required
            />
            <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label="أسباب شائعة">
              {REASON_CHIPS.map((chip) => {
                const selected = form.reason === chip;
                return (
                  <button
                    key={chip}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => pickReason(chip)}
                    className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${
                      selected
                        ? "border-primary bg-primary-soft text-primary"
                        : "border-slate-300 bg-white text-slate-600 hover:bg-slate-100"
                    }`}
                  >
                    {chip}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </form>
    </Modal>
  );
}

export default StockFormModal;
