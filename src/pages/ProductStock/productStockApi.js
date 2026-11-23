// All backend calls of the Product Stock page (أرصدة المخزون).
// Docs: ../backend/doc/week1/product-inventory.txt + FRONTEND_WEEK1_UPDATE_2.txt (PART 1)
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

// Manual correction: only quantity and costPrice can change.
export async function updateStock(id, form) {
  const response = await api.patch(`/product-inventory/${id}`, {
    quantity: toMoneyNumber(form.quantity, DECIMALS),
    costPrice: toMoneyNumber(form.costPrice, DECIMALS),
  });
  return response.data.data;
}

export async function removeStock(id) {
  await api.delete(`/product-inventory/${id}`);
}
