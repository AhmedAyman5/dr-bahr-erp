// Live PREVIEW of a document's totals (quotations, invoices, returns) while the user types.
// The server computes the real totals; after saving the page always shows the server's values.
// Same formulas as the backend (../backend/src/utils/document/document-totals.ts):
//
//   line total    = quantity × price − line discount                 (4 decimals)
//                   line discount = percent of quantity × price, OR a fixed amount
//   subTotal      = sum of the line totals                           (2 decimals)
//   discountValue = subTotal × discountPercent / 100 when the percent is above 0,
//                   otherwise the fixed amount                        (2 decimals)
//   taxValue      = (subTotal − discountValue) × taxPercent / 100     (2 decimals)
//   netTotal      = subTotal − discountValue + taxValue
// Rounding: half up (1.005 → 1.01), like the backend's ROUND_HALF_UP.
//
// Usage:
//   const lineTotal = calcLineTotal({ quantity: "10", price: "150", discountType: "percent", discount: "" }); // 1500
//   const totals = calcDocumentTotals([1500], { discountType: "percent", discount: "10", tax: "14" });
//   // → { subTotal: 1500, discountValue: 150, taxValue: 189, netTotal: 1539 }

// Text from an input → a number, or null when it is not a plain number ("" counts as 0 only where noted).
function toNumber(text) {
  const value = String(text ?? "").trim();
  if (!/^\d+(\.\d+)?$/.test(value)) return null;
  return Number(value);
}

// Empty → 0 (an empty discount / tax means none).
function toNumberOrZero(text) {
  return String(text ?? "").trim() === "" ? 0 : toNumber(text);
}

// Half-up rounding without float surprises: 1.005 → 1.01 (plain Math.round(1.005 * 100) gives 1.00).
// toPrecision(15) first drops the binary noise of a float (1.0000499999999999 → 1.00005), then the number is
// shifted with an exponent STRING ("1.005e2" = 100.5 exactly) and rounded.
export function roundHalfUp(value, places) {
  if (!Number.isFinite(value)) return NaN;
  const sign = value < 0 ? -1 : 1;
  const clean = Number(Math.abs(value).toPrecision(15));
  const text = String(clean);
  // Very small / big numbers are written with an exponent already ("1e-7"): toFixed is enough there.
  if (text.includes("e")) return sign * Number(clean.toFixed(places));
  const shifted = Math.round(Number(`${text}e${places}`));
  return sign * Number(`${shifted}e-${places}`);
}

// One line → its total (4 decimals), or null when the quantity / price / discount is not a valid number.
// line = { quantity, price, discountType: "percent" | "amount", discount } (texts from the inputs).
export function calcLineTotal(line) {
  const quantity = toNumber(line.quantity);
  const price = toNumber(line.price);
  const discount = toNumberOrZero(line.discount);
  if (quantity === null || price === null || discount === null) return null;

  const gross = quantity * price;
  const lineDiscount = line.discountType === "amount" ? discount : (gross * discount) / 100;
  return roundHalfUp(gross - lineDiscount, 4);
}

// The header totals from the line totals (numbers). header = { discountType, discount, tax } (texts).
// A percent above 0 wins; otherwise the amount is used (like the backend). Invalid discount / tax → treated as 0
// (the form shows its own error under that field).
export function calcDocumentTotals(lineTotals, header) {
  const subTotal = roundHalfUp(
    lineTotals.reduce((sum, total) => sum + total, 0),
    2,
  );
  const discountInput = toNumberOrZero(header.discount) ?? 0;
  const taxPercent = toNumberOrZero(header.tax) ?? 0;

  const discountValue =
    header.discountType === "amount"
      ? roundHalfUp(discountInput, 2)
      : roundHalfUp((subTotal * discountInput) / 100, 2);
  const taxValue = roundHalfUp(((subTotal - discountValue) * taxPercent) / 100, 2);
  const netTotal = roundHalfUp(subTotal - discountValue + taxValue, 2);

  return { subTotal, discountValue, taxValue, netTotal };
}
