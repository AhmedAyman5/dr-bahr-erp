// Display helpers. The API returns money / quantities as strings ("12.5").

// formatNumber("1234.5") → "١٬٢٣٤٫٥"  |  empty / invalid → "-"
export function formatNumber(value) {
  if (value === null || value === undefined || value === "") return "-";

  const number = Number(value);
  if (Number.isNaN(number)) return "-";

  return number.toLocaleString("ar-EG", { maximumFractionDigits: 4 });
}

// formatDate("2026-11-21T01:36:50.897Z") → "٢١ نوفمبر ٢٠٢٦"  |  empty / invalid → "-"
export function formatDate(value) {
  if (!value) return "-";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";

  return date.toLocaleDateString("ar-EG", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}
