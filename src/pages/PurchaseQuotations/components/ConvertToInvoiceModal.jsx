// "تحويل لفاتورة": an ACCEPTED quotation becomes a DRAFT purchase invoice (same supplier, branch, lines, discount
// and tax, in the default currency). The stock does not change until that invoice is posted.
// Docs: ../backend/doc/week2/purchase-quotations.txt (7) + week2flow.txt step 7.
//
// Usage:
//   {convertOpen && (
//     <ConvertToInvoiceModal quotation={quotation} onClose={...}
//       onConverted={(result) => ...}          // { quotation (CONVERTED), invoice (DRAFT) }
//       onStatusConflict={(message) => ...} /> // 409: no longer ACCEPTED → the page closes it and refreshes
//   )}
//
// The body: paymentType + invoiceDate, and warehouseId ONLY when the quotation has no warehouse (then required).
import { useState } from "react";
import { Link } from "react-router-dom";
import Alert from "../../../components/ui/Alert";
import Button from "../../../components/ui/Button";
import DateInput from "../../../components/ui/DateInput";
import ErrorState from "../../../components/ui/ErrorState";
import Input from "../../../components/ui/Input";
import LoadingState from "../../../components/ui/LoadingState";
import Modal from "../../../components/ui/Modal";
import Select from "../../../components/ui/Select";
import useLoadData from "../../../hooks/useLoadData";
import { todayDay } from "../../../utils/dates";
import { getErrorMessage } from "../../../utils/errors";
import { PAYMENT_TYPES } from "../../../utils/labels";
import { convertPurchaseQuotation, getInventories } from "../purchaseQuotationsApi";

const FORM_ID = "convert-quotation-form";
const PAYMENT_HINTS = {
  CASH: "يُسجَّل المدفوع = صافي الفاتورة",
  CREDIT: "المدفوع 0، ويمكن تعديله في الفاتورة قبل الترحيل",
};

function ConvertToInvoiceModal({ quotation, onClose, onConverted, onStatusConflict }) {
  const needsWarehouse = !quotation.warehouseId;
  // The branch's warehouses are needed only when the quotation has none.
  const { data, loading, error, reload, refresh } = useLoadData(async () => (needsWarehouse ? getInventories() : []));
  const warehouses = (data ?? []).filter((inventory) => inventory.branchId === quotation.branchId);

  const [initialDate] = useState(todayDay);
  const [form, setForm] = useState({ paymentType: "", invoiceDate: initialDate, warehouseId: "" });
  const [dateInvalid, setDateInvalid] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);

  const dirty =
    form.paymentType !== "" || form.invoiceDate !== initialDate || form.warehouseId !== "" || dateInvalid;

  function change(changes) {
    setForm({ ...form, ...changes });
    const cleared = { ...fieldErrors };
    for (const key of Object.keys(changes)) delete cleared[key];
    setFieldErrors(cleared);
  }

  function validate() {
    const errors = {};
    if (!form.paymentType) errors.paymentType = "اختر طريقة الدفع";
    if (dateInvalid) errors.invoiceDate = "تاريخ غير صحيح";
    else if (!form.invoiceDate) errors.invoiceDate = "تاريخ الفاتورة مطلوب";
    if (needsWarehouse && !form.warehouseId) errors.warehouseId = "اختر المخزن";
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setFormError("");
    if (!validate()) return;

    setSaving(true);
    try {
      const result = await convertPurchaseQuotation(quotation.id, form, needsWarehouse);
      onConverted(result);
    } catch (err) {
      setSaving(false);
      const { code, field } = err.response?.data || {};
      if (code === "INVALID_STATUS") {
        onStatusConflict(getErrorMessage(err));
        return;
      }
      if (code === "VALIDATION_FAILED" && field === "warehouseId") {
        setFormError("اختر المخزن (العرض بدون مخزن)");
        return;
      }
      setFormError(getErrorMessage(err));
      // The chosen warehouse was deleted meanwhile: clear it and reload the list.
      if (code === "DOES_NOT_EXIST" && field === "warehouseId" && needsWarehouse) {
        setForm({ ...form, warehouseId: "" });
        refresh();
      }
    }
  }

  function renderWarehouse() {
    if (!needsWarehouse) {
      return <Input label="المخزن" value={quotation.warehouse?.name ?? ""} readOnly />;
    }
    if (loading) return <LoadingState message="جارٍ تحميل المخازن..." />;
    if (error) return <ErrorState message={error} onRetry={reload} />;
    if (warehouses.length === 0) {
      return (
        <Alert type="warning">
          لا توجد مخازن في فرع هذا العرض. أضف مخزنًا أولًا.{" "}
          <Link to="/inventories" className="font-medium text-primary underline hover:text-primary-hover">
            صفحة المخازن
          </Link>
        </Alert>
      );
    }
    return (
      <Select
        label="المخزن"
        required
        value={form.warehouseId}
        onChange={(event) => change({ warehouseId: event.target.value })}
        options={warehouses.map((warehouse) => ({ value: warehouse.id, label: warehouse.name }))}
        placeholder="اختر المخزن"
        error={fieldErrors.warehouseId}
        readOnly={saving}
      />
    );
  }

  return (
    <Modal
      open
      title="تحويل العرض إلى فاتورة شراء"
      onClose={onClose}
      dirty={dirty}
      cancelLabel="إلغاء"
      closeDisabled={saving}
      footer={
        <Button type="submit" form={FORM_ID} loading={saving}>
          تحويل لفاتورة
        </Button>
      }
    >
      <form id={FORM_ID} onSubmit={handleSubmit} noValidate className="space-y-4">
        <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
          سيتم إنشاء فاتورة شراء «مسودة» بنفس المورد والفرع والبنود والخصم والضريبة، بالعملة الأساسية. المخزون لا
          يتغير إلا عند ترحيل الفاتورة.
        </p>
        {formError && <Alert type="error">{formError}</Alert>}

        <fieldset>
          <legend className="mb-1 block text-sm font-medium text-slate-700">
            طريقة الدفع
            <span className="ms-1 text-red-600">*</span>
          </legend>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {PAYMENT_TYPES.map((type) => {
              const checked = form.paymentType === type.value;
              return (
                <label
                  key={type.value}
                  className={`flex cursor-pointer items-start gap-2 rounded-lg border p-3 transition-colors ${
                    checked ? "border-primary bg-primary-soft" : "border-slate-300 hover:bg-slate-50"
                  }`}
                >
                  <input
                    type="radio"
                    name="paymentType"
                    value={type.value}
                    checked={checked}
                    onChange={() => change({ paymentType: type.value })}
                    disabled={saving}
                    className="mt-1 accent-primary"
                  />
                  <span>
                    <span className="block text-sm font-semibold text-slate-900">{type.label}</span>
                    <span className="block text-xs text-slate-500">{PAYMENT_HINTS[type.value]}</span>
                  </span>
                </label>
              );
            })}
          </div>
          {fieldErrors.paymentType && <p className="mt-1 text-xs text-red-600">{fieldErrors.paymentType}</p>}
        </fieldset>

        <DateInput
          label="تاريخ الفاتورة"
          required
          value={form.invoiceDate}
          onChange={(value, { invalid }) => {
            change({ invoiceDate: value });
            setDateInvalid(invalid);
          }}
          error={fieldErrors.invoiceDate}
          disabled={saving}
        />

        {renderWarehouse()}
      </form>
    </Modal>
  );
}

export default ConvertToInvoiceModal;
