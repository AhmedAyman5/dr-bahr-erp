// Plain functions of the purchase invoice pages (PurchaseInvoiceForm / components/InvoiceEditor / details):
// starting values, the unsaved-changes check, the live totals preview, the client validation, the duplicate
// supplier-bill check and the expiry checks. No React, no API calls. The body is built in purchaseInvoicesApi.js.
//
// The form object (every number is the typed text):
//   { invoiceDate, supplierId, supplierInvoiceNumber, paymentType: "" | "CASH" | "CREDIT", dueDate,
//     branchId, warehouseId, currencyId, exchangeRate, notes,
//     discountType: "percent" | "amount", discount, tax, paidAmount, lines: [line objects, utils/documentLines.js] }
import { todayDay } from "../../utils/dates";
import { calcDocumentTotals, calcLineTotal, roundHalfUp } from "../../utils/documentTotals";
import {
  filledLineIndexes,
  isEmptyLine,
  lineFromServer,
  newLine,
  validateLines,
  validatePercent,
} from "../../utils/documentLines";
import { validateMoney } from "../../utils/money";

export const NOTES_MAX = 500;
export const BATCH_MAX = 50;
// Invoices that can still be edited / deleted (week2flow §6.2): only a draft.
export const EDITABLE_STATUSES = ["DRAFT"];
export const EXPIRY_REQUIRED = "تاريخ الصلاحية مطلوب لهذا الصنف";
export const PAID_TOO_MUCH = "المدفوع أكبر من صافي الفاتورة";
export const DUE_BEFORE_INVOICE = "تاريخ الاستحقاق لا يمكن أن يكون قبل تاريخ الفاتورة";

// An API day ("2026-11-20T00:00:00.000Z") → "2026-11-20" (never through a Date: the day must not shift).
export function toDay(value) {
  return value ? value.slice(0, 10) : "";
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

// Starting values. invoice = the saved invoice (edit) or null (new). lists = { branches, inventories, currencies }.
// New: today's date, no payment type (the user must choose), the only branch / warehouse chosen by itself,
// the default currency, one empty line.
export function getInitialForm(invoice, lists) {
  const defaultCurrency = getDefaultCurrency(lists.currencies);
  if (!invoice) {
    const branchId = lists.branches.length === 1 ? lists.branches[0].id : "";
    return {
      invoiceDate: todayDay(),
      supplierId: "",
      supplierInvoiceNumber: "",
      paymentType: "",
      dueDate: "",
      branchId,
      warehouseId: autoWarehouseId(lists.inventories, branchId),
      currencyId: defaultCurrency?.id ?? "",
      exchangeRate: "",
      notes: "",
      discountType: "percent",
      discount: "0",
      tax: "0",
      paidAmount: "0",
      lines: [newLine()],
    };
  }
  // The server stores the computed amount in discountValue: a percent above 0 means percent mode.
  const percent = Number(invoice.discountPercent);
  const amount = Number(invoice.discountValue);
  let discountType = "percent";
  let discount = "0";
  if (percent > 0) discount = String(invoice.discountPercent);
  else if (amount > 0) {
    discountType = "amount";
    discount = String(invoice.discountValue);
  }
  const isDefaultCurrency = invoice.currencyId === defaultCurrency?.id;
  return {
    invoiceDate: toDay(invoice.invoiceDate),
    supplierId: invoice.supplierId,
    supplierInvoiceNumber: invoice.supplierInvoiceNumber ?? "",
    paymentType: invoice.paymentType,
    dueDate: toDay(invoice.dueDate),
    branchId: invoice.branchId,
    warehouseId: invoice.warehouseId,
    currencyId: invoice.currencyId,
    exchangeRate: isDefaultCurrency ? "" : String(invoice.exchangeRate),
    notes: invoice.notes ?? "",
    discountType,
    discount,
    tax: String(invoice.taxPercent ?? "0"),
    paidAmount: invoice.paymentType === "CREDIT" ? String(invoice.paidAmount) : "0",
    lines: invoice.lines.map((line) => lineFromServer(line, line.unitCost)),
  };
}

// What counts for "unsaved changes": the header + the filled lines without the screen-only fields
// (an added empty row, an opened notes / batch box alone is not a change).
function comparable(form) {
  const lines = filledLineIndexes(form.lines).map((index) => {
    const line = form.lines[index];
    return [
      line.productId,
      line.itemUnitId,
      line.quantity,
      line.price,
      line.discountType,
      line.discount,
      line.notes,
      line.batchNumber,
      line.expiryDate,
    ];
  });
  return JSON.stringify({ ...form, lines });
}

export function isFormDirty(form, initialForm) {
  return comparable(form) !== comparable(initialForm) || form.lines.some((line) => line.expiryInvalid);
}

// Text → number for the paid preview ("" = 0), or null when it is not a valid amount.
function paidNumber(text) {
  const value = String(text ?? "").trim();
  if (value === "") return 0;
  return /^\d+(\.\d+)?$/.test(value) ? Number(value) : null;
}

// The live preview: { subTotal, discountValue, taxValue, netTotal, paid, remaining } (numbers) + the total of
// every row (null when it can't be computed). paid / remaining: null until a payment type is chosen (or an invalid
// paid amount). نقدي: paid = the net total. The server computes the real values when saving.
export function getPreview(form) {
  const lineTotals = form.lines.map((line) => calcLineTotal(line));
  const totals = calcDocumentTotals(
    lineTotals.filter((total) => total !== null),
    { discountType: form.discountType, discount: form.discount, tax: form.tax },
  );
  let paid = null;
  if (form.paymentType === "CASH") paid = totals.netTotal;
  if (form.paymentType === "CREDIT") paid = paidNumber(form.paidAmount);
  const remaining = paid === null ? null : roundHalfUp(totals.netTotal - paid, 2);
  return { ...totals, paid, remaining, lineTotals };
}

// The lines table (components/LineExpiryFields): is the expiry date input shown? Always for a product with
// hasExpiryDate; for another product only while a date is filled / half typed (nothing hidden is ever sent).
export function showsExpiryInput(line, product) {
  return Boolean(product?.hasExpiryDate) || Boolean(line.expiryDate) || line.expiryInvalid;
}

// Is the batch input shown? Always for a product with hasExpiryDate; otherwise after "+ رقم التشغيلة" or when filled.
export function showsBatchInput(line, product) {
  return Boolean(product?.hasExpiryDate) || line.batchOpen || line.batchNumber.trim() !== "";
}

// "منتهي الصلاحية": the goods expire before the invoice date (a warning only: saving is allowed).
export function isExpiredOnInvoiceDate(expiryDate, invoiceDate) {
  return Boolean(expiryDate && invoiceDate && expiryDate < invoiceDate);
}

// Client validation.
// invalidDates = DateInput's flags { invoiceDate, dueDate } (half typed / impossible).
// productById = Map of the products (hasExpiryDate), defaultCurrencyId = the default currency.
// → { errors (header fields), lineErrors (per row), linesError, ok }
export function validateForm(form, invalidDates, productById, defaultCurrencyId) {
  const errors = {};
  const isCredit = form.paymentType === "CREDIT";
  if (!form.supplierId) errors.supplierId = "اختر المورد";

  if (invalidDates.invoiceDate) errors.invoiceDate = "تاريخ غير صحيح";
  else if (!form.invoiceDate) errors.invoiceDate = "تاريخ الفاتورة مطلوب";

  if (!form.paymentType) errors.paymentType = "اختر طريقة الدفع";
  // The due date is only shown (and sent) for آجل.
  if (isCredit && invalidDates.dueDate) errors.dueDate = "تاريخ غير صحيح";
  else if (isCredit && form.dueDate && form.invoiceDate && form.dueDate < form.invoiceDate) {
    errors.dueDate = DUE_BEFORE_INVOICE;
  }

  if (!form.branchId) errors.branchId = "اختر الفرع";
  if (!form.warehouseId) errors.warehouseId = "اختر المخزن";
  if (!form.currencyId) errors.currencyId = "اختر العملة";
  else if (form.currencyId !== defaultCurrencyId) {
    const rate = form.exchangeRate.trim();
    const error = rate === "" ? "سعر الصرف مطلوب" : validateMoney(rate, { maxDecimals: 4 });
    if (error) errors.exchangeRate = error;
    else if (Number(rate) <= 0) errors.exchangeRate = "سعر الصرف يجب أن يكون أكبر من صفر";
  }
  if (form.notes.trim().length > NOTES_MAX) errors.notes = `الحد الأقصى ${NOTES_MAX} حرف`;

  const preview = getPreview(form);
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

  if (isCredit) {
    const error = validateMoney(form.paidAmount, { min: 0 });
    if (error) errors.paidAmount = error;
    else if (Number(form.paidAmount || 0) > preview.netTotal) errors.paidAmount = PAID_TOO_MUCH;
  }

  // The lines: the shared checks + the invoice ones (expiry date, batch number).
  const lines = validateLines(form.lines);
  const lineErrors = lines.errors.map((lineError, index) => {
    const line = form.lines[index];
    if (isEmptyLine(line)) return lineError;
    const next = { ...lineError };
    if (line.expiryInvalid) next.expiryDate = "تاريخ غير صحيح";
    else if (productById.get(line.productId)?.hasExpiryDate && !line.expiryDate) next.expiryDate = EXPIRY_REQUIRED;
    if (line.batchNumber.trim().length > BATCH_MAX) next.batchNumber = `الحد الأقصى ${BATCH_MAX} حرفًا`;
    return next;
  });
  const linesError = lines.filledCount === 0 ? "يجب إضافة بند واحد على الأقل" : "";
  const hasLineErrors = lineErrors.some((lineError) => Object.keys(lineError).length > 0);

  return {
    errors,
    lineErrors,
    linesError,
    ok: Object.keys(errors).length === 0 && !hasLineErrors && !linesError,
  };
}

// The duplicate supplier bill: another invoice (any status) of the same supplier with EXACTLY this
// رقم فاتورة المورد (spaces around it and the letter case ignored). invoices = the search answer
// (it also contains partial matches and matches on the code / notes). → that invoice, or null.
export function findDuplicateInvoice(invoices, supplierInvoiceNumber, ownId) {
  const wanted = supplierInvoiceNumber.trim().toLowerCase();
  if (!wanted) return null;
  return (
    invoices.find(
      (invoice) => invoice.id !== ownId && (invoice.supplierInvoiceNumber ?? "").trim().toLowerCase() === wanted,
    ) ?? null
  );
}

// Details page: the numbers (from 1) of the STOCK lines whose product needs an expiry date and has none.
// Posting refuses them (VALIDATION_FAILED lines.N.expiryDate), e.g. a draft converted from a quotation.
// (SERVICE lines are skipped by the post, so they are not listed here.)
export function getMissingExpiryLines(invoice) {
  return invoice.lines.flatMap((line, index) =>
    line.product?.itemType === "STOCK" && line.product?.hasExpiryDate && !line.expiryDate ? [index + 1] : [],
  );
}
