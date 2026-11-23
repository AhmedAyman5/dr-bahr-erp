// Money inputs (forms). The DB columns are Decimal(18, X): 18 digits in total, X of them after
// the point. Customers / suppliers use Decimal(18,2), product prices Decimal(18,4).
// The form keeps the typed text; an empty field means 0.
//
// Usage:
//   const error = validateMoney(form.creditLimit, { min: 0 });                  // "" when valid
//   const error = validateMoney(form.retailPrice, { min: 0, maxDecimals: 4 });  // Decimal(18,4)
//   body.creditLimit = toMoneyNumber(form.creditLimit);                         // "12.5" → 12.5, "" → 0
//   body.retailPrice = toMoneyNumber(form.retailPrice, { maxDecimals: 4 });

const MONEY_PATTERN = /^-?\d+(\.\d+)?$/;
const TOTAL_DIGITS = 18;
const DEFAULT_MAX_DECIMALS = 2;

function decimalsErrorText(maxDecimals) {
  return maxDecimals === 2
    ? "الحد الأقصى رقمان بعد العلامة العشرية"
    : `الحد الأقصى ${maxDecimals} أرقام بعد العلامة العشرية`;
}

// Returns an Arabic error message, or "" when the value is valid.
// options.min: smallest allowed value (e.g. 0). Leave it out to allow negative values.
// options.maxDecimals: digits allowed after the point (default 2). The digits before the
// point are what is left of the 18 (2 → 16, 4 → 14).
export function validateMoney(text, options = {}) {
  const maxDecimals = options.maxDecimals ?? DEFAULT_MAX_DECIMALS;
  const value = String(text ?? "").trim();
  if (value === "") return ""; // empty = 0

  if (!MONEY_PATTERN.test(value)) return "أدخل رقماً صالحاً";

  const [integerPart, decimalPart = ""] = value.replace("-", "").split(".");
  if (decimalPart.length > maxDecimals) return decimalsErrorText(maxDecimals);
  if (integerPart.replace(/^0+/, "").length > TOTAL_DIGITS - maxDecimals) return "القيمة كبيرة جداً";

  if (options.min !== undefined && Number(value) < options.min) {
    return `القيمة يجب ألا تقل عن ${options.min}`;
  }
  return "";
}

// Text from a money input → number for the request body. Empty → 0.
// Rounded to options.maxDecimals (default 2) as a safety net; validateMoney already blocks more.
export function toMoneyNumber(text, options = {}) {
  const maxDecimals = options.maxDecimals ?? DEFAULT_MAX_DECIMALS;
  const value = String(text ?? "").trim();
  if (value === "") return 0;
  return Number(Number(value).toFixed(maxDecimals));
}
