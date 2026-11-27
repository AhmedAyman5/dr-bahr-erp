// All backend calls of the Purchase Invoices pages (فواتير الشراء): list, form and details.
// Docs: ../backend/doc/week2/purchase-invoices.txt + week2flow.txt (§5 steps 7–13, §6.2, §7, §8).
// The first document that MOVES STOCK: posting adds the lines to the warehouse, cancelling takes them out again.
// Its code (PI-2026-000001), status, every total, paid / remaining and the stock costs come from the server.
import api from "../../services/api";
import { optionalField } from "../../utils/body";
import { filledLineIndexes } from "../../utils/documentLines";
import { toMoneyNumber } from "../../utils/money";

const DECIMALS_4 = { maxDecimals: 4 };

// ─── Invoices ─────────────────────────────────────────────────────────────────────────────────────────────────

// One page of invoices, newest invoiceDate first → data = { items, meta }.
// Receives { page, pageSize, ...filters } from usePaginatedData (empty filters already removed).
// invoiceDate is a DATE-ONLY column: dateFrom / dateTo are sent as the plain "YYYY-MM-DD" (both inclusive).
// search = part of the code, the supplier's invoice number, the supplier name or the notes.
// Items: the header + supplier / branch / warehouse / currency + _count.lines (NO lines).
export async function getPurchaseInvoices({
  page,
  pageSize,
  search,
  supplierId,
  branchId,
  warehouseId,
  status,
  paymentType,
  dateFrom,
  dateTo,
}) {
  const response = await api.get("/purchase-invoices", {
    params: { page, pageSize, search, supplierId, branchId, warehouseId, status, paymentType, dateFrom, dateTo },
  });
  return response.data.data;
}

// The supplier's other invoices whose code / number / notes CONTAIN this number (the form's duplicate warning
// keeps only the exact matches, see invoiceForm.findDuplicateInvoice). One page of 100 is plenty here.
export async function searchSupplierInvoices(supplierId, supplierInvoiceNumber) {
  const response = await api.get("/purchase-invoices", {
    params: { page: 1, pageSize: 100, supplierId, search: supplierInvoiceNumber },
  });
  return response.data.data.items;
}

// One invoice with its lines (product with itemType / hasExpiryDate, itemUnit, unitFactor, baseQuantity,
// stockUnitCost, batchNumber, expiryDate), currency, the users, convertedFromQuotation and purchaseReturns.
export async function getPurchaseInvoice(id) {
  const response = await api.get(`/purchase-invoices/${id}`);
  return response.data.data;
}

// One line of the form → the line body. Only the chosen line discount is sent, and only when filled
// (both → 400). price → unitCost. batchNumber / expiryDate / notes only when filled.
// Never lineTotal / unitFactor / baseQuantity / stockUnitCost.
function toLineBody(line) {
  const body = {
    productId: line.productId,
    itemUnitId: line.itemUnitId,
    quantity: toMoneyNumber(line.quantity, DECIMALS_4),
    unitCost: toMoneyNumber(line.price, DECIMALS_4),
  };
  if (line.discount.trim() !== "") {
    if (line.discountType === "percent") body.discountPercent = toMoneyNumber(line.discount);
    else body.discountValue = toMoneyNumber(line.discount, DECIMALS_4);
  }
  const batchNumber = line.batchNumber.trim();
  if (batchNumber) body.batchNumber = batchNumber;
  if (line.expiryDate) body.expiryDate = line.expiryDate;
  const notes = line.notes.trim();
  if (notes) body.notes = notes;
  return body;
}

// The form → the body of POST (isEdit false) and PATCH (isEdit true). ONE builder for both.
// defaultCurrencyId: the company's default currency (العملة الأساسية).
// - currencyId: always the chosen one. exchangeRate ONLY for another currency (the default is always 1:
//   another rate → 400; null → 400).
// - supplierInvoiceNumber / notes: optional → left out on create when empty, null on edit when emptied
//   (never "": the backend rejects an empty supplierInvoiceNumber).
// - dueDate: آجل → optional like the others; نقدي → no due date (left out on create, null on edit clears it).
// - paidAmount ONLY for آجل (0 when empty). نقدي: the server sets paid = net itself.
// - The header discount: BOTH fields always (same rule as the quotations: percent mode { X, 0 },
//   amount mode { 0, Y }, no discount { 0, 0 }).
// - lines: ALWAYS the full list (on edit too: "lines" REPLACES all the lines). Empty rows are dropped.
// - Never code, status, totals, remainingAmount, unitFactor, baseQuantity, lineTotal, stockUnitCost, user ids.
function toInvoiceBody(form, isEdit, defaultCurrencyId) {
  const discount = toMoneyNumber(form.discount);
  const isCredit = form.paymentType === "CREDIT";
  const body = {
    invoiceDate: form.invoiceDate,
    paymentType: form.paymentType,
    supplierId: form.supplierId,
    supplierInvoiceNumber: optionalField(form.supplierInvoiceNumber, isEdit),
    // نقدي counts as an empty due date: left out on create, null on edit (clears an old one).
    dueDate: optionalField(isCredit ? form.dueDate : "", isEdit),
    branchId: form.branchId,
    warehouseId: form.warehouseId,
    currencyId: form.currencyId,
    discountPercent: form.discountType === "percent" ? discount : 0,
    discountValue: form.discountType === "amount" ? discount : 0,
    taxPercent: toMoneyNumber(form.tax),
    notes: optionalField(form.notes, isEdit),
    lines: filledLineIndexes(form.lines).map((index) => toLineBody(form.lines[index])),
  };
  if (form.currencyId !== defaultCurrencyId) body.exchangeRate = toMoneyNumber(form.exchangeRate, DECIMALS_4);
  if (isCredit) body.paidAmount = toMoneyNumber(form.paidAmount);
  return body;
}

export async function createPurchaseInvoice(form, defaultCurrencyId) {
  const response = await api.post("/purchase-invoices", toInvoiceBody(form, false, defaultCurrencyId));
  return response.data.data;
}

export async function updatePurchaseInvoice(id, form, defaultCurrencyId) {
  const response = await api.patch(`/purchase-invoices/${id}`, toInvoiceBody(form, true, defaultCurrencyId));
  return response.data.data;
}

// DRAFT only. A draft made from a quotation: that quotation stays CONVERTED for ever.
export async function deletePurchaseInvoice(id) {
  await api.delete(`/purchase-invoices/${id}`);
}

// ترحيل (DRAFT → POSTED): every STOCK line goes into the warehouse. No body. Returns the posted invoice.
export async function postPurchaseInvoice(id) {
  const response = await api.post(`/purchase-invoices/${id}/post`);
  return response.data.data;
}

// إلغاء (POSTED → CANCELLED): the posted quantities are taken out again. No body. Returns the cancelled invoice.
export async function cancelPurchaseInvoice(id) {
  const response = await api.post(`/purchase-invoices/${id}/cancel`);
  return response.data.data;
}

// ─── Lists for the form and the filters (plain arrays) ────────────────────────────────────────────────────────

export async function getSuppliers() {
  const response = await api.get("/supplier");
  return response.data.data;
}

export async function getBranches() {
  const response = await api.get("/branch");
  return response.data.data;
}

// All warehouses; the form keeps the chosen branch's ones (each has branchId).
export async function getInventories() {
  const response = await api.get("/inventory");
  return response.data.data;
}

// All currencies (one has isDefault: true = العملة الأساسية).
export async function getCurrencies() {
  const response = await api.get("/currency");
  return response.data.data;
}

// All products (STOCK and SERVICE: both are allowed on invoices), with primaryItemUnit and hasExpiryDate.
export async function getProducts() {
  const response = await api.get("/products");
  return response.data.data;
}

// The unit dropdown of a line: primary unit first (isPrimary, id null, factor "1"), then the product's units.
export async function getProductUnits(productId) {
  const response = await api.get(`/products/${productId}/units`);
  return response.data.data;
}
