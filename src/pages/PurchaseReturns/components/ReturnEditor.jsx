// The purchase return form (new + edit) as a full page: header card, the lines, the totals (+ the refund), a sticky
// save bar. Rendered by PurchaseReturnForm once its data is loaded, so the form state starts from it.
// Same pattern as the invoice form (pages/PurchaseInvoices/components/InvoiceEditor), with two kinds:
// - LINKED (من فاتورة شراء): the invoice (GET /purchase-invoices/:id) + what is left to return (/returnable) load when
//   it is chosen; components/InvoiceReturnLines shows one row per invoice line. The totals preview uses the invoice's
//   discount SHARE and tax % (read only, "من الفاتورة"). Other DRAFT returns of the invoice → an amber note (the
//   first one posted takes the quantity).
// - NOT LINKED (بدون فاتورة): LinesTable without the line discount column + the header discount / tax like an invoice.
// - Both: the stock of the warehouse (GET /product-inventory/inventory/:id) under each product ("المتاح في المخزن"),
//   amber when this return needs more (a warning only); المبلغ المسترد نقدًا in the totals.
// - A linked return whose invoice is no longer POSTED (cancelled / deleted meanwhile): amber alert, حفظ disabled
//   (leaving still asks about unsaved changes). A new return from a link (?invoice=) to an invoice that is not
//   POSTED: a clear message + a link back to it.
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Save } from "lucide-react";
import Alert from "../../../components/ui/Alert";
import Button from "../../../components/ui/Button";
import EmptyState from "../../../components/ui/EmptyState";
import ErrorState from "../../../components/ui/ErrorState";
import LoadingState from "../../../components/ui/LoadingState";
import TotalsBox from "../../../components/documents/TotalsBox";
import LinesTable from "../../../components/documents/LinesTable";
import UnsavedChangesDialog from "../../../components/ui/UnsavedChangesDialog";
import useLoadData from "../../../hooks/useLoadData";
import useUnsavedChanges from "../../../hooks/useUnsavedChanges";
import { filledLineIndexes } from "../../../utils/documentLines";
import { getErrorMessage, getLineError } from "../../../utils/errors";
import { DOCUMENT_STATUSES, getLabel } from "../../../utils/labels";
import {
  createPurchaseReturn,
  getPostedInvoices,
  getProductUnits,
  getPurchaseInvoice,
  getReturnable,
  getWarehouseStock,
  updatePurchaseReturn,
} from "../purchaseReturnsApi";
import {
  INVOICE_NOT_POSTED,
  autoWarehouseId,
  freeStockItems,
  getDefaultCurrency,
  getInitialForm,
  getPreview,
  getShortProducts,
  isFormDirty,
  linkedStockItems,
  piecesByProduct,
  sentLineIds,
  toStockMap,
  validateForm,
} from "../returnForm";
import InvoiceReturnLines from "./InvoiceReturnLines";
import ReturnHeaderFields from "./ReturnHeaderFields";
import StockHint from "./StockHint";

const FORM_ID = "return-form";
const CHECK_FIELDS = "راجع الحقول المحددة باللون الأحمر";
const REFUND_HINT = "اتركه 0 لو سيُخصم المرتجع من حساب المورد";

// A server line field → the field name of a not-linked line object (utils/documentLines.js).
const FREE_LINE_FIELDS = { productId: "productId", itemUnitId: "itemUnitId", quantity: "quantity", unitCost: "price", notes: "notes" };
// A server line field → the field of a linked row (form.quantities[lineId]).
const LINKED_ROW_FIELDS = { quantity: "quantity", notes: "notes", purchaseInvoiceLineId: "quantity" };
// A server header field → the form field that shows its error.
const HEADER_FIELDS = {
  returnDate: "returnDate",
  purchaseInvoiceId: "purchaseInvoiceId",
  supplierId: "supplierId",
  branchId: "branchId",
  warehouseId: "warehouseId",
  discountPercent: "discount",
  discountValue: "discount",
  taxPercent: "tax",
  refundAmount: "refundAmount",
  reason: "reason",
  notes: "notes",
};
// A not-linked dropdown choice that no longer exists (DOES_NOT_EXIST): what to clear.
const CLEAR_ON_MISSING = {
  supplierId: { supplierId: "" },
  branchId: { branchId: "", warehouseId: "" },
  warehouseId: { warehouseId: "" },
};

function isNotFound(err) {
  return err?.response?.status === 404;
}

// The linked invoice + what is left to return, or { missing: true } (deleted / unknown id), or null (none chosen).
async function loadInvoiceData(invoiceId) {
  if (!invoiceId) return null;
  try {
    const [invoice, returnable] = await Promise.all([getPurchaseInvoice(invoiceId), getReturnable(invoiceId)]);
    return { invoice, returnable };
  } catch (err) {
    if (isNotFound(err)) return { missing: true };
    throw err;
  }
}

// The stock of a warehouse, or null (none chosen / deleted warehouse: no hint).
async function loadStock(warehouseId) {
  if (!warehouseId) return null;
  try {
    return await getWarehouseStock(warehouseId);
  } catch (err) {
    if (isNotFound(err)) return null;
    throw err;
  }
}

function ReturnEditor({ ret, lists, initialUnits, linkInvoiceId, onRefreshLists }) {
  const navigate = useNavigate();
  const isEdit = Boolean(ret);
  // The kind is fixed on edit and when the invoice came from the link; so is the invoice of a linked one.
  const kindLocked = isEdit || Boolean(linkInvoiceId);
  const productById = new Map(lists.products.map((product) => [product.id, product]));
  const defaultCurrency = getDefaultCurrency(lists.currencies);

  const [initialForm] = useState(() => getInitialForm(ret, lists, linkInvoiceId));
  const [form, setForm] = useState(initialForm);
  const [invalidDates, setInvalidDates] = useState({ returnDate: false });
  const [errors, setErrors] = useState({});
  const [lineErrors, setLineErrors] = useState([]); // not linked: per row
  const [rowErrors, setRowErrors] = useState({}); // linked: per invoice line id
  const [linesError, setLinesError] = useState("");
  const [topError, setTopError] = useState("");
  const [statusBlocked, setStatusBlocked] = useState(false); // INVALID_STATUS: link to the details
  const [highlightIndex, setHighlightIndex] = useState(null); // not linked
  const [highlightLineId, setHighlightLineId] = useState(null); // linked
  const [saving, setSaving] = useState(false);
  // The units of each product used on a not-linked line (cached): { [productId]: { status, units } }.
  const [unitsByProduct, setUnitsByProduct] = useState(initialUnits);

  const isLinked = form.kind === "linked";
  const invoiceLocked = isLinked && kindLocked;

  // The linked invoice (+ returnable), loaded whenever the chosen invoice changes.
  const invoiceLoad = useLoadData(() => loadInvoiceData(isLinked ? form.purchaseInvoiceId : ""), [
    isLinked ? form.purchaseInvoiceId : "",
  ]);
  const invoiceData = invoiceLoad.loading ? null : invoiceLoad.data;
  const invoice = invoiceData?.invoice ?? null;
  const returnable = invoiceData?.returnable ?? null;
  const invoiceMissing = Boolean(invoiceData?.missing);
  const invoiceNotPosted = Boolean(invoice) && invoice.status !== "POSTED";
  const blocked = isLinked && (invoiceMissing || invoiceNotPosted);

  // The invoice picker (new linked return): the newest 100 POSTED invoices, of one supplier when chosen.
  const pickerOn = isLinked && !invoiceLocked;
  const pickerLoad = useLoadData(() => (pickerOn ? getPostedInvoices(form.filterSupplierId) : []), [
    pickerOn ? "on" : "off",
    form.filterSupplierId,
  ]);

  // The stock of the return's warehouse (linked: the invoice's).
  const warehouseId = isLinked ? (invoice?.warehouseId ?? "") : form.warehouseId;
  const stockLoad = useLoadData(() => loadStock(warehouseId), [warehouseId]);
  const stockReady = !stockLoad.loading && !stockLoad.error && Array.isArray(stockLoad.data);
  const stockMap = toStockMap(stockReady ? stockLoad.data : []);
  const needed = piecesByProduct(
    isLinked ? linkedStockItems(form, invoice) : freeStockItems(form, productById, unitsByProduct),
  );
  const shortProducts = stockReady ? getShortProducts(needed, stockMap) : new Set();

  const dirty = isFormDirty(form, initialForm) || invalidDates.returnDate;
  const guard = useUnsavedChanges(dirty);
  const preview = getPreview(form, invoice);
  const cancelTo = isEdit ? `/purchase-returns/${ret.id}` : "/purchase-returns";

  function primaryUnitName(productId) {
    return productById.get(productId)?.primaryItemUnit?.name || "قطعة";
  }

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

  // Another kind (new return only): its own errors and line marks.
  function changeKind(kind) {
    setForm({ ...form, kind });
    setErrors({});
    setLineErrors([]);
    setRowErrors({});
    setLinesError("");
    setTopError("");
    setHighlightIndex(null);
    setHighlightLineId(null);
  }

  // Another invoice → its own lines: the typed quantities are cleared.
  function changeInvoice(purchaseInvoiceId) {
    changeHeader({ purchaseInvoiceId, quantities: {} });
    setRowErrors({});
    setLinesError("");
    setHighlightLineId(null);
  }

  // The picker's supplier: a chosen invoice of another supplier is cleared.
  function changeFilterSupplier(filterSupplierId) {
    const keepInvoice = !filterSupplierId || !invoice || invoice.supplierId === filterSupplierId;
    if (keepInvoice) changeHeader({ filterSupplierId });
    else changeHeader({ filterSupplierId, purchaseInvoiceId: "", quantities: {} });
  }

  function changeBranch(branchId) {
    changeHeader({ branchId, warehouseId: autoWarehouseId(lists.inventories, branchId) });
  }

  // A linked row changed: it loses its error marks.
  function changeRow(lineId, changes) {
    const old = form.quantities[lineId] ?? { quantity: "", notes: "", notesOpen: false };
    setForm({ ...form, quantities: { ...form.quantities, [lineId]: { ...old, ...changes } } });
    if (rowErrors[lineId]) {
      const next = { ...rowErrors };
      delete next[lineId];
      setRowErrors(next);
    }
    if (lineId === highlightLineId) setHighlightLineId(null);
    if (linesError) setLinesError("");
  }

  // A changed not-linked row loses its error marks. Adding / removing a row moves the rows: all marks go.
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

  function handleLineError(err, message, code) {
    const lineError = getLineError(err);
    if (isLinked) {
      // "lines.N" = the N-th SENT line = the N-th invoice row with a quantity.
      const lineId = sentLineIds(form, invoice)[lineError.lineIndex];
      if (!lineId) return;
      setHighlightLineId(lineId);
      const field = LINKED_ROW_FIELDS[lineError.field];
      if (field) setRowErrors({ ...rowErrors, [lineId]: { ...rowErrors[lineId], [field]: message } });
      // Another return was posted meanwhile: show what is left now.
      if (code === "QUANTITY_EXCEEDED") invoiceLoad.refresh();
      return;
    }
    // "lines.N" = the N-th SENT line (empty rows are not sent) → its row in the form.
    const index = filledLineIndexes(form.lines)[lineError.lineIndex];
    if (index === undefined) return;
    setHighlightIndex(index);
    const field = FREE_LINE_FIELDS[lineError.field];
    if (field) {
      const next = [...lineErrors];
      next[index] = { ...next[index], [field]: message };
      setLineErrors(next);
    }
    if (code === "DOES_NOT_EXIST") onRefreshLists();
  }

  function handleSaveError(err) {
    const message = getErrorMessage(err);
    setTopError(message);
    const { code, field } = err.response?.data || {};
    if (code === "INVALID_STATUS") {
      setStatusBlocked(true);
      return;
    }
    if (getLineError(err)) {
      handleLineError(err, message, code);
      return;
    }
    if (field === "lines") {
      setLinesError(message);
      return;
    }
    // The invoice was cancelled / deleted meanwhile: load it again → the "no longer posted" alert.
    if (field === "purchaseInvoiceId") {
      invoiceLoad.refresh();
      return;
    }
    const headerField = HEADER_FIELDS[field];
    if (headerField) setErrors({ ...errors, [headerField]: message });
    if (!isLinked && code === "DOES_NOT_EXIST" && CLEAR_ON_MISSING[field]) {
      setForm({ ...form, ...CLEAR_ON_MISSING[field] });
      onRefreshLists();
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (blocked) return;
    setTopError("");
    setStatusBlocked(false);
    setHighlightIndex(null);
    setHighlightLineId(null);

    const result = validateForm(form, invalidDates, { invoice, returnable });
    setErrors(result.errors);
    setLineErrors(result.lineErrors);
    setRowErrors(result.rowErrors);
    setLinesError(result.linesError);
    if (!result.ok) {
      setTopError(CHECK_FIELDS);
      return;
    }

    setSaving(true);
    const invoiceLineIds = isLinked ? invoice.lines.map((line) => line.id) : [];
    try {
      const saved = isEdit
        ? await updatePurchaseReturn(ret.id, form, invoiceLineIds)
        : await createPurchaseReturn(form, invoiceLineIds);
      const successMessage = isEdit ? "تم حفظ التعديلات" : `تم إنشاء مرتجع الشراء ${saved.code}`;
      // Saved: leave without the unsaved-changes question.
      guard.allowNavigation();
      navigate(`/purchase-returns/${saved.id}`, { state: { successMessage } });
    } catch (err) {
      handleSaveError(err);
      setSaving(false);
    }
  }

  // ─── Rendering ─────────────────────────────────────────────────────────────────────────────────────────

  function stockHintFor(productId, itemType) {
    return (
      <StockHint
        itemType={itemType}
        stock={stockMap.get(productId)}
        stockReady={stockReady}
        unitName={primaryUnitName(productId)}
        short={shortProducts.has(productId)}
      />
    );
  }

  // The amber alert of a linked return whose invoice can't be used.
  function renderBlockedAlert() {
    if (!blocked) return null;
    if (isEdit) {
      return (
        <Alert type="warning" className="mb-4">
          {INVOICE_NOT_POSTED}
        </Alert>
      );
    }
    const invoiceLink = (
      <Link to={`/purchase-invoices/${form.purchaseInvoiceId}`} className="ms-1 font-medium underline">
        عرض الفاتورة
      </Link>
    );
    return (
      <Alert type="warning" className="mb-4">
        {invoiceMissing ? (
          "فاتورة الشراء غير موجودة أو محذوفة"
        ) : (
          <>
            لا يمكن عمل مرتجع من الفاتورة <span dir="ltr">{invoice.code}</span> لأن حالتها «
            {getLabel(DOCUMENT_STATUSES, invoice.status)}»؛ المرتجع يكون من فاتورة مُرحّلة فقط.
            {invoiceLink}
          </>
        )}
      </Alert>
    );
  }

  // Other DRAFT returns of the same invoice: the first one posted takes the quantity.
  function renderOtherDrafts() {
    const drafts = (invoice?.purchaseReturns ?? []).filter((item) => item.status === "DRAFT" && item.id !== ret?.id);
    if (drafts.length === 0) return null;
    return (
      <Alert type="warning" className="mb-3">
        توجد مرتجعات مسودة أخرى على هذه الفاتورة:{" "}
        {drafts.map((item, index) => (
          <span key={item.id}>
            {index > 0 && "، "}
            <Link to={`/purchase-returns/${item.id}`} dir="ltr" className="font-medium underline">
              {item.code}
            </Link>
          </span>
        ))}{" "}
        — أول مرتجع يُرحَّل يأخذ الكمية
      </Alert>
    );
  }

  function renderLinkedLines() {
    if (!form.purchaseInvoiceId) return <p className="text-sm text-slate-500">اختر فاتورة الشراء لعرض بنودها</p>;
    if (invoiceLoad.loading) return <LoadingState message="جارٍ تحميل بنود الفاتورة..." />;
    if (invoiceLoad.error) return <ErrorState message={invoiceLoad.error} onRetry={invoiceLoad.reload} />;
    if (!invoice || !returnable) return null;
    const anyLeft = returnable.lines.some((line) => Number(line.remainingQuantity) > 0);
    if (!anyLeft) {
      return (
        <EmptyState
          message="تم إرجاع كل بنود هذه الفاتورة بالكامل، لا توجد كميات متاحة للإرجاع"
          action={
            <Button to={`/purchase-invoices/${invoice.id}`} variant="secondary">
              عرض الفاتورة
            </Button>
          }
        />
      );
    }
    return (
      <>
        {renderOtherDrafts()}
        <InvoiceReturnLines
          invoice={invoice}
          returnable={returnable}
          quantities={form.quantities}
          onChange={changeRow}
          lineTotals={preview.lineTotals}
          errors={rowErrors}
          highlightLineId={highlightLineId}
          primaryUnitName={primaryUnitName}
          renderStockHint={(line) => stockHintFor(line.productId, line.product?.itemType)}
          disabled={saving || blocked}
        />
      </>
    );
  }

  function renderFreeLines() {
    return (
      <LinesTable
        lines={form.lines}
        onChange={changeLines}
        products={lists.products}
        unitsByProduct={unitsByProduct}
        onLoadUnits={loadUnits}
        errors={lineErrors}
        highlightIndex={highlightIndex}
        priceLabel="سعر الوحدة"
        showDiscount={false}
        showBaseQuantity
        renderLineDetails={(line) =>
          line.productId ? stockHintFor(line.productId, productById.get(line.productId)?.itemType) : null
        }
        disabled={saving}
      />
    );
  }

  const refundRow = {
    key: "refund",
    label: "المبلغ المسترد نقدًا",
    input: {
      value: form.refundAmount,
      onChange: (refundAmount) => changeHeader({ refundAmount }),
      error: errors.refundAmount,
      disabled: saving || blocked,
      hint: REFUND_HINT,
    },
  };
  const invoiceCurrency = invoice?.currency;
  const currencyCaption =
    isLinked && invoiceCurrency && invoiceCurrency.id !== defaultCurrency?.id
      ? `المبالغ بعملة الفاتورة: ${invoiceCurrency.name} (${invoiceCurrency.code})`
      : undefined;
  const saveTitle = blocked ? (isEdit ? INVOICE_NOT_POSTED : "اختر فاتورة شراء مُرحّلة") : undefined;

  return (
    <form id={FORM_ID} onSubmit={handleSubmit} noValidate>
      {topError && (
        <Alert type="error" className="mb-4">
          {topError}
          {statusBlocked && isEdit && (
            <Link to={`/purchase-returns/${ret.id}`} className="ms-2 font-medium underline">
              عرض التفاصيل
            </Link>
          )}
        </Alert>
      )}
      {renderBlockedAlert()}

      <ReturnHeaderFields
        form={form}
        errors={errors}
        lists={lists}
        ret={ret}
        kindLocked={kindLocked}
        invoiceLocked={invoiceLocked}
        invoice={invoice}
        pickerInvoices={pickerOn && !pickerLoad.loading ? (pickerLoad.data ?? []) : []}
        pickerLoading={pickerOn && pickerLoad.loading}
        disabled={saving}
        onChange={changeHeader}
        onDateChange={changeDate}
        onKindChange={changeKind}
        onFilterSupplierChange={changeFilterSupplier}
        onInvoiceChange={changeInvoice}
        onBranchChange={changeBranch}
      />
      {pickerOn && pickerLoad.error && (
        <Alert type="error" className="mb-4">
          تعذر تحميل فواتير الشراء: {pickerLoad.error}
        </Alert>
      )}

      <section className="mb-4 rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-base font-semibold text-slate-900">البنود</h2>
        {linesError && (
          <Alert type="error" className="mb-3">
            {linesError}
          </Alert>
        )}
        {isLinked ? renderLinkedLines() : renderFreeLines()}
      </section>

      {isLinked ? (
        <TotalsBox
          subTotal={preview.subTotal}
          discountValue={preview.discountValue}
          discountPercent={invoice?.discountPercent}
          taxValue={preview.taxValue}
          taxPercent={invoice?.taxPercent}
          netTotal={preview.netTotal}
          preview
          ratesNote="من الفاتورة"
          extraRows={[refundRow]}
          currencyCaption={currencyCaption}
        />
      ) : (
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
          extraRows={[refundRow]}
        />
      )}

      {/* Save bar: stays at the bottom of the screen while the page scrolls (see InvoiceEditor). */}
      <div className="sticky -bottom-4 z-10 -mx-4 -mb-4 mt-6 flex items-center gap-2 border-t border-slate-200 bg-white px-4 py-3 lg:-bottom-6 lg:-mx-6 lg:-mb-6 lg:px-6">
        {blocked ? (
          // A disabled button shows no tooltip in every browser: the title sits on a wrapper.
          <span title={saveTitle}>
            <Button type="submit" disabled>
              <Save size={16} />
              حفظ
            </Button>
          </span>
        ) : (
          <Button type="submit" loading={saving} disabled={isLinked && invoiceLoad.loading && Boolean(form.purchaseInvoiceId)}>
            <Save size={16} />
            حفظ
          </Button>
        )}
        <Button variant="secondary" disabled={saving} onClick={() => navigate(cancelTo)}>
          إلغاء
        </Button>
      </div>

      <UnsavedChangesDialog guard={guard} />
    </form>
  );
}

export default ReturnEditor;
