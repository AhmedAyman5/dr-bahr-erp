// Plain functions of the purchase return pages (PurchaseReturnForm / components/ReturnEditor / details):
// starting values, the unsaved-changes check, the live totals preview of both kinds, the client validation and the
// stock checks ("المتاح في المخزن"). No React, no API calls. The body is built in purchaseReturnsApi.js.
//
// The form object (every number is the typed text):
//   { kind: "linked" | "free",                                 // من فاتورة شراء / بدون فاتورة (fixed after creation)
//     returnDate, reason, notes, refundAmount,                 // both kinds
//     filterSupplierId, purchaseInvoiceId,                     // linked: the picker's supplier filter + the invoice
//     quantities: { [invoiceLineId]: { quantity, notes, notesOpen } },  // linked: what is returned per invoice line
//     supplierId, branchId, warehouseId,                       // not linked
//     discountType: "percent" | "amount", discount, tax,       // not linked (linked: the invoice's)
//     lines: [line objects, utils/documentLines.js] }          // not linked
import { todayDay } from "../../utils/dates";
import { calcDocumentTotals, calcLineTotal, roundHalfUp } from "../../utils/documentTotals";
import {
  LINE_NOTES_MAX,
  filledLineIndexes,
  lineFromServer,
  newLine,
  validateLines,
  validatePercent,
} from "../../utils/documentLines";
import { validateMoney } from "../../utils/money";

export const REASON_MAX = 250;
export const NOTES_MAX = 500;
// Returns that can still be edited / deleted / posted (week2flow §6.3): only a draft.
export const EDITABLE_STATUSES = ["DRAFT"];
// Quick picks that fill سبب الإرجاع (free text stays possible).
export const REASON_CHIPS = ["تالف", "منتهي الصلاحية", "زيادة عن المطلوب", "خطأ في التوريد"];
export const RETURN_BEFORE_INVOICE = "تاريخ المرتجع لا يمكن أن يكون قبل تاريخ الفاتورة";
export const REFUND_TOO_MUCH = "المبلغ المسترد أكبر من صافي المرتجع";
export const NO_QUANTITY = "أدخل كمية بند واحد على الأقل";
// A linked DRAFT whose invoice was cancelled / deleted meanwhile: it can't be saved or posted any more.
export const INVOICE_NOT_POSTED =
  "الفاتورة الأصلية لم تعد مُرحّلة، لا يمكن حفظ هذا المرتجع أو ترحيله — احذفه وأنشئ مرتجعًا جديدًا";

const DECIMALS_4 = { maxDecimals: 4 };

// An API day ("2026-11-20T00:00:00.000Z") → "2026-11-20" (never through a Date: the day must not shift).
export function toDay(value) {
  return value ? value.slice(0, 10) : "";
}

function isBlank(text) {
  return String(text ?? "").trim() === "";
}

// A typed number → a number, or null when it is not a plain number.
function toNumber(text) {
  const value = String(text ?? "").trim();
  return /^\d+(\.\d+)?$/.test(value) ? Number(value) : null;
}

export function getDefaultCurrency(currencies) {
  return currencies.find((currency) => currency.isDefault) ?? null;
}

// The warehouses of a branch; the only one is chosen by itself.
export function getBranchWarehouses(inventories, branchId) {
  return inventories.filter((inventory) => inventory.branchId === branchId);
}

export function autoWarehouseId(inventories, branchId) {
  const warehouses = branchId ? getBranchWarehouses(inventories, branchId) : [];
  return warehouses.length === 1 ? warehouses[0].id : "";
}

// The saved lines of a linked return → { [invoiceLineId]: { quantity, notes, notesOpen } }. Two saved lines on the
// same invoice line (possible through the API) are added together: the form has one row per invoice line.
export function quantitiesFromLines(lines) {
  const quantities = {};
  for (const line of lines) {
    const id = line.purchaseInvoiceLineId;
    if (!id) continue;
    const old = quantities[id];
    const quantity = old ? roundHalfUp(Number(old.quantity) + Number(line.quantity), 4) : Number(line.quantity);
    const notes = old?.notes || line.notes || "";
    quantities[id] = { quantity: String(quantity), notes, notesOpen: Boolean(notes) };
  }
  return quantities;
}

// Starting values. ret = the saved return (edit) or null (new). lists = { branches, inventories }.
// invoiceId: ?invoice=<id> of a new return (the invoice is then chosen and locked).
// New: من فاتورة شراء (recommended), today's date, refund 0; the only branch / warehouse chosen by itself for the
// not-linked kind.
export function getInitialForm(ret, lists, invoiceId = "") {
  const branchId = lists.branches.length === 1 ? lists.branches[0].id : "";
  const empty = {
    kind: "linked",
    returnDate: todayDay(),
    reason: "",
    notes: "",
    refundAmount: "0",
    filterSupplierId: "",
    purchaseInvoiceId: invoiceId,
    quantities: {},
    supplierId: "",
    branchId,
    warehouseId: autoWarehouseId(lists.inventories, branchId),
    discountType: "percent",
    discount: "0",
    tax: "0",
    lines: [newLine()],
  };
  if (!ret) return empty;

  const common = {
    ...empty,
    returnDate: toDay(ret.returnDate),
    reason: ret.reason ?? "",
    notes: ret.notes ?? "",
    refundAmount: String(ret.refundAmount ?? "0"),
  };
  if (ret.purchaseInvoiceId) {
    return {
      ...common,
      kind: "linked",
      purchaseInvoiceId: ret.purchaseInvoiceId,
      quantities: quantitiesFromLines(ret.lines),
    };
  }
  // The server stores the computed amount in discountValue: a percent above 0 means percent mode.
  const percent = Number(ret.discountPercent);
  const amount = Number(ret.discountValue);
  let discountType = "percent";
  let discount = "0";
  if (percent > 0) discount = String(ret.discountPercent);
  else if (amount > 0) {
    discountType = "amount";
    discount = String(ret.discountValue);
  }
  return {
    ...common,
    kind: "free",
    purchaseInvoiceId: "",
    supplierId: ret.supplierId,
    branchId: ret.branchId,
    warehouseId: ret.warehouseId,
    discountType,
    discount,
    tax: String(ret.taxPercent ?? "0"),
    lines: ret.lines.map((line) => lineFromServer(line, line.unitCost)),
  };
}

// What counts for "unsaved changes": the common fields + the fields of ONE kind (the current one), without the
// screen-only fields (the picker's supplier filter, an opened notes box, an added empty row).
function comparable(form, kind) {
  const common = [form.returnDate, form.reason, form.notes, form.refundAmount];
  if (kind === "linked") {
    const rows = Object.entries(form.quantities)
      .filter(([, row]) => !isBlank(row.quantity) || !isBlank(row.notes))
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([id, row]) => [id, row.quantity, row.notes]);
    return JSON.stringify([common, form.purchaseInvoiceId, rows]);
  }
  const lines = filledLineIndexes(form.lines).map((index) => {
    const line = form.lines[index];
    return [line.productId, line.itemUnitId, line.quantity, line.price, line.notes];
  });
  return JSON.stringify([
    common,
    form.supplierId,
    form.branchId,
    form.warehouseId,
    form.discountType,
    form.discount,
    form.tax,
    lines,
  ]);
}

export function isFormDirty(form, initialForm) {
  return comparable(form, form.kind) !== comparable(initialForm, form.kind);
}

// ─── Linked: the invoice's lines ─────────────────────────────────────────────────────────────────────────────

// The return price of one invoice line: its total after the LINE discount / its quantity, 4 decimals
// (the server: unitCost = round4(lineTotal / quantity)).
export function invoiceUnitCost(invoiceLine) {
  const quantity = Number(invoiceLine.quantity);
  return quantity > 0 ? roundHalfUp(Number(invoiceLine.lineTotal) / quantity, 4) : 0;
}

// The typed quantity of a row as a number (> 0), or null (empty / not a number).
export function rowQuantity(form, lineId) {
  const quantity = toNumber(form.quantities[lineId]?.quantity);
  return quantity !== null && quantity > 0 ? quantity : null;
}

// The invoice line ids, in order, whose row has a quantity: the lines that are SENT. The server's "lines.N" is
// sentLineIds(...)[N].
export function sentLineIds(form, invoice) {
  return (invoice?.lines ?? [])
    .map((line) => line.id)
    .filter((lineId) => !isBlank(form.quantities[lineId]?.quantity));
}

// The invoice's discount as a SHARE of this return (the server: round2(subTotal × invoice discountValue /
// invoice subTotal), 0 when the invoice subTotal is 0).
export function discountShare(subTotal, invoice) {
  const invoiceSubTotal = Number(invoice.subTotal);
  if (!(invoiceSubTotal > 0)) return 0;
  return roundHalfUp((subTotal * Number(invoice.discountValue)) / invoiceSubTotal, 2);
}

// Linked preview: { subTotal, discountValue, taxValue, netTotal, lineTotals: { [invoiceLineId]: total | null } }.
function getLinkedPreview(form, invoice) {
  const lineTotals = {};
  let sum = 0;
  for (const line of invoice?.lines ?? []) {
    const quantity = rowQuantity(form, line.id);
    const total =
      quantity === null
        ? null
        : calcLineTotal({ quantity: String(quantity), price: String(invoiceUnitCost(line)), discount: "" });
    lineTotals[line.id] = total;
    if (total !== null) sum += total;
  }
  const subTotal = roundHalfUp(sum, 2);
  if (!invoice) return { subTotal, discountValue: 0, taxValue: 0, netTotal: subTotal, lineTotals };
  const discountValue = discountShare(subTotal, invoice);
  const taxValue = roundHalfUp(((subTotal - discountValue) * Number(invoice.taxPercent)) / 100, 2);
  const netTotal = roundHalfUp(subTotal - discountValue + taxValue, 2);
  return { subTotal, discountValue, taxValue, netTotal, lineTotals };
}

// ─── Both kinds ──────────────────────────────────────────────────────────────────────────────────────────────

// The live preview of the totals (the server computes the real ones when saving).
// Linked: the invoice's discount share + the invoice's tax %. Not linked: the typed discount / tax, like an invoice.
export function getPreview(form, invoice) {
  if (form.kind === "linked") return getLinkedPreview(form, invoice);
  const lineTotals = form.lines.map((line) => calcLineTotal({ ...line, discount: "" }));
  const totals = calcDocumentTotals(
    lineTotals.filter((total) => total !== null),
    { discountType: form.discountType, discount: form.discount, tax: form.tax },
  );
  return { ...totals, lineTotals };
}

// Client validation.
// invalidDates = DateInput's flags { returnDate }. linked = { invoice, returnable } (the loaded invoice, or nulls).
// → { errors (header), lineErrors (not linked: per row), rowErrors (linked: per invoice line id), linesError, ok }
export function validateForm(form, invalidDates, linked = {}) {
  const errors = {};
  const { invoice, returnable } = linked;
  const isLinked = form.kind === "linked";

  if (invalidDates.returnDate) errors.returnDate = "تاريخ غير صحيح";
  else if (!form.returnDate) errors.returnDate = "تاريخ المرتجع مطلوب";
  else if (isLinked && invoice && form.returnDate < toDay(invoice.invoiceDate)) errors.returnDate = RETURN_BEFORE_INVOICE;

  if (form.reason.trim().length > REASON_MAX) errors.reason = `الحد الأقصى ${REASON_MAX} حرف`;
  if (form.notes.trim().length > NOTES_MAX) errors.notes = `الحد الأقصى ${NOTES_MAX} حرف`;

  const preview = getPreview(form, invoice);
  const refundError = validateMoney(form.refundAmount, { min: 0 });
  if (refundError) errors.refundAmount = refundError;
  else if (Number(form.refundAmount || 0) > preview.netTotal) errors.refundAmount = REFUND_TOO_MUCH;

  let lineErrors = [];
  const rowErrors = {};
  let linesError = "";

  if (isLinked) {
    if (!form.purchaseInvoiceId) errors.purchaseInvoiceId = "اختر فاتورة الشراء";
    else if (!invoice || !returnable) errors.purchaseInvoiceId = "تعذر تحميل بنود الفاتورة";
    const remaining = new Map((returnable?.lines ?? []).map((line) => [line.lineId, Number(line.remainingQuantity)]));
    let filled = 0;
    for (const line of invoice?.lines ?? []) {
      const row = form.quantities[line.id];
      if (!row) continue;
      const rowError = {};
      if (!isBlank(row.quantity)) {
        filled += 1;
        const error = validateMoney(row.quantity, DECIMALS_4);
        const left = remaining.get(line.id) ?? 0;
        if (error) rowError.quantity = error;
        else if (Number(row.quantity) <= 0) rowError.quantity = "الكمية يجب أن تكون أكبر من صفر";
        else if (Number(row.quantity) > left) rowError.quantity = `الكمية أكبر من المتاح للإرجاع (${left})`;
      }
      if (row.notes.trim().length > LINE_NOTES_MAX) rowError.notes = `الحد الأقصى ${LINE_NOTES_MAX} حرفًا`;
      if (Object.keys(rowError).length > 0) rowErrors[line.id] = rowError;
    }
    if (invoice && filled === 0) linesError = NO_QUANTITY;
  } else {
    if (!form.supplierId) errors.supplierId = "اختر المورد";
    if (!form.branchId) errors.branchId = "اختر الفرع";
    if (!form.warehouseId) errors.warehouseId = "اختر المخزن";
    if (form.discountType === "percent") {
      const error = validatePercent(form.discount);
      if (error) errors.discount = error;
    } else {
      const error = validateMoney(form.discount, { min: 0 });
      if (error) errors.discount = error;
      else if (Number(form.discount || 0) > preview.subTotal) errors.discount = "قيمة الخصم أكبر من الإجمالي";
    }
    const taxError = validatePercent(form.tax);
    if (taxError) errors.tax = taxError;
    const lines = validateLines(form.lines);
    lineErrors = lines.errors;
    if (lines.filledCount === 0) linesError = "يجب إضافة بند واحد على الأقل";
  }

  const hasLineErrors =
    lineErrors.some((lineError) => Object.keys(lineError).length > 0) || Object.keys(rowErrors).length > 0;
  return {
    errors,
    lineErrors,
    rowErrors,
    linesError,
    ok: Object.keys(errors).length === 0 && !hasLineErrors && !linesError,
  };
}

// ─── Stock ("المتاح في المخزن") ──────────────────────────────────────────────────────────────────────────────

// The stock rows of a warehouse (GET /product-inventory/inventory/:id) → Map productId → { quantity, costPrice }
// (pieces, the average cost). A product that is not in the warehouse has no entry (= 0 available).
export function toStockMap(stockRows) {
  return new Map(
    (stockRows ?? []).map((row) => [row.productId, { quantity: Number(row.quantity), costPrice: row.costPrice }]),
  );
}

// The pieces this return needs per STOCK product: Map productId → pieces (lines of the same product added up).
// items = [{ productId, itemType, quantity (number), factor (number) }] — one per line with a valid quantity.
export function piecesByProduct(items) {
  const needed = new Map();
  for (const item of items) {
    if (item.itemType !== "STOCK" || !(item.quantity > 0) || !(item.factor > 0)) continue;
    needed.set(item.productId, roundHalfUp((needed.get(item.productId) ?? 0) + item.quantity * item.factor, 4));
  }
  return needed;
}

// The products whose needed pieces are more than the warehouse has → Set of productIds.
export function getShortProducts(needed, stockMap) {
  const short = new Set();
  for (const [productId, pieces] of needed) {
    if (pieces > (stockMap.get(productId)?.quantity ?? 0)) short.add(productId);
  }
  return short;
}

// Linked form rows → piecesByProduct items (product / factor from the invoice line).
export function linkedStockItems(form, invoice) {
  return (invoice?.lines ?? []).flatMap((line) => {
    const quantity = rowQuantity(form, line.id);
    if (quantity === null) return [];
    return [
      { productId: line.productId, itemType: line.product?.itemType, quantity, factor: Number(line.unitFactor) },
    ];
  });
}

// Not-linked form lines → piecesByProduct items. The factor comes from the loaded units of the product (the primary
// unit is 1 even before they load); a line whose factor is not known yet is skipped.
export function freeStockItems(form, productById, unitsByProduct) {
  return form.lines.flatMap((line) => {
    const quantity = toNumber(line.quantity);
    const product = productById.get(line.productId);
    if (!product || !line.itemUnitId || quantity === null || quantity <= 0) return [];
    const unit = unitsByProduct[line.productId]?.units?.find((item) => item.itemUnitId === line.itemUnitId);
    const factor = unit ? Number(unit.factor) : line.itemUnitId === product.primaryItemUnitId ? 1 : null;
    if (factor === null) return [];
    return [{ productId: line.productId, itemType: product.itemType, quantity, factor }];
  });
}

// Details page (a DRAFT): the numbers (from 1) of the STOCK lines whose product needs more pieces (all its lines
// added up) than the warehouse has now. Posting would refuse them (INSUFFICIENT_STOCK).
export function getShortLines(ret, stockRows) {
  const needed = piecesByProduct(
    ret.lines.map((line) => ({
      productId: line.productId,
      itemType: line.product?.itemType,
      quantity: Number(line.baseQuantity),
      factor: 1,
    })),
  );
  const short = getShortProducts(needed, toStockMap(stockRows));
  return ret.lines.flatMap((line, index) => (short.has(line.productId) ? [index + 1] : []));
}
