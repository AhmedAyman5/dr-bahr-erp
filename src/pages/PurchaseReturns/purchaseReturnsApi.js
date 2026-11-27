// All backend calls of the Purchase Returns pages (مرتجعات الشراء): list, form and details.
// Docs: ../backend/doc/week2/purchase-returns.txt + week2flow.txt (§5 steps 11–14, §6.3, §7.2, §9) + the service code.
// Goods sent BACK to a supplier: posting takes the lines OUT of the warehouse (at the current average cost),
// cancelling puts them back (at the same cost). Code (PR-2026-000001), status and every total come from the server.
//
// Two kinds (fixed once the return is created):
// - LINKED to a POSTED purchase invoice (purchaseInvoiceId): each line = an invoice line + a quantity. Product, unit,
//   price, discount share and tax come from the invoice; supplier / branch / warehouse are the invoice's.
// - NOT linked: supplier, branch, warehouse, product, unit, price, discount and tax are typed like an invoice.
import api from "../../services/api";
import { optionalField } from "../../utils/body";
import { filledLineIndexes } from "../../utils/documentLines";
import { toMoneyNumber } from "../../utils/money";

const DECIMALS_4 = { maxDecimals: 4 };

// ─── Returns ──────────────────────────────────────────────────────────────────────────────────────────────────

// One page of returns, newest returnDate first → data = { items, meta }.
// Receives { page, pageSize, ...filters } from usePaginatedData (empty filters already removed).
// The ONLY filters the API has: supplierId, purchaseInvoiceId, status, dateFrom, dateTo (no search).
// returnDate is a DATE-ONLY column: dateFrom / dateTo are the plain "YYYY-MM-DD" (both inclusive).
// Items: the header + supplier / branch / warehouse / purchaseInvoice { id, code } + _count.lines (NO lines).
export async function getPurchaseReturns({ page, pageSize, supplierId, purchaseInvoiceId, status, dateFrom, dateTo }) {
  const response = await api.get("/purchase-returns", {
    params: { page, pageSize, supplierId, purchaseInvoiceId, status, dateFrom, dateTo },
  });
  return response.data.data;
}

// One return with its lines (product with itemType, itemUnit, unitFactor, baseQuantity, unitCost, lineTotal,
// purchaseInvoiceLine { id, quantity, unitCost, lineTotal }), purchaseInvoice { id, code, invoiceDate, status,
// supplierInvoiceNumber } and the users.
export async function getPurchaseReturn(id) {
  const response = await api.get(`/purchase-returns/${id}`);
  return response.data.data;
}

// A not-linked line → its body: productId, itemUnitId, quantity, unitCost (+ notes when filled).
// Returns have NO line discount. Never lineTotal / unitFactor / baseQuantity.
function toFreeLineBody(line) {
  const body = {
    productId: line.productId,
    itemUnitId: line.itemUnitId,
    quantity: toMoneyNumber(line.quantity, DECIMALS_4),
    unitCost: toMoneyNumber(line.price, DECIMALS_4),
  };
  const notes = line.notes.trim();
  if (notes) body.notes = notes;
  return body;
}

// The form → the body of POST (isEdit false) and PATCH (isEdit true). ONE builder for both kinds.
// invoiceLineIds: the linked invoice's line ids IN ORDER (the rows of the lines table); the lines are sent in that
// order, only the ones with a quantity — so the server's "lines.N" is the N-th row with a quantity.
// - LINKED: returnDate, purchaseInvoiceId (again on edit: the server then takes the invoice's supplier / branch /
//   warehouse again), reason / notes, refundAmount, lines [{ purchaseInvoiceLineId, quantity, notes? }].
//   Never supplier / branch / warehouse / product / unit / unitCost / discounts / tax (the invoice's are used).
// - NOT LINKED: returnDate, supplierId, branchId, warehouseId, reason / notes, BOTH header discount fields (same
//   rule as the invoices: percent mode { X, 0 }, amount mode { 0, Y }), taxPercent, refundAmount, lines.
//   purchaseInvoiceId is never sent (on edit: not sent = the saved "no invoice" stays).
// - reason / notes: optional → left out on create when empty, null on edit when emptied. refundAmount: 0 when empty.
// - lines: ALWAYS the full list (PATCH "lines" REPLACES all the lines).
// - Never code, status, totals, user ids.
function toReturnBody(form, isEdit, invoiceLineIds) {
  const common = {
    returnDate: form.returnDate,
    reason: optionalField(form.reason, isEdit),
    notes: optionalField(form.notes, isEdit),
    refundAmount: toMoneyNumber(form.refundAmount),
  };
  if (form.kind === "linked") {
    const lines = invoiceLineIds
      .filter((lineId) => String(form.quantities[lineId]?.quantity ?? "").trim() !== "")
      .map((lineId) => {
        const row = form.quantities[lineId];
        const line = { purchaseInvoiceLineId: lineId, quantity: toMoneyNumber(row.quantity, DECIMALS_4) };
        const notes = row.notes.trim();
        if (notes) line.notes = notes;
        return line;
      });
    return { ...common, purchaseInvoiceId: form.purchaseInvoiceId, lines };
  }
  const discount = toMoneyNumber(form.discount);
  return {
    ...common,
    supplierId: form.supplierId,
    branchId: form.branchId,
    warehouseId: form.warehouseId,
    discountPercent: form.discountType === "percent" ? discount : 0,
    discountValue: form.discountType === "amount" ? discount : 0,
    taxPercent: toMoneyNumber(form.tax),
    lines: filledLineIndexes(form.lines).map((index) => toFreeLineBody(form.lines[index])),
  };
}

export async function createPurchaseReturn(form, invoiceLineIds = []) {
  const response = await api.post("/purchase-returns", toReturnBody(form, false, invoiceLineIds));
  return response.data.data;
}

export async function updatePurchaseReturn(id, form, invoiceLineIds = []) {
  const response = await api.patch(`/purchase-returns/${id}`, toReturnBody(form, true, invoiceLineIds));
  return response.data.data;
}

// DRAFT only.
export async function deletePurchaseReturn(id) {
  await api.delete(`/purchase-returns/${id}`);
}

// ترحيل (DRAFT → POSTED): every STOCK line leaves the warehouse. No body. Returns the posted return.
export async function postPurchaseReturn(id) {
  const response = await api.post(`/purchase-returns/${id}/post`);
  return response.data.data;
}

// إلغاء (POSTED → CANCELLED): the quantities come back at the cost they left with. No body.
export async function cancelPurchaseReturn(id) {
  const response = await api.post(`/purchase-returns/${id}/cancel`);
  return response.data.data;
}

// ─── The invoice of a linked return ──────────────────────────────────────────────────────────────────────────

// The invoice picker: the newest 100 POSTED invoices (optionally of one supplier). Items have currency + supplier.
export async function getPostedInvoices(supplierId) {
  const response = await api.get("/purchase-invoices", {
    params: { status: "POSTED", supplierId: supplierId || undefined, page: 1, pageSize: 100 },
  });
  return response.data.data.items;
}

// One invoice: its lines (quantity, lineTotal → the return price), currency, discount / tax, warehouse and
// purchaseReturns [{ id, code, returnDate, status, netTotal }].
export async function getPurchaseInvoice(id) {
  const response = await api.get(`/purchase-invoices/${id}`);
  return response.data.data;
}

// What can still be returned, per invoice line (in the line's unit): quantity (bought), returnedQuantity (POSTED
// returns only), remainingQuantity. No prices (those come from getPurchaseInvoice).
export async function getReturnable(invoiceId) {
  const response = await api.get(`/purchase-invoices/${invoiceId}/returnable`);
  return response.data.data;
}

// ─── Lists (plain arrays) ─────────────────────────────────────────────────────────────────────────────────────

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

// All currencies (one has isDefault: true): the details name the currency of a not-linked return.
export async function getCurrencies() {
  const response = await api.get("/currency");
  return response.data.data;
}

// All products (STOCK and SERVICE), with primaryItemUnit (the "قطعة" of "= 24 قطعة").
export async function getProducts() {
  const response = await api.get("/products");
  return response.data.data;
}

// The unit dropdown of a not-linked line: primary unit first (isPrimary, factor "1"), then the product's units.
export async function getProductUnits(productId) {
  const response = await api.get(`/products/${productId}/units`);
  return response.data.data;
}

// The stock of one warehouse (product, quantity in pieces, costPrice = the average cost): the "المتاح في المخزن"
// hint. 404 when the warehouse was deleted.
export async function getWarehouseStock(warehouseId) {
  const response = await api.get(`/product-inventory/inventory/${warehouseId}`);
  return response.data.data;
}
