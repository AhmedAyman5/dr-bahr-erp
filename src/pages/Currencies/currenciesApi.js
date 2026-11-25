// All backend calls of the Currencies page. Docs: ../backend/doc/week2/currency.txt
import api from "../../services/api";
import { optionalField } from "../../utils/body";

// Only the documented fields. Currencies are the ONLY module where we send `code`
// (typed by the user: 3 capital letters, e.g. EGP).
// symbol: left out on create when empty; null on edit when emptied (null clears it).
// isDefault: sent (true) only when the user chose it. Never false: false on the current
// default currency is a 400, and a new currency is not the default anyway.
function toCurrencyBody(form, isEdit) {
  const body = {
    code: form.code.trim().toUpperCase(),
    name: form.name.trim(),
    symbol: optionalField(form.symbol, isEdit),
  };
  if (form.makeDefault) body.isDefault = true;
  return body;
}

// Plain array (not paginated): the default currency first, then by code.
export async function getCurrencies() {
  const response = await api.get("/currency");
  return response.data.data;
}

export async function createCurrency(form) {
  const response = await api.post("/currency", toCurrencyBody(form, false));
  return response.data.data;
}

export async function updateCurrency(id, form) {
  const response = await api.patch(`/currency/${id}`, toCurrencyBody(form, true));
  return response.data.data;
}

// Makes this currency THE default; the old default becomes non-default by itself.
export async function makeDefaultCurrency(id) {
  const response = await api.patch(`/currency/${id}`, { isDefault: true });
  return response.data.data;
}

export async function deleteCurrency(id) {
  await api.delete(`/currency/${id}`);
}
