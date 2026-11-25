// Product units (وحدات الصنف) of ONE product: "1 كرتونة = 24 قطعة".
// Docs: ../backend/doc/week2/product-units.txt.
//
// Usage (render it only while open):
//   {unitsProduct && (
//     <ProductUnitsModal product={unitsProduct} onClose={() => setUnitsProduct(null)}
//       onProductMissing={handleProductMissing} />
//   )}
//   onProductMissing() = the product was deleted meanwhile (404): the page closes the modal,
//   refreshes its list and shows "الصنف غير موجود أو محذوف".
//
// One modal, two views (never a modal on top of a modal):
// - list: the primary unit first (badge "أساسية", read-only), then the other units (تعديل / حذف);
// - form: add / edit one unit. "رجوع" goes back to the list; it and X / Escape ask first when the
//   form has unsaved changes (Modal's onCancel + dirty).
// Stock is always counted in the primary unit; the server converts with the factor.
import { useState } from "react";
import { Lock, Pencil, Plus, Trash2 } from "lucide-react";
import Alert from "../../../components/ui/Alert";
import Button from "../../../components/ui/Button";
import ConfirmDialog from "../../../components/ui/ConfirmDialog";
import DataTable from "../../../components/ui/DataTable";
import ErrorState from "../../../components/ui/ErrorState";
import LoadingState from "../../../components/ui/LoadingState";
import Modal from "../../../components/ui/Modal";
import useAutoHideMessage from "../../../hooks/useAutoHideMessage";
import useLoadData from "../../../hooks/useLoadData";
import { getErrorMessage } from "../../../utils/errors";
import { formatMoney, formatNumber } from "../../../utils/format";
import { validateMoney } from "../../../utils/money";
import {
  createProductUnit,
  deleteProductUnit,
  getItemUnits,
  getProductUnits,
  updateProductUnit,
} from "../productsApi";
import ProductUnitForm from "./ProductUnitForm";

const FORM_ID = "product-unit-form";
const DECIMALS = { maxDecimals: 4 };
const UNIT_MISSING = "الوحدة غير موجودة أو محذوفة";

// Field errors from the server that have their own text on this form (the rest: utils/errors.js).
const FIELD_MESSAGES = {
  "ALREADY_EXISTS:barcode": "الباركود مستخدم بالفعل",
  "BELONGS_TO_DELETED:barcode": "هذا الباركود مرتبط بوحدة محذوفة",
  "VALIDATION_FAILED:factor": "العدد يجب أن يكون أكبر من صفر، وبحد أقصى 4 أرقام بعد العلامة العشرية",
  "VALIDATION_FAILED:retailPrice": "السعر يجب ألا يقل عن 0، وبحد أقصى 4 أرقام بعد العلامة العشرية",
};
// Fields of this form: a server error about one of them is shown under it.
const FORM_FIELDS = ["itemUnitId", "factor", "barcode", "retailPrice"];

function isNotFound(err) {
  return err?.response?.data?.code === "NOT_FOUND";
}

// "" when valid. Required, a number > 0 with at most 4 decimals.
function getFactorError(text) {
  if (text.trim() === "") return "العدد مطلوب";
  const error = validateMoney(text, DECIMALS);
  if (error) return error;
  if (Number(text) <= 0) return "العدد يجب أن يكون أكبر من صفر";
  return "";
}

// Starting values: the row's data on edit, empty on add. Numbers are kept as typed text.
function getInitialForm(unit) {
  return {
    itemUnitId: unit?.itemUnitId ?? "",
    factor: unit ? String(unit.factor) : "",
    barcode: unit?.barcode ?? "",
    retailPrice: unit?.retailPrice == null ? "" : String(unit.retailPrice),
  };
}

function renderPrice(value) {
  return <span dir="ltr">{formatMoney(value, DECIMALS)}</span>;
}

function ProductUnitsModal({ product, onClose, onProductMissing }) {
  // The product's units (primary first) + the item units (for the unit Select), loaded together.
  // A 404 here = the product was deleted meanwhile → the page closes the modal.
  const { data, loading, error, refreshError, reload, refresh } = useLoadData(async () => {
    try {
      const [units, itemUnits] = await Promise.all([getProductUnits(product.id), getItemUnits()]);
      return { units, itemUnits };
    } catch (err) {
      if (isNotFound(err)) onProductMissing();
      throw err;
    }
  });
  const units = data?.units ?? [];
  const itemUnits = data?.itemUnits ?? [];
  const primary = units.find((unit) => unit.isPrimary);
  const otherUnits = units.filter((unit) => !unit.isPrimary);
  const primaryName = primary?.itemUnit?.name ?? product.primaryItemUnit?.name ?? "الوحدة الأساسية";

  const [successMessage, showSuccessMessage, hideSuccessMessage] = useAutoHideMessage();
  const [actionError, setActionError] = useState("");

  // Form view: formOpen + unitToEdit (null = add).
  const [formOpen, setFormOpen] = useState(false);
  const [unitToEdit, setUnitToEdit] = useState(null);
  const [form, setForm] = useState(getInitialForm(null));
  const [fieldErrors, setFieldErrors] = useState({});
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);

  // Delete
  const [unitToDelete, setUnitToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const isEdit = Boolean(unitToEdit);
  const initialForm = getInitialForm(unitToEdit);
  const isDirty = formOpen && Object.keys(initialForm).some((key) => form[key] !== initialForm[key]);

  // Add mode: active item units, except the primary unit and the units this product already has.
  const usedIds = new Set(units.map((unit) => unit.itemUnitId));
  const unitOptions = itemUnits
    .filter((itemUnit) => !usedIds.has(itemUnit.id))
    .map((itemUnit) => ({ value: itemUnit.id, label: itemUnit.name }));
  const chosenUnitName = isEdit
    ? (unitToEdit.itemUnit?.name ?? "")
    : (unitOptions.find((option) => option.value === form.itemUnitId)?.label ?? "");
  const factorError = getFactorError(form.factor);

  function openForm(unit) {
    setUnitToEdit(unit);
    setForm(getInitialForm(unit));
    setFieldErrors({});
    setFormError("");
    setActionError("");
    hideSuccessMessage();
    setFormOpen(true);
  }

  function backToList() {
    setFormOpen(false);
    setUnitToEdit(null);
  }

  // The unit being edited / deleted no longer exists: back to the list, refresh, explain.
  function handleUnitMissing() {
    backToList();
    hideSuccessMessage();
    setActionError(UNIT_MISSING);
    refresh();
  }

  function handleChange(event) {
    const { name, value } = event.target;
    setForm({ ...form, [name]: value });
    setFieldErrors({ ...fieldErrors, [name]: "" });
  }

  function validate() {
    const errors = {};
    if (!isEdit && !form.itemUnitId) errors.itemUnitId = "الوحدة مطلوبة";
    if (factorError) errors.factor = factorError;
    const priceError = validateMoney(form.retailPrice, { min: 0, ...DECIMALS });
    if (priceError) errors.retailPrice = priceError;
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  // A failed save: the form stays open with the typed data; the error goes under its field.
  function handleSaveError(err) {
    if (isNotFound(err)) {
      // POST → the product is gone; PATCH → the product unit is gone.
      if (isEdit) handleUnitMissing();
      else onProductMissing();
      return;
    }

    const { code, field } = err.response?.data || {};
    if (!FORM_FIELDS.includes(field)) {
      setFormError(getErrorMessage(err));
      return;
    }
    setFieldErrors({ ...fieldErrors, [field]: FIELD_MESSAGES[`${code}:${field}`] ?? getErrorMessage(err) });

    // The chosen unit was deleted, or was added meanwhile (another tab): reload the list and the
    // options, and clear the choice (it is no longer in the Select).
    if (field === "itemUnitId" && (code === "DOES_NOT_EXIST" || code === "ALREADY_EXISTS")) {
      setForm({ ...form, itemUnitId: "" });
      refresh();
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setFormError("");
    if (!validate()) return;

    setSaving(true);
    try {
      let message = "تم تعديل الوحدة";
      if (isEdit) {
        await updateProductUnit(unitToEdit.id, form);
      } else {
        const { restored } = await createProductUnit(product.id, form);
        // Re-adding a unit that was deleted before brings the same row back with the new values.
        message = restored ? "تمت إعادة الوحدة المحذوفة بالقيم الجديدة" : "تمت إضافة الوحدة";
      }
      backToList();
      showSuccessMessage(message);
      refresh();
    } catch (err) {
      handleSaveError(err);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      await deleteProductUnit(unitToDelete.id);
      setActionError("");
      showSuccessMessage("تم حذف الوحدة");
      refresh();
    } catch (err) {
      if (isNotFound(err)) {
        handleUnitMissing();
      } else {
        hideSuccessMessage();
        setActionError(getErrorMessage(err));
      }
    } finally {
      setDeleting(false);
      setUnitToDelete(null);
    }
  }

  const columns = [
    {
      key: "unit",
      label: "الوحدة",
      render: (row) => (
        <span className="inline-flex items-center gap-1.5">
          {row.itemUnit?.name ?? "-"}
          {row.isPrimary && (
            <span className="rounded-full bg-primary-soft px-1.5 py-0.5 text-xs font-medium text-primary">أساسية</span>
          )}
        </span>
      ),
    },
    {
      key: "content",
      label: "المحتوى",
      render: (row) =>
        row.isPrimary ? (
          <span className="text-slate-500">الوحدة الأساسية</span>
        ) : (
          `1 ${row.itemUnit?.name ?? ""} = ${formatNumber(row.factor)} ${primaryName}`
        ),
    },
    { key: "barcode", label: "الباركود", render: (row) => (row.barcode ? <span dir="ltr">{row.barcode}</span> : "-") },
    { key: "retailPrice", label: "سعر البيع", render: (row) => renderPrice(row.retailPrice) },
  ];

  function renderActions(row) {
    if (row.isPrimary) {
      return (
        <span
          className="inline-flex px-2 text-slate-400"
          role="img"
          title="تُعدَّل من بيانات الصنف"
          aria-label="تُعدَّل من بيانات الصنف"
        >
          <Lock size={16} />
        </span>
      );
    }
    const name = row.itemUnit?.name ?? "";
    return (
      <>
        <Button variant="ghost" className="px-2" title="تعديل" aria-label={`تعديل وحدة ${name}`} onClick={() => openForm(row)}>
          <Pencil size={16} />
        </Button>
        <Button
          variant="danger-ghost"
          className="px-2"
          title="حذف"
          aria-label={`حذف وحدة ${name}`}
          onClick={() => setUnitToDelete(row)}
        >
          <Trash2 size={16} />
        </Button>
      </>
    );
  }

  function renderAddButton() {
    return (
      <Button onClick={() => openForm(null)}>
        <Plus size={18} />
        إضافة وحدة
      </Button>
    );
  }

  function renderList() {
    if (loading) return <LoadingState message="جارٍ تحميل الوحدات..." />;
    if (error) return <ErrorState message={error} onRetry={reload} />;

    return (
      <div className="space-y-4">
        {otherUnits.length > 0 && <div className="flex justify-end">{renderAddButton()}</div>}
        <DataTable columns={columns} rows={units} rowKey="itemUnitId" renderActions={renderActions} />
        {otherUnits.length === 0 && (
          <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-slate-300 px-4 py-6 text-center">
            <p className="text-sm text-slate-500">لا توجد وحدات أخرى. أضف وحدة مثل الكرتونة أو الدستة.</p>
            {renderAddButton()}
          </div>
        )}
      </div>
    );
  }

  function renderForm() {
    return (
      <>
        <h3 className="mb-3 border-b border-slate-200 pb-2 text-sm font-semibold text-slate-700">
          {isEdit ? `تعديل وحدة ${chosenUnitName}` : "إضافة وحدة"}
        </h3>
        {formError && (
          <Alert type="error" className="mb-4">
            {formError}
          </Alert>
        )}
        <ProductUnitForm
          formId={FORM_ID}
          form={form}
          fieldErrors={fieldErrors}
          onChange={handleChange}
          onSubmit={handleSubmit}
          isEdit={isEdit}
          unitOptions={unitOptions}
          unitName={chosenUnitName}
          primaryName={primaryName}
          primaryRetailPrice={primary?.retailPrice ?? product.retailPrice}
          factorValid={factorError === ""}
        />
      </>
    );
  }

  const noUnitsLeft = formOpen && !isEdit && unitOptions.length === 0;

  return (
    <>
      <Modal
        open
        size="lg"
        title={`وحدات الصنف: ${product.name}`}
        onClose={onClose}
        dirty={isDirty}
        // Form view: "رجوع" goes back to the list. List view: "إغلاق" closes the modal.
        cancelLabel={formOpen ? "رجوع" : "إغلاق"}
        onCancel={formOpen ? backToList : undefined}
        // While the delete confirmation is open, Escape belongs to it (not to this modal).
        closeDisabled={saving || deleting || Boolean(unitToDelete)}
        footer={
          formOpen && (
            <Button type="submit" form={FORM_ID} loading={saving} disabled={noUnitsLeft}>
              حفظ
            </Button>
          )
        }
      >
        <p className="mb-4 text-sm text-slate-500">
          المخزون يُحسب دائماً بالـ{primaryName}، وكل وحدة هنا تُحوَّل إليها تلقائياً.
        </p>
        {!formOpen && successMessage && (
          <Alert type="success" className="mb-4" onClose={hideSuccessMessage}>
            {successMessage}
          </Alert>
        )}
        {!formOpen && actionError && (
          <Alert type="error" className="mb-4" onClose={() => setActionError("")}>
            {actionError}
          </Alert>
        )}
        {refreshError && (
          <Alert type="error" className="mb-4">
            {refreshError}
          </Alert>
        )}
        {formOpen ? renderForm() : renderList()}
      </Modal>

      <ConfirmDialog
        open={Boolean(unitToDelete)}
        title="حذف الوحدة"
        message={
          <>
            حذف وحدة {unitToDelete?.itemUnit?.name} من هذا الصنف؟
            <span className="mt-1 block text-xs text-slate-500">المستندات القديمة التي استخدمت هذه الوحدة لن تتأثر</span>
          </>
        }
        confirmLabel="حذف الوحدة"
        onConfirm={handleDelete}
        onCancel={() => setUnitToDelete(null)}
        loading={deleting}
      />
    </>
  );
}

export default ProductUnitsModal;
