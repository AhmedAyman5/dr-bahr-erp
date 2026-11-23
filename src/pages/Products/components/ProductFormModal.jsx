// Add + edit form for a product, in one modal.
// Usage (render it only while open, so the form starts fresh every time):
//   {formOpen && (
//     <ProductFormModal product={productToEdit} categories={categories} units={units}
//       onClose={closeForm} onSaved={handleSaved} />
//   )}
//   product = null → add mode, product = object → edit mode.
import { useState } from "react";
import Alert from "../../../components/ui/Alert";
import Button from "../../../components/ui/Button";
import Input from "../../../components/ui/Input";
import Modal from "../../../components/ui/Modal";
import Select from "../../../components/ui/Select";
import { getErrorMessage } from "../../../utils/errors";
import { ITEM_TYPES } from "../../../utils/labels";
import { validateMoney } from "../../../utils/money";
import { createProduct, updateProduct } from "../productsApi";

const FORM_ID = "product-form";

// Prices and reorderLimit are Decimal(18,4) and may not be negative.
const DECIMAL_RULES = { min: 0, maxDecimals: 4 };
const PRICE_FIELDS = ["retailPrice", "wholesalePrice", "bulkWholesalePrice"];

// Starting values: the current data in edit mode, empty in add mode.
// Prices are required, so in add mode they start empty (not 0); reorderLimit starts at 0.
// Numbers are kept as text while typing ("12.5"); productsApi turns them into numbers.
function getInitialForm(product) {
  return {
    name: product?.name ?? "",
    barcode: product?.barcode ?? "",
    categoryId: product?.categoryId ?? "",
    primaryItemUnitId: product?.primaryItemUnitId ?? "",
    itemType: product?.itemType ?? "STOCK",
    retailPrice: String(product?.retailPrice ?? ""),
    wholesalePrice: String(product?.wholesalePrice ?? ""),
    bulkWholesalePrice: String(product?.bulkWholesalePrice ?? ""),
    reorderLimit: String(product?.reorderLimit ?? "0"),
    hasExpiryDate: product?.hasExpiryDate ?? false,
  };
}

// True when all 3 prices are valid numbers but NOT retail ≥ wholesale ≥ bulk wholesale.
// Only a warning: the backend accepts any order.
function hasUnusualPriceOrder(form) {
  const allValid = PRICE_FIELDS.every(
    (field) => form[field].trim() !== "" && validateMoney(form[field], DECIMAL_RULES) === "",
  );
  if (!allValid) return false;

  const retail = Number(form.retailPrice);
  const wholesale = Number(form.wholesalePrice);
  const bulkWholesale = Number(form.bulkWholesalePrice);
  return !(retail >= wholesale && wholesale >= bulkWholesale);
}

// A small titled group of fields: one column on phones, two on tablet / desktop.
function FormSection({ title, children }) {
  return (
    <section>
      <h3 className="mb-3 border-b border-slate-200 pb-2 text-sm font-semibold text-slate-700">{title}</h3>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">{children}</div>
    </section>
  );
}

function ProductFormModal({ product, categories, units, onClose, onSaved }) {
  const isEdit = Boolean(product);
  const initialForm = getInitialForm(product);

  const [form, setForm] = useState(initialForm);
  const [fieldErrors, setFieldErrors] = useState({});
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const isDirty = Object.keys(initialForm).some((key) => form[key] !== initialForm[key]);

  const categoryOptions = categories.map((category) => ({ value: category.id, label: category.name }));
  const unitOptions = units.map((unit) => ({ value: unit.id, label: unit.name }));

  // Works for text inputs, Selects and the checkbox.
  function handleChange(event) {
    const { name, type, value, checked } = event.target;
    setForm({ ...form, [name]: type === "checkbox" ? checked : value });
    setFieldErrors({ ...fieldErrors, [name]: "" });
  }

  function validate() {
    const errors = {};
    if (!form.name.trim()) errors.name = "الاسم مطلوب";
    if (!form.categoryId) errors.categoryId = "التصنيف مطلوب";
    if (!form.primaryItemUnitId) errors.primaryItemUnitId = "الوحدة الأساسية مطلوبة";

    for (const field of PRICE_FIELDS) {
      const priceError = form[field].trim() === "" ? "السعر مطلوب" : validateMoney(form[field], DECIMAL_RULES);
      if (priceError) errors[field] = priceError;
    }

    // Optional: empty = 0.
    const reorderLimitError = validateMoney(form.reorderLimit, DECIMAL_RULES);
    if (reorderLimitError) errors.reorderLimit = reorderLimitError;

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
        await updateProduct(product.id, form);
      } else {
        await createProduct(form);
      }
      onSaved(isEdit ? "تم تعديل الصنف بنجاح" : "تمت إضافة الصنف بنجاح");
    } catch (err) {
      // Keep the typed data so the user can fix it and try again.
      setError(getErrorMessage(err));
      setSaving(false);
    }
  }

  // Shared props of the 4 number inputs (typed left-to-right, decimal keyboard on tablets).
  function numberInputProps(name) {
    return {
      name,
      inputMode: "decimal",
      dir: "ltr",
      value: form[name],
      onChange: handleChange,
      error: fieldErrors[name],
    };
  }

  return (
    <Modal
      open
      size="lg"
      title={isEdit ? "تعديل الصنف" : "إضافة صنف"}
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

      <form id={FORM_ID} onSubmit={handleSubmit} noValidate className="space-y-6">
        <FormSection title="البيانات الأساسية">
          {isEdit && <Input label="الكود" value={product.code} readOnly className="sm:col-span-2" />}
          <Input
            label="الاسم"
            name="name"
            value={form.name}
            onChange={handleChange}
            error={fieldErrors.name}
            required
            autoFocus
          />
          <Input label="الباركود" name="barcode" dir="ltr" value={form.barcode} onChange={handleChange} />
          <Select
            label="التصنيف"
            name="categoryId"
            value={form.categoryId}
            onChange={handleChange}
            options={categoryOptions}
            placeholder="اختر التصنيف"
            error={fieldErrors.categoryId}
            required
          />
          <Select
            label="الوحدة الأساسية"
            name="primaryItemUnitId"
            value={form.primaryItemUnitId}
            onChange={handleChange}
            options={unitOptions}
            placeholder="اختر الوحدة"
            error={fieldErrors.primaryItemUnitId}
            required
          />
          <Select
            label="نوع الصنف"
            name="itemType"
            value={form.itemType}
            onChange={handleChange}
            options={ITEM_TYPES}
          />
          {/* Only one costing method exists for now; it is never sent (server default). */}
          <Input label="طريقة حساب التكلفة" value="متوسط التكلفة المرجح" readOnly />
        </FormSection>

        <FormSection title="الأسعار">
          <Input label="سعر التجزئة" required {...numberInputProps("retailPrice")} />
          <Input label="سعر الجملة" required {...numberInputProps("wholesalePrice")} />
          <Input label="سعر جملة الجملة" required {...numberInputProps("bulkWholesalePrice")} />
          {hasUnusualPriceOrder(form) && (
            <Alert type="warning" className="sm:col-span-2">
              تنبيه: المعتاد أن يكون سعر التجزئة ≥ سعر الجملة ≥ سعر جملة الجملة. راجع الأسعار قبل الحفظ.
            </Alert>
          )}
        </FormSection>

        <FormSection title="المخزون">
          <Input label="حد إعادة الطلب" {...numberInputProps("reorderLimit")} />
          <label className="flex items-center gap-2 self-end py-2 text-sm font-medium text-slate-700">
            <input
              type="checkbox"
              name="hasExpiryDate"
              checked={form.hasExpiryDate}
              onChange={handleChange}
              className="h-4 w-4 rounded border-slate-300 accent-primary focus-visible:ring-2 focus-visible:ring-primary/40"
            />
            للصنف تاريخ صلاحية
          </label>
        </FormSection>
      </form>
    </Modal>
  );
}

export default ProductFormModal;
