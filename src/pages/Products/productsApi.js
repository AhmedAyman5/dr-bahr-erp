// All backend calls of the Products page.
// Docs: ../backend/doc/week1/products.txt + FRONTEND_WEEK1_UPDATE_2.txt (PART 2)
import api from "../../services/api";
import { toMoneyNumber } from "../../utils/money";

// itemType values the API accepts (sent / compared in English) + their Arabic labels.
export const ITEM_TYPE_OPTIONS = [
  { value: "STOCK", label: "مخزني" },
  { value: "SERVICE", label: "خدمي" },
];

// Prices and reorderLimit are Decimal(18,4) in the database.
const DECIMALS = { maxDecimals: 4 };

// Only the documented fields. Never sent: code (server generates it), costingMethod (only one
// value, the server default), nested objects (category, primaryItemUnit). Barcode: see below.
function toProductBody(form) {
  return {
    name: form.name.trim(),
    categoryId: form.categoryId,
    primaryItemUnitId: form.primaryItemUnitId,
    itemType: form.itemType,
    retailPrice: toMoneyNumber(form.retailPrice, DECIMALS),
    wholesalePrice: toMoneyNumber(form.wholesalePrice, DECIMALS),
    bulkWholesalePrice: toMoneyNumber(form.bulkWholesalePrice, DECIMALS),
    reorderLimit: toMoneyNumber(form.reorderLimit, DECIMALS),
    hasExpiryDate: Boolean(form.hasExpiryDate),
  };
}

export async function getProducts() {
  const response = await api.get("/products");
  return response.data.data;
}

// Categories and units: for the filter, the form Selects and the "add these first" hint.
export async function getCategories() {
  const response = await api.get("/categories");
  return response.data.data;
}

export async function getItemUnits() {
  const response = await api.get("/item-unit");
  return response.data.data;
}

export async function createProduct(form) {
  const body = toProductBody(form);
  // barcode is UNIQUE: "" would clash between two products, so an empty barcode is left out.
  const barcode = form.barcode.trim();
  if (barcode) body.barcode = barcode;

  const response = await api.post("/products", body);
  return response.data.data;
}

export async function updateProduct(id, form) {
  const body = toProductBody(form);
  // barcode is UNIQUE: send null (not "") when emptied, so many products can have no barcode.
  body.barcode = form.barcode.trim() || null;

  const response = await api.patch(`/products/${id}`, body);
  return response.data.data;
}

export async function deleteProduct(id) {
  await api.delete(`/products/${id}`);
}
