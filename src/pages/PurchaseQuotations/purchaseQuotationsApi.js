// All backend calls of the Purchase Quotations pages (عروض أسعار الشراء): list, form and details.
// Docs: ../backend/doc/week2/purchase-quotations.txt + week2flow.txt (§5 steps 5–7, §6.1, §9).
// A quotation never touches stock or money. Its code (PQ-2026-000001), status and every total come from the server.
import api from "../../services/api";
import { optionalField } from "../../utils/body";
import { filledLineIndexes } from "../../utils/documentLines";
import { toMoneyNumber } from "../../utils/money";

const DECIMALS_4 = { maxDecimals: 4 };

// ─── Quotations ──────────────────────────────────────────────────────────────────────────────────────────────

// One page of quotations, newest quotationDate first → data = { items, meta }.
// Receives { page, pageSize, ...filters } from usePaginatedData (empty filters already removed).
// quotationDate is a DATE-ONLY column: dateFrom / dateTo are sent as the plain "YYYY-MM-DD" (both inclusive).
// Items: the header + supplier / branch / warehouse + _count.lines + isExpired (NO lines).
export async function getPurchaseQuotations({ page, pageSize, search, supplierId, branchId, status, dateFrom, dateTo }) {
  const response = await api.get("/purchase-quotations", {
    params: { page, pageSize, search, supplierId, branchId, status, dateFrom, dateTo },
  });
  return response.data.data;
}

// One quotation with its lines (product, itemUnit, unitFactor), createdByUser / modifiedByUser, isExpired.
export async function getPurchaseQuotation(id) {
  const response = await api.get(`/purchase-quotations/${id}`);
  return response.data.data;
}

// One line of the form → the line body. Only the chosen line discount is sent, and only when filled
// (both → 400). price → unitPrice. Never lineTotal / unitFactor.
function toLineBody(line) {
  const body = {
    productId: line.productId,
    itemUnitId: line.itemUnitId,
    quantity: toMoneyNumber(line.quantity, DECIMALS_4),
    unitPrice: toMoneyNumber(line.price, DECIMALS_4),
  };
  if (line.discount.trim() !== "") {
    if (line.discountType === "percent") body.discountPercent = toMoneyNumber(line.discount);
    else body.discountValue = toMoneyNumber(line.discount, DECIMALS_4);
  }
  const notes = line.notes.trim();
  if (notes) body.notes = notes;
  return body;
}

// The form → the body of POST (isEdit false) and PATCH (isEdit true). ONE builder for both.
// - validUntil / warehouseId / notes: optional → left out on create when empty, null on edit when emptied.
// - The header discount: BOTH fields always. The server keeps the computed amount in discountValue, so a PATCH
//   with only discountPercent: 0 would keep the old amount as a fixed discount. Percent mode → { X, 0 },
//   amount mode → { 0, Y }, no discount → { 0, 0 }.
// - lines: ALWAYS the full list (on edit too: "lines" REPLACES all the lines). Empty rows are dropped.
// - Never code, status, totals, unitFactor, lineTotal, createdBy.
function toQuotationBody(form, isEdit) {
  const discount = toMoneyNumber(form.discount);
  return {
    quotationDate: form.quotationDate,
    validUntil: optionalField(form.validUntil, isEdit),
    supplierId: form.supplierId,
    branchId: form.branchId,
    warehouseId: optionalField(form.warehouseId, isEdit),
    discountPercent: form.discountType === "percent" ? discount : 0,
    discountValue: form.discountType === "amount" ? discount : 0,
    taxPercent: toMoneyNumber(form.tax),
    notes: optionalField(form.notes, isEdit),
    lines: filledLineIndexes(form.lines).map((index) => toLineBody(form.lines[index])),
  };
}

export async function createPurchaseQuotation(form) {
  const response = await api.post("/purchase-quotations", toQuotationBody(form, false));
  return response.data.data;
}

export async function updatePurchaseQuotation(id, form) {
  const response = await api.patch(`/purchase-quotations/${id}`, toQuotationBody(form, true));
  return response.data.data;
}

export async function deletePurchaseQuotation(id) {
  await api.delete(`/purchase-quotations/${id}`);
}

// status: "SENT" (from DRAFT), "ACCEPTED" or "REJECTED" (from SENT). Returns the updated quotation.
export async function changePurchaseQuotationStatus(id, status) {
  const response = await api.patch(`/purchase-quotations/${id}/status`, { status });
  return response.data.data;
}

// ACCEPTED → a DRAFT purchase invoice. form = { paymentType, invoiceDate, warehouseId }.
// warehouseId is sent only when the quotation has none (needsWarehouse).
// Returns { quotation (CONVERTED), invoice (DRAFT, with its PI code) }.
export async function convertPurchaseQuotation(id, form, needsWarehouse) {
  const body = { paymentType: form.paymentType, invoiceDate: form.invoiceDate };
  if (needsWarehouse) body.warehouseId = form.warehouseId;
  const response = await api.post(`/purchase-quotations/${id}/convert-to-invoice`, body);
  return response.data.data;
}

// The invoice a quotation became (details page: its code + status). 404 when that DRAFT invoice was deleted.
export async function getPurchaseInvoice(id) {
  const response = await api.get(`/purchase-invoices/${id}`);
  return response.data.data;
}

// ─── Lists for the form, the filters and the convert modal (plain arrays) ─────────────────────────────────────

export async function getSuppliers() {
  const response = await api.get("/supplier");
  return response.data.data;
}

export async function getBranches() {
  const response = await api.get("/branch");
  return response.data.data;
}

// All warehouses; the pages keep the chosen branch's ones (each has branchId).
export async function getInventories() {
  const response = await api.get("/inventory");
  return response.data.data;
}

// All products (STOCK and SERVICE: both are allowed on quotations), with primaryItemUnit.
export async function getProducts() {
  const response = await api.get("/products");
  return response.data.data;
}

// The unit dropdown of a line: primary unit first (isPrimary, id null, factor "1"), then the product's units.
export async function getProductUnits(productId) {
  const response = await api.get(`/products/${productId}/units`);
  return response.data.data;
}
