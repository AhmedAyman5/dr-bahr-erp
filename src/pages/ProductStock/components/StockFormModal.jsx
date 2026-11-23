// Add a product to a warehouse / correct its stock, in one modal.
// Usage (render it only while open, so the form starts fresh every time):
//   {formOpen && (
//     <StockFormModal record={recordToEdit} inventoryId={activeId} inventoryLabel="مخزن 1 — فرع 1"
//       availableProducts={availableProducts} hasStockProducts={true} onClose={closeForm} onSaved={handleSaved} />
//   )}
//   record = null → add mode, record = stock record (with product) → edit mode.
//   availableProducts: STOCK products that are not in this warehouse yet (add mode only).
import { useState } from "react";
import { Link } from "react-router-dom";
import Alert from "../../../components/ui/Alert";
import Button from "../../../components/ui/Button";
import Input from "../../../components/ui/Input";
import Modal from "../../../components/ui/Modal";
import Select from "../../../components/ui/Select";
import { getErrorMessage } from "../../../utils/errors";
import { validateMoney } from "../../../utils/money";
import { addStock, updateStock } from "../productStockApi";

const FORM_ID = "stock-form";

// quantity and costPrice are Decimal(18,4) and may not be negative.
const DECIMAL_RULES = { min: 0, maxDecimals: 4 };

function productLabel(product) {
  return `${product.name} (${product.code})`;
}

// Starting values. Both numbers are required, so they start empty in add mode.
function getInitialForm(record) {
  return {
    productId: record?.productId ?? "",
    quantity: String(record?.quantity ?? ""),
    costPrice: String(record?.costPrice ?? ""),
  };
}

function StockFormModal({ record, inventoryId, inventoryLabel, availableProducts, hasStockProducts, onClose, onSaved }) {
  const isEdit = Boolean(record);
  const initialForm = getInitialForm(record);

  const [form, setForm] = useState(initialForm);
  const [fieldErrors, setFieldErrors] = useState({});
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const isDirty = Object.keys(initialForm).some((key) => form[key] !== initialForm[key]);

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

  function validate() {
    const errors = {};
    if (!isEdit && !form.productId) errors.productId = "الصنف مطلوب";

    const quantityError = form.quantity.trim() === "" ? "الكمية مطلوبة" : validateMoney(form.quantity, DECIMAL_RULES);
    if (quantityError) errors.quantity = quantityError;
    const costError = form.costPrice.trim() === "" ? "سعر التكلفة مطلوب" : validateMoney(form.costPrice, DECIMAL_RULES);
    if (costError) errors.costPrice = costError;

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
        await updateStock(record.id, form);
      } else {
        // Also when the backend restores an old (removed) record: for the user it is an add.
        await addStock(inventoryId, form);
      }
      onSaved(isEdit ? "تم تعديل الرصيد بنجاح" : "تمت إضافة الصنف للمخزن بنجاح");
    } catch (err) {
      // Keep the typed data so the user can fix it and try again.
      setError(getErrorMessage(err));
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      title={isEdit ? "تعديل الرصيد" : "إضافة صنف للمخزن"}
      onClose={onClose}
      dirty={isDirty}
      cancelLabel="إلغاء"
      closeDisabled={saving}
      footer={
        <Button type="submit" form={FORM_ID} loading={saving} disabled={noProductToAdd}>
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
        <p className="mb-4 text-xs text-slate-500">التعديل للتصحيح اليدوي فقط (مثل خطأ في الرصيد الافتتاحي)</p>
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
          label="سعر التكلفة"
          name="costPrice"
          inputMode="decimal"
          dir="ltr"
          value={form.costPrice}
          onChange={handleChange}
          error={fieldErrors.costPrice}
          required
        />
      </form>
    </Modal>
  );
}

export default StockFormModal;
