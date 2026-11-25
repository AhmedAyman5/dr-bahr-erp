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

// ---- Product units (وحدات الصنف): ../backend/doc/week2/product-units.txt ----
// "1 كرتونة = 24 قطعة": factor = how many PRIMARY units one other unit holds.

// Only the documented fields. itemUnitId is sent on create only: on edit the unit is read-only
// (to change it the user deletes the row and adds the new unit).
// barcode / retailPrice are optional: left out on create when empty; null on edit when emptied
// (null clears them). factor is required: always a number.
function toProductUnitBody(form, isEdit) {
  const retailPriceText = form.retailPrice.trim();
  let retailPrice = toMoneyNumber(retailPriceText, DECIMALS);
  if (retailPriceText === "") retailPrice = isEdit ? null : undefined;

  return {
    itemUnitId: isEdit ? undefined : form.itemUnitId,
    factor: toMoneyNumber(form.factor, DECIMALS),
    barcode: optionalField(form.barcode, isEdit),
    retailPrice,
  };
}

// The primary unit FIRST (isPrimary: true, id null, the product's barcode / price), then the
// other units by factor.
export async function getProductUnits(productId) {
  const response = await api.get(`/products/${productId}/units`);
  return response.data.data;
}

// Returns { productUnit, restored }. The server answers 201 in both cases; only its message tells
// that a unit deleted before came back ("Product unit restored successfully"), so the page can say so.
export async function createProductUnit(productId, form) {
  const response = await api.post(`/products/${productId}/units`, toProductUnitBody(form, false));
  return {
    productUnit: response.data.data,
    restored: /restored/i.test(response.data.message || ""),
  };
}

export async function updateProductUnit(id, form) {
  const response = await api.patch(`/product-units/${id}`, toProductUnitBody(form, true));
  return response.data.data;
}

export async function deleteProductUnit(id) {
  await api.delete(`/product-units/${id}`);
}
