// The purchase invoice form (new + edit) as a full page: header card, the lines, the totals (+ paid / remaining),
// a sticky save bar. Rendered by PurchaseInvoiceForm once its data is loaded, so the form state starts from it.
// Same pattern as the quotation form (pages/PurchaseQuotations/components/QuotationEditor), plus:
// - payment type (نقدي / آجل) → the paid / remaining rows of the totals; آجل also has a due date;
// - currency + exchange rate (another currency than the default one);
// - expiry date / batch number under the product of each line (components/LineExpiryFields);
// - the duplicate supplier bill check: on leaving رقم فاتورة المورد (or choosing the supplier) the server is asked
//   whether this supplier already has an invoice with this number → an amber warning (never blocks saving).
//   Saving with a number that was not checked yet checks first: a duplicate then asks "حفظ على أي حال".
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Save } from "lucide-react";
import Alert from "../../../components/ui/Alert";
import Button from "../../../components/ui/Button";
import ConfirmDialog from "../../../components/ui/ConfirmDialog";
import TotalsBox from "../../../components/documents/TotalsBox";
import LinesTable from "../../../components/documents/LinesTable";
import UnsavedChangesDialog from "../../../components/ui/UnsavedChangesDialog";
import useUnsavedChanges from "../../../hooks/useUnsavedChanges";
import { filledLineIndexes } from "../../../utils/documentLines";
import { getErrorMessage, getLineError } from "../../../utils/errors";
import {
  createPurchaseInvoice,
  getProductUnits,
  searchSupplierInvoices,
  updatePurchaseInvoice,
} from "../purchaseInvoicesApi";
import {
  autoWarehouseId,
  findDuplicateInvoice,
  getDefaultCurrency,
  getInitialForm,
  getPreview,
  isFormDirty,
  showsBatchInput,
  validateForm,
} from "../invoiceForm";
import InvoiceHeaderFields from "./InvoiceHeaderFields";
import LineExpiryFields from "./LineExpiryFields";

const FORM_ID = "invoice-form";
const CHECK_FIELDS = "راجع الحقول المحددة باللون الأحمر";

// A server line field → the field name of the line object (utils/documentLines.js).
const LINE_FIELDS = {
  productId: "productId",
  itemUnitId: "itemUnitId",
  quantity: "quantity",
  unitCost: "price",
  discountPercent: "discount",
  discountValue: "discount",
  batchNumber: "batchNumber",
  expiryDate: "expiryDate",
  notes: "notes",
};
// A server header field → the form field that shows its error.
const HEADER_FIELDS = {
  supplierId: "supplierId",
  supplierInvoiceNumber: "supplierInvoiceNumber",
  invoiceDate: "invoiceDate",
  dueDate: "dueDate",
  paymentType: "paymentType",
  branchId: "branchId",
  warehouseId: "warehouseId",
  currencyId: "currencyId",
  exchangeRate: "exchangeRate",
  discountPercent: "discount",
  discountValue: "discount",
  taxPercent: "tax",
  paidAmount: "paidAmount",
  notes: "notes",
};
// A dropdown choice that no longer exists (DOES_NOT_EXIST): what to clear.
const CLEAR_ON_MISSING = {
  supplierId: { supplierId: "" },
  branchId: { branchId: "", warehouseId: "" },
  warehouseId: { warehouseId: "" },
  currencyId: { currencyId: "", exchangeRate: "" },
};

function isNotFound(err) {
  return err?.response?.status === 404;
}

// The pair the duplicate check looks at, e.g. "s1|nile-778" ("" when one of them is empty).
function billKey(form) {
  const number = form.supplierInvoiceNumber.trim().toLowerCase();
  return form.supplierId && number ? `${form.supplierId}|${number}` : "";
}

function InvoiceEditor({ invoice, lists, initialUnits, onRefreshLists }) {
  const navigate = useNavigate();
  const isEdit = Boolean(invoice);
  const defaultCurrency = getDefaultCurrency(lists.currencies);
  const productById = new Map(lists.products.map((product) => [product.id, product]));

  const [initialForm] = useState(() => getInitialForm(invoice, lists));
  const [form, setForm] = useState(initialForm);
  const [invalidDates, setInvalidDates] = useState({ invoiceDate: false, dueDate: false });
  const [errors, setErrors] = useState({});
  const [lineErrors, setLineErrors] = useState([]);
  const [linesError, setLinesError] = useState("");
  const [topError, setTopError] = useState("");
  const [statusBlocked, setStatusBlocked] = useState(false); // INVALID_STATUS: link to the details
  const [highlightIndex, setHighlightIndex] = useState(null);
  const [saving, setSaving] = useState(false);
  // The units of each product used on a line (cached): { [productId]: { status, units } }.
  const [unitsByProduct, setUnitsByProduct] = useState(initialUnits);
  // Answers of the duplicate check: { [billKey]: the other invoice or null }. The warning shows the answer for
  // the CURRENT supplier + number, so an answer found earlier is on screen whenever it still applies.
  const [billChecks, setBillChecks] = useState({});
  const [duplicateToConfirm, setDuplicateToConfirm] = useState(null);

  const dirty =
    isFormDirty(form, initialForm) ||
    invalidDates.invoiceDate ||
    (form.paymentType === "CREDIT" && invalidDates.dueDate);
  const guard = useUnsavedChanges(dirty);
  const preview = getPreview(form);
  const cancelTo = isEdit ? `/purchase-invoices/${invoice.id}` : "/purchase-invoices";
  const duplicate = billChecks[billKey(form)] ?? null;
  const currency = lists.currencies.find((item) => item.id === form.currencyId);

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

  // Another branch → its warehouses: the chosen one is cleared (or the branch's only warehouse is chosen).
  function changeBranch(branchId) {
    changeHeader({ branchId, warehouseId: autoWarehouseId(lists.inventories, branchId) });
  }

  // Another currency → its own rate: the typed one is cleared.
  function changeCurrency(currencyId) {
    changeHeader({ currencyId, exchangeRate: "" });
  }

  // Asks the server for the supplier's invoices with this number (exact match kept). Answer stored by key.
  // A failed check shows nothing: it is a warning only.
  async function checkBill(nextForm) {
    const key = billKey(nextForm);
    if (!key) return null;
    try {
      const invoices = await searchSupplierInvoices(nextForm.supplierId, nextForm.supplierInvoiceNumber.trim());
      const found = findDuplicateInvoice(invoices, nextForm.supplierInvoiceNumber, invoice?.id);
      setBillChecks((old) => ({ ...old, [key]: found }));
      return found;
    } catch {
      return null;
    }
  }

  function changeSupplier(supplierId) {
    const nextForm = { ...form, supplierId };
    changeHeader({ supplierId });
    if (billKey(nextForm) && !(billKey(nextForm) in billChecks)) checkBill(nextForm);
  }

  function handleBillNumberBlur() {
    if (billKey(form) && !(billKey(form) in billChecks)) checkBill(form);
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

  async function save() {
    setSaving(true);
    try {
      const saved = isEdit
        ? await updatePurchaseInvoice(invoice.id, form, defaultCurrency?.id)
        : await createPurchaseInvoice(form, defaultCurrency?.id);
      const successMessage = isEdit ? "تم حفظ التعديلات" : `تم إنشاء فاتورة الشراء ${saved.code}`;
      // Saved: leave without the unsaved-changes question.
      guard.allowNavigation();
      navigate(`/purchase-invoices/${saved.id}`, { state: { successMessage } });
    } catch (err) {
      handleSaveError(err);
      setSaving(false);
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setTopError("");
    setStatusBlocked(false);
    setHighlightIndex(null);

    const result = validateForm(form, invalidDates, productById, defaultCurrency?.id);
    setErrors(result.errors);
    setLineErrors(result.lineErrors);
    setLinesError(result.linesError);
    if (!result.ok) {
      setTopError(CHECK_FIELDS);
      return;
    }

    // A number that was never checked (e.g. Enter in the field): check it now. A duplicate whose warning was
    // already on screen saves directly; a new one asks first.
    const key = billKey(form);
    if (key && !(key in billChecks)) {
      setSaving(true);
      const found = await checkBill(form);
      setSaving(false);
      if (found) {
        setDuplicateToConfirm(found);
        return;
      }
    }
    await save();
  }

  // تاريخ الصلاحية / رقم التشغيلة under the product (LinesTable renderLineDetails).
  function renderLineDetails(line, index, update) {
    return (
      <LineExpiryFields
        line={line}
        index={index}
        product={productById.get(line.productId)}
        invoiceDate={form.invoiceDate}
        errors={lineErrors[index]}
        update={update}
        disabled={saving}
      />
    );
  }

  // "+ رقم التشغيلة" next to "+ ملاحظة للبند": STOCK products whose batch input is not shown yet.
  function getLineLinks(line, index, update) {
    const product = productById.get(line.productId);
    if (product?.itemType !== "STOCK" || showsBatchInput(line, product)) return [];
    return [{ key: "batch", label: "+ رقم التشغيلة", onClick: () => update({ batchOpen: true }) }];
  }

  // المدفوع / المتبقي under الصافي: نقدي = paid in full; آجل = the paid input; nothing chosen → no rows.
  function getPaymentRows() {
    if (form.paymentType === "CASH") {
      return [
        { key: "paid", label: "المدفوع", value: preview.paid, hint: "مدفوع بالكامل" },
        { key: "remaining", label: "المتبقي", value: 0 },
      ];
    }
    if (form.paymentType === "CREDIT") {
      return [
        {
          key: "paid",
          label: "المدفوع",
          input: {
            value: form.paidAmount,
            onChange: (paidAmount) => changeHeader({ paidAmount }),
            error: errors.paidAmount,
            disabled: saving,
          },
        },
        { key: "remaining", label: "المتبقي", value: preview.remaining, strong: true },
      ];
    }
    return [];
  }

  const currencyCaption =
    currency && !currency.isDefault ? `المبالغ بعملة: ${currency.name} (${currency.code})` : undefined;

  return (
    <form id={FORM_ID} onSubmit={handleSubmit} noValidate>
      {topError && (
        <Alert type="error" className="mb-4">
          {topError}
          {statusBlocked && isEdit && (
            <Link to={`/purchase-invoices/${invoice.id}`} className="ms-2 font-medium underline">
              عرض التفاصيل
            </Link>
          )}
        </Alert>
      )}

      <InvoiceHeaderFields
        form={form}
        errors={errors}
        lists={lists}
        invoice={invoice}
        disabled={saving}
        duplicate={duplicate}
        onChange={changeHeader}
        onDateChange={changeDate}
        onSupplierChange={changeSupplier}
        onBranchChange={changeBranch}
        onCurrencyChange={changeCurrency}
        onBillNumberBlur={handleBillNumberBlur}
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
          priceLabel="سعر شراء الوحدة"
          showBaseQuantity
          renderLineDetails={renderLineDetails}
          getLineLinks={getLineLinks}
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
        extraRows={getPaymentRows()}
        currencyCaption={currencyCaption}
      />

      {/* Save bar: stays at the bottom of the screen while the page scrolls (see QuotationEditor). */}
      <div className="sticky -bottom-4 z-10 -mx-4 -mb-4 mt-6 flex items-center gap-2 border-t border-slate-200 bg-white px-4 py-3 lg:-bottom-6 lg:-mx-6 lg:-mb-6 lg:px-6">
        <Button type="submit" loading={saving}>
          <Save size={16} />
          حفظ
        </Button>
        <Button variant="secondary" disabled={saving} onClick={() => navigate(cancelTo)}>
          إلغاء
        </Button>
      </div>

      <ConfirmDialog
        open={Boolean(duplicateToConfirm)}
        title="رقم فاتورة مكرر"
        message={`هذا الرقم مسجل في الفاتورة ${duplicateToConfirm?.code ?? ""} لنفس المورد. هل تريد الحفظ على أي حال؟`}
        confirmLabel="حفظ على أي حال"
        confirmVariant="primary"
        cancelLabel="رجوع"
        onConfirm={() => {
          setDuplicateToConfirm(null);
          save();
        }}
        onCancel={() => setDuplicateToConfirm(null)}
      />
      <UnsavedChangesDialog guard={guard} />
    </form>
  );
}

export default InvoiceEditor;
