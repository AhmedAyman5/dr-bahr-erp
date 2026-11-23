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
