// Display helpers. The API returns money / quantities as strings ("12.5").
// "ar-EG-u-nu-latn" = Arabic formatting (month names) with Western digits (123, not ١٢٣).

const LOCALE = "ar-EG-u-nu-latn";

// formatNumber("1234.5") → "1,234.5"  |  empty / invalid → "-"
export function formatNumber(value) {
  if (value === null || value === undefined || value === "") return "-";

  const number = Number(value);
  if (Number.isNaN(number)) return "-";

  return number.toLocaleString(LOCALE, { maximumFractionDigits: 4 });
}

// Stock quantities (always in the product's primary unit): up to 4 decimals, no forced decimals.
// formatQuantity("1234.5") → "1,234.5"  |  "-24" → "-24"  |  "0.12345" → "0.1235"  |  empty / invalid → "-"
// options.signed: a "+" before a positive value ("+120"), for the movements list.
// Like formatMoney the sign is added by hand, so show it inside <span dir="ltr">.
export function formatQuantity(value, options = {}) {
  if (value === null || value === undefined || String(value).trim() === "") return "-";

  const number = Number(value);
  if (!Number.isFinite(number)) return "-";

  const rounded = Math.round(number * 10000) / 10000;
  const text = Math.abs(rounded).toLocaleString(LOCALE, { maximumFractionDigits: 4 });
  if (rounded < 0) return `-${text}`;
  return options.signed && rounded > 0 ? `+${text}` : text;
}

// Document number of a stock movement: "PI-2026-000001", or "-" for OPENING / ADJUSTMENT (no document).
// Plain text for now. It is ONE helper on purpose: when the purchase pages exist it can become a link
// to the document (movement.sourceType + movement.sourceId).
export function formatSourceCode(movement) {
  return movement?.sourceCode || "-";
}

// formatDate("2026-11-21T01:36:50.897Z") → "21 نوفمبر 2026"  |  empty / invalid → "-"
export function formatDate(value) {
  if (!value) return "-";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";

  return date.toLocaleDateString(LOCALE, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

// A CALENDAR DAY from the API (a date-only column: quotationDate, hireDate, validUntil, ...), sent back as
// "2026-11-20T00:00:00.000Z". Shown from its first 10 characters, so it never shifts with the time zone
// (new Date("...T00:00:00.000Z") would be the 19th in a time zone behind UTC).
// formatDay("2026-11-20T00:00:00.000Z") → "20 نوفمبر 2026"  |  "2026-11-20" → same  |  empty / invalid → "-"
export function formatDay(value) {
  if (!value || !/^\d{4}-\d{2}-\d{2}/.test(value)) return "-";
  // Local midnight of that day → toLocaleDateString shows the same day.
  return formatDate(`${value.slice(0, 10)}T00:00:00`);
}

// formatDateTime("2026-11-21T13:05:00.000Z") → date + time in local time, e.g. "21 نوفمبر 2026 في 3:05 م"
// empty / invalid → "-"
export function formatDateTime(value) {
  if (!value) return "-";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";

  return date.toLocaleString(LOCALE, {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

// formatTime("2026-11-21T13:05:00.000Z") → the time only, in local time, e.g. "3:05 م" (the time part of
// formatDateTime). For tables that show the day and the time on two lines.  empty / invalid → "-"
export function formatTime(value) {
  if (!value) return "-";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";

  return date.toLocaleTimeString(LOCALE, { hour: "numeric", minute: "2-digit" });
}

// formatMoney("1500") → "1,500.00"  |  "-250.5" → "-250.50"  |  empty / invalid → "-"
// Always 2 decimals, Western digits, no currency symbol.
// options.maxDecimals (default 2): show up to that many decimals, but never fewer than 2.
//   formatMoney("15", { maxDecimals: 4 }) → "15.00"  |  formatMoney("12.3456", { maxDecimals: 4 }) → "12.3456"
// The minus sign is added by hand (the locale would add an invisible direction mark), so in RTL
// show negative-capable values inside <span dir="ltr"> to keep the minus on the left.
export function formatMoney(value, options = {}) {
  if (value === null || value === undefined || String(value).trim() === "") return "-";

  const number = Number(value);
  if (!Number.isFinite(number)) return "-";

  const maxDecimals = Math.max(options.maxDecimals ?? 2, 2);
  const factor = 10 ** maxDecimals;
  const rounded = Math.round(number * factor) / factor;
  const text = Math.abs(rounded).toLocaleString(LOCALE, {
    minimumFractionDigits: 2,
    maximumFractionDigits: maxDecimals,
  });
  return rounded < 0 ? `-${text}` : text;
}
