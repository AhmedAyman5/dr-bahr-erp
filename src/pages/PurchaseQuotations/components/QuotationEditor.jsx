// The quotation form (new + edit) as a full page: header card, the lines, the totals, a sticky save bar.
// Rendered by PurchaseQuotationForm once its data is loaded, so the form state starts from it directly.
//
// - Unsaved changes: a Sidebar link / back button asks first (hooks/useUnsavedChanges); a successful save
//   leaves without asking → the details page with a success message (router state).
// - The live totals are a PREVIEW (quotationForm.getPreview); the details page shows the server's totals.
// - Server errors: the Arabic message on top; a line error ("lines.N.<field>") highlights that row and shows
//   the message under the field. DOES_NOT_EXIST on a dropdown → that choice is cleared and the lists refresh.
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Save } from "lucide-react";
import Alert from "../../../components/ui/Alert";
import Button from "../../../components/ui/Button";
import TotalsBox from "../../../components/documents/TotalsBox";
import LinesTable from "../../../components/documents/LinesTable";
import UnsavedChangesDialog from "../../../components/ui/UnsavedChangesDialog";
import useUnsavedChanges from "../../../hooks/useUnsavedChanges";
import { filledLineIndexes } from "../../../utils/documentLines";
import { getErrorMessage, getLineError } from "../../../utils/errors";
import { createPurchaseQuotation, getProductUnits, updatePurchaseQuotation } from "../purchaseQuotationsApi";
import { getInitialForm, getPreview, isFormDirty, validateForm } from "../quotationForm";
import QuotationHeaderFields from "./QuotationHeaderFields";

const FORM_ID = "quotation-form";
const CHECK_FIELDS = "راجع الحقول المحددة باللون الأحمر";

// A server line field → the field name of the line object (utils/documentLines.js).
const LINE_FIELDS = {
  productId: "productId",
  itemUnitId: "itemUnitId",
  quantity: "quantity",
  unitPrice: "price",
  discountPercent: "discount",
  discountValue: "discount",
  notes: "notes",
};
// A server header field → the form field that shows its error.
const HEADER_FIELDS = {
  supplierId: "supplierId",
  quotationDate: "quotationDate",
  validUntil: "validUntil",
  branchId: "branchId",
  warehouseId: "warehouseId",
  discountPercent: "discount",
  discountValue: "discount",
  taxPercent: "tax",
  notes: "notes",
};
// A dropdown choice that no longer exists (DOES_NOT_EXIST): what to clear.
const CLEAR_ON_MISSING = {
  supplierId: { supplierId: "" },
  branchId: { branchId: "", warehouseId: "" },
  warehouseId: { warehouseId: "" },
};

function isNotFound(err) {
  return err?.response?.status === 404;
}

function QuotationEditor({ quotation, lists, initialUnits, onRefreshLists }) {
  const navigate = useNavigate();
  const isEdit = Boolean(quotation);

  const [initialForm] = useState(() => getInitialForm(quotation, lists.branches));
  const [form, setForm] = useState(initialForm);
  const [invalidDates, setInvalidDates] = useState({ quotationDate: false, validUntil: false });
  const [errors, setErrors] = useState({});
  const [lineErrors, setLineErrors] = useState([]);
  const [linesError, setLinesError] = useState("");
  const [topError, setTopError] = useState("");
  const [statusBlocked, setStatusBlocked] = useState(false); // INVALID_STATUS: link to the details
  const [highlightIndex, setHighlightIndex] = useState(null);
  const [saving, setSaving] = useState(false);
  // The units of each product used on a line (cached): { [productId]: { status, units } }.
  const [unitsByProduct, setUnitsByProduct] = useState(initialUnits);

  const dirty = isFormDirty(form, initialForm) || invalidDates.quotationDate || invalidDates.validUntil;
  const guard = useUnsavedChanges(dirty);
  const preview = getPreview(form);
  const cancelTo = isEdit ? `/purchase-quotations/${quotation.id}` : "/purchase-quotations";

  function changeHeader(changes) {
    setForm({ ...form, ...changes });
    const cleared = { ...errors };
    for (const key of Object.keys(changes)) delete cleared[key];
    setErrors(cleared);
  }

  function changeDate(name, value, { invalid }) {
    changeHeader({ [name]: value });
    setInvalidDates({ ...invalidDates, [name]: invalid });
  }

  // A changed row loses its error marks. Adding / removing a row moves the rows: all marks go.
  function changeLines(lines) {
    if (lines.length !== form.lines.length) {
      setLineErrors([]);
      setHighlightIndex(null);
    } else {
      const changedIndex = lines.findIndex((line, index) => line !== form.lines[index]);
      if (changedIndex !== -1 && lineErrors[changedIndex]) {
        const next = [...lineErrors];
        next[changedIndex] = {};
        setLineErrors(next);
      }
      if (changedIndex === highlightIndex) setHighlightIndex(null);
    }
    setForm({ ...form, lines });
    if (linesError) setLinesError("");
  }

  async function loadUnits(productId, { retry = false } = {}) {
    const cached = unitsByProduct[productId];
    if (cached && !retry && cached.status !== "error") return;
    setUnitsByProduct((old) => ({ ...old, [productId]: { status: "loading", units: [] } }));
    let entry;
    try {
      entry = { status: "ready", units: await getProductUnits(productId) };
    } catch (err) {
      entry = { status: isNotFound(err) ? "missing" : "error", units: [] };
    }
    setUnitsByProduct((old) => ({ ...old, [productId]: entry }));
  }

  function handleSaveError(err) {
    const message = getErrorMessage(err);
    setTopError(message);
    const { code, field } = err.response?.data || {};
    if (code === "INVALID_STATUS") {
      setStatusBlocked(true);
      return;
    }

    const lineError = getLineError(err);
    if (lineError) {
      // "lines.N" = the N-th SENT line (empty rows are not sent) → its row in the form.
      const index = filledLineIndexes(form.lines)[lineError.lineIndex];
      if (index === undefined) return;
      setHighlightIndex(index);
      const lineField = LINE_FIELDS[lineError.field];
      if (lineField) {
        const next = [...lineErrors];
        next[index] = { ...next[index], [lineField]: message };
        setLineErrors(next);
      }
      // A product deleted meanwhile: refresh the lists (it then shows as "(محذوف)").
      if (code === "DOES_NOT_EXIST") onRefreshLists();
      return;
    }

    if (field === "lines") {
      setLinesError(message);
      return;
    }
    const headerField = HEADER_FIELDS[field];
    if (headerField) setErrors({ ...errors, [headerField]: message });
    if (code === "DOES_NOT_EXIST" && CLEAR_ON_MISSING[field]) {
      setForm({ ...form, ...CLEAR_ON_MISSING[field] });
      onRefreshLists();
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setTopError("");
    setStatusBlocked(false);
    setHighlightIndex(null);

    const result = validateForm(form, invalidDates);
    setErrors(result.errors);
    setLineErrors(result.lineErrors);
    setLinesError(result.linesError);
    if (!result.ok) {
      setTopError(CHECK_FIELDS);
      return;
    }

    setSaving(true);
    try {
      const saved = isEdit ? await updatePurchaseQuotation(quotation.id, form) : await createPurchaseQuotation(form);
      const successMessage = isEdit ? "تم حفظ التعديلات" : `تم إنشاء عرض السعر ${saved.code}`;
      // Saved: leave without the unsaved-changes question.
      guard.allowNavigation();
      navigate(`/purchase-quotations/${saved.id}`, { state: { successMessage } });
    } catch (err) {
      handleSaveError(err);
      setSaving(false);
    }
  }

  return (
    <form id={FORM_ID} onSubmit={handleSubmit} noValidate>
      {topError && (
        <Alert type="error" className="mb-4">
          {topError}
          {statusBlocked && isEdit && (
            <Link to={`/purchase-quotations/${quotation.id}`} className="ms-2 font-medium underline">
              عرض التفاصيل
            </Link>
          )}
        </Alert>
      )}

      <QuotationHeaderFields
        form={form}
        errors={errors}
        lists={lists}
        quotation={quotation}
        disabled={saving}
        onChange={changeHeader}
        onDateChange={changeDate}
      />

      <section className="mb-4 rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-base font-semibold text-slate-900">البنود</h2>
        {linesError && (
          <Alert type="error" className="mb-3">
            {linesError}
          </Alert>
        )}
        <LinesTable
          lines={form.lines}
          onChange={changeLines}
          products={lists.products}
          unitsByProduct={unitsByProduct}
          onLoadUnits={loadUnits}
          errors={lineErrors}
          highlightIndex={highlightIndex}
          priceLabel="سعر الوحدة"
          disabled={saving}
        />
      </section>

      <TotalsBox
        subTotal={preview.subTotal}
        discountValue={preview.discountValue}
        taxValue={preview.taxValue}
        netTotal={preview.netTotal}
        editor={{
          discountType: form.discountType,
          discount: form.discount,
          tax: form.tax,
          errors: { discount: errors.discount, tax: errors.tax },
          disabled: saving,
          onDiscountTypeChange: (discountType) => changeHeader({ discountType, discount: "0" }),
          onDiscountChange: (discount) => changeHeader({ discount }),
          onTaxChange: (tax) => changeHeader({ tax }),
        }}
      />

      {/* Save bar: stays at the bottom of the screen while the page scrolls. The negative bottom / margins cancel
          <main>'s padding, so the bar touches the screen's bottom edge and spans the whole content width. */}
      <div className="sticky -bottom-4 z-10 -mx-4 -mb-4 mt-6 flex items-center gap-2 border-t border-slate-200 bg-white px-4 py-3 lg:-bottom-6 lg:-mx-6 lg:-mb-6 lg:px-6">
        <Button type="submit" loading={saving}>
          <Save size={16} />
          حفظ
        </Button>
        <Button variant="secondary" disabled={saving} onClick={() => navigate(cancelTo)}>
          إلغاء
        </Button>
      </div>

      <UnsavedChangesDialog guard={guard} />
    </form>
  );
}

export default QuotationEditor;
