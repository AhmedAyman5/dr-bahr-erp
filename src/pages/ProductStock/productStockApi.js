// All backend calls of the Product Stock page (أرصدة المخزون).
// Docs: ../backend/doc/week1/product-inventory.txt + ../backend/doc/week2/stock.txt ("What changed in
// /product-inventory"). Since Week 2 every change writes a stock movement (item card):
// add = OPENING, adjust / remove = ADJUSTMENT. costPrice is the weighted AVERAGE cost.
import api from "../../services/api";
import { toMoneyNumber } from "../../utils/money";

// quantity and costPrice are Decimal(18,4) in the database.
const DECIMALS = { maxDecimals: 4 };

// Warehouses + branches: for the warehouse Select ("<warehouse> — <branch>").
export async function getInventories() {
  const response = await api.get("/inventory");
  return response.data.data;
}

export async function getBranches() {
  const response = await api.get("/branch");
  return response.data.data;
}

// Products: for the product Select in the add form.
export async function getProducts() {
  const response = await api.get("/products");
  return response.data.data;
}

// Stock records of one warehouse; each has product (+ category + primaryItemUnit).
export async function getStock(inventoryId) {
  const response = await api.get(`/product-inventory/inventory/${inventoryId}`);
  return response.data.data;
}

// inventoryId goes only in the URL. If this product was removed from this warehouse before,
// the backend restores the old record (same 201, only the message differs).
export async function addStock(inventoryId, form) {
  const response = await api.post(`/product-inventory/inventory/${inventoryId}`, {
    productId: form.productId,
    quantity: toMoneyNumber(form.quantity, DECIMALS),
    costPrice: toMoneyNumber(form.costPrice, DECIMALS),
  });
  return response.data.data;
}

// Stock adjustment (تسوية): the server writes an ADJUSTMENT movement with the difference.
// changed = { quantity: true/false, costPrice: true/false } (the form calls it only when one is true).
// Only the changed values are sent: an unchanged one is left out, so a value that a document
// (e.g. a posted purchase invoice) changed in the meantime is never overwritten with the old number.
// reason is required by the backend whenever quantity or costPrice changes (max 250).
export async function adjustStock(id, form, changed) {
  const body = {};
  if (changed.quantity) body.quantity = toMoneyNumber(form.quantity, DECIMALS);
  if (changed.costPrice) body.costPrice = toMoneyNumber(form.costPrice, DECIMALS);
  body.reason = form.reason.trim();

  const response = await api.patch(`/product-inventory/${id}`, body);
  return response.data.data;
}

// The backend first adjusts the stock to 0 (ADJUSTMENT, reason "حذف الصنف من المخزن"), then removes the row.
export async function removeStock(id) {
  await api.delete(`/product-inventory/${id}`);
}
