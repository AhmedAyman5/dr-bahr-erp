// Money inputs (forms). The DB columns are Decimal(18,2): up to 16 digits before the point
// and 2 after. The form keeps the typed text; an empty field means 0.
//
// Usage:
//   const error = validateMoney(form.creditLimit, { min: 0 }); // "" when valid
//   body.creditLimit = toMoneyNumber(form.creditLimit);        // "12.5" → 12.5, "" → 0

const MONEY_PATTERN = /^-?\d+(\.\d+)?$/;
const MAX_INTEGER_DIGITS = 16;
const MAX_DECIMALS = 2;

// Returns an Arabic error message, or "" when the value is valid.
// options.min: smallest allowed value (e.g. 0). Leave it out to allow negative values.
export function validateMoney(text, options = {}) {
  const value = String(text ?? "").trim();
  if (value === "") return ""; // empty = 0

  if (!MONEY_PATTERN.test(value)) return "أدخل رقماً صالحاً";

  const [integerPart, decimalPart = ""] = value.replace("-", "").split(".");
  if (decimalPart.length > MAX_DECIMALS) return "الحد الأقصى رقمان بعد العلامة العشرية";
  if (integerPart.replace(/^0+/, "").length > MAX_INTEGER_DIGITS) return "القيمة كبيرة جداً";

  if (options.min !== undefined && Number(value) < options.min) {
    return `القيمة يجب ألا تقل عن ${options.min}`;
  }
  return "";
}

// Text from a money input → number for the request body. Empty → 0.
export function toMoneyNumber(text) {
  const value = String(text ?? "").trim();
  return value === "" ? 0 : Number(value);
}
