// Calendar days ("YYYY-MM-DD") for date inputs and date filters.
// The UI shows and types days as DD/MM/YYYY (components/ui/DateInput); the code and the API use "YYYY-MM-DD".
//
// ─── Which value a date FILTER must send ─────────────────────────────────────────────────────────────────
// It depends on the column the backend filters:
//   - a DATE-TIME column (a moment, e.g. stock movement movementDate): send the LOCAL day boundaries
//     with localDayStartISO / localDayEndISO. The backend uses a full ISO date-time exactly, but reads a plain
//     "YYYY-MM-DD" as a UTC day, which in Cairo (UTC+2) would move movements made between 00:00 and 02:00
//     into the previous day.
//   - a DATE-ONLY column (a calendar day: quotationDate, invoiceDate, returnDate, ...): send the plain
//     "YYYY-MM-DD". The backend cuts the value to its first 10 characters, so these helpers would be WRONG
//     there (Cairo's start of the 25th is "2026-11-24T22:00:00.000Z" → read as the 24th).

// localDayStartISO("2026-11-25") → the start of that day in the browser's time zone, as ISO (UTC).
//   Cairo (UTC+2): "2026-11-24T22:00:00.000Z"
export function localDayStartISO(day) {
  const [year, month, date] = day.split("-").map(Number);
  return new Date(year, month - 1, date, 0, 0, 0, 0).toISOString();
}

// localDayEndISO("2026-11-25") → the last millisecond of that day (23:59:59.999) in the browser's time zone.
//   Cairo (UTC+2): "2026-11-25T21:59:59.999Z"
export function localDayEndISO(day) {
  const [year, month, date] = day.split("-").map(Number);
  return new Date(year, month - 1, date, 23, 59, 59, 999).toISOString();
}

// Today in the browser's time zone as "YYYY-MM-DD" (the default date of a new document).
// Not new Date().toISOString(): that is the UTC day (between 00:00 and 02:00 in Cairo it is still yesterday).
export function todayDay() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

// ─── DD/MM/YYYY text (DateInput) ─────────────────────────────────────────────────────────────────────────

// Years accepted by DateInput: catches typos like 0202 or 20266.
const MIN_YEAR = 1900;
const MAX_YEAR = 2100;

// dayToText("2026-11-25") → "25/11/2026"  |  "" / invalid → ""
export function dayToText(day) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(day || "");
  return match ? `${match[3]}/${match[2]}/${match[1]}` : "";
}

// textToDay("25/11/2026") → "2026-11-25"  |  incomplete or impossible ("31/02/2026") → ""
export function textToDay(text) {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(text || "");
  if (!match) return "";
  const date = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  if (year < MIN_YEAR || year > MAX_YEAR || month < 1 || month > 12) return "";
  // Day 0 of the next month = the last day of this month (28 / 29 / 30 / 31).
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (date < 1 || date > daysInMonth) return "";
  return `${match[3]}-${match[2]}-${match[1]}`;
}

// What the user typed or pasted → DD/MM/YYYY text, with the slashes put in automatically.
//   "25112026" → "25/11/2026"  |  "2026-11-25" (pasted) → "25/11/2026"  |  "5/" → "05/"
//   adding = the text got longer (typing forward): "25" → "25/" so the user just goes on typing.
export function formatDayTyping(raw, adding = false) {
  const value = (raw || "").trim();
  // A pasted ISO day "2026-11-25" (or "2026-11-25T00:00:00.000Z").
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;

  // "25-11-2026" and "25.11.2026" are read like "25/11/2026".
  const parts = value.replace(/[-.]/g, "/").replace(/[^\d/]/g, "").split("/");
  // A day / month closed by "/" with one digit gets a leading 0 ("5/11" → "05/11").
  const padded = parts.map((part, index) =>
    index < 2 && index < parts.length - 1 && part.length === 1 ? `0${part}` : part,
  );
  const digits = padded.join("").slice(0, 8);

  let text = digits.slice(0, 2);
  if (digits.length > 2) text += `/${digits.slice(2, 4)}`;
  if (digits.length > 4) text += `/${digits.slice(4)}`;
  if (adding && (digits.length === 2 || digits.length === 4)) text += "/";
  return text;
}
