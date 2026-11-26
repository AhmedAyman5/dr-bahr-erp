// All backend calls of the Item Card page (كارت الصنف).
// Docs: ../backend/doc/week2/stock.txt ("2) Item card") + week2flow.txt (step 16, section 11.3).
import api from "../../services/api";

// ONE product in ONE warehouse (both required). Not paginated.
// data = { product { id, code, name }, warehouse { id, name }, quantity, avgCost, movements[] }
// movements: OLDEST first, each with balanceAfter + avgCostAfter + createdByUser { id, username }.
// Works for a deleted product / warehouse too (the history is kept).
// An id that does not exist at all → 404 NOT_FOUND (field null).
export async function getItemCard(productId, warehouseId) {
  const response = await api.get("/stock-movements/item-card", { params: { productId, warehouseId } });
  return response.data.data;
}

// Products: the page keeps only STOCK ones in its Select (SERVICE has no stock).
// Each has primaryItemUnit (the unit of every quantity on the card).
export async function getProducts() {
  const response = await api.get("/products");
  return response.data.data;
}

// Warehouses + branches: for the warehouse Select ("<warehouse> — <branch>").
export async function getInventories() {
  const response = await api.get("/inventory");
  return response.data.data;
}

export async function getBranches() {
  const response = await api.get("/branch");
  return response.data.data;
}
