// All backend calls of the Products page.
// Docs: ../backend/doc/week1/products.txt + ../backend/doc/week2/week2flow.txt (section 12: the primary
// unit is locked once the product has stock movements or product units; a product in a warehouse can't
// become SERVICE) + ../backend/doc/week2/product-units.txt.
import api from "../../services/api";
import { optionalField } from "../../utils/body";
import { toMoneyNumber } from "../../utils/money";

// Prices and reorderLimit are Decimal(18,4) in the database.
const DECIMALS = { maxDecimals: 4 };

// Only the documented fields. Never sent: code (server generates it), costingMethod (only one
// value, the server default), nested objects (category, primaryItemUnit).
function toProductBody(form, isEdit) {
  return {
    name: form.name.trim(),
    // barcode is UNIQUE and optional: left out on create when empty; null on edit when emptied
    // (null clears it, and many products can have no barcode).
    barcode: optionalField(form.barcode, isEdit),
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

// One product with its details. Week 2: "units" = its other units (carton = 12...), [] when none.
export async function getProduct(id) {
  const response = await api.get(`/products/${id}`);
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
  const response = await api.post("/products", toProductBody(form, false));
  return response.data.data;
}

export async function updateProduct(id, form) {
  const response = await api.patch(`/products/${id}`, toProductBody(form, true));
  return response.data.data;
}

export async function deleteProduct(id) {
  await api.delete(`/products/${id}`);
}
