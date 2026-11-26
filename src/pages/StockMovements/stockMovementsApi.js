// All backend calls of the Stock Movements page (حركات المخزون).
// Docs: ../backend/doc/week2/stock.txt ("1) List movements") + 00-overview.txt (pagination).
// Read only: there is NO POST. Movements come from documents and from أرصدة المخزون.
import api from "../../services/api";
import { localDayEndISO, localDayStartISO } from "../../utils/dates";

// One page of movements, NEWEST first → data = { items, meta }.
// Receives { page, pageSize, ...filters } from usePaginatedData (empty filters are already removed).
// The params are named one by one: an unknown param → 400 VALIDATION_FAILED.
// Each item has product { id, code, name }, warehouse { id, name } and createdByUser { id, username }.
//
// dateFrom / dateTo come from the page as days ("YYYY-MM-DD", both inclusive). movementDate is a DATE-TIME,
// and the backend reads a plain day as a UTC day, so the LOCAL (Cairo) day boundaries are sent instead:
//   "2026-11-25" → dateFrom "2026-11-24T22:00:00.000Z", dateTo "2026-11-25T21:59:59.999Z"
// (Document lists filter DATE-ONLY columns and send the plain day: see utils/dates.js.)
export async function getStockMovements({ page, pageSize, productId, warehouseId, type, dateFrom, dateTo }) {
  const response = await api.get("/stock-movements", {
    params: {
      page,
      pageSize,
      productId,
      warehouseId,
      type,
      dateFrom: dateFrom ? localDayStartISO(dateFrom) : undefined,
      dateTo: dateTo ? localDayEndISO(dateTo) : undefined,
    },
  });
  return response.data.data;
}

// Filter lists (plain arrays). Products: the page keeps only STOCK ones (SERVICE has no stock).
export async function getProducts() {
  const response = await api.get("/products");
  return response.data.data;
}

// Warehouses + branches: for the warehouse filter ("<warehouse> — <branch>").
export async function getInventories() {
  const response = await api.get("/inventory");
  return response.data.data;
}

export async function getBranches() {
  const response = await api.get("/branch");
  return response.data.data;
}
