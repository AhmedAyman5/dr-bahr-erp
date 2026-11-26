// Node-only checks of src/utils/dates.js (no page): DD/MM/YYYY parsing for DateInput and the local day
// boundaries for date-time filters. The exact Cairo strings are checked in the browser (stock-movements.spec.js,
// time zone Africa/Cairo); here the checks hold in ANY time zone.
import { test, expect } from "@playwright/test";
import { dayToText, formatDayTyping, localDayEndISO, localDayStartISO, textToDay } from "../src/utils/dates.js";

// "2026-12-31" → "2027-01-01"
function nextDay(day) {
  const date = new Date(`${day}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

// The local (this machine's time zone) parts of a moment.
function localParts(iso) {
  const date = new Date(iso);
  return [
    date.getFullYear(),
    date.getMonth() + 1,
    date.getDate(),
    date.getHours(),
    date.getMinutes(),
    date.getSeconds(),
    date.getMilliseconds(),
  ];
}

test.describe("utils/dates.js", () => {
  test("textToDay: only full, real days; dayToText the other way", () => {
    expect(textToDay("25/11/2026")).toBe("2026-11-25");
    expect(textToDay("29/02/2028")).toBe("2028-02-29"); // leap year
    for (const text of ["31/02/2026", "29/02/2026", "31/04/2026", "00/01/2026", "01/13/2026", "01/00/2026"]) {
      expect(textToDay(text), text).toBe("");
    }
    // Incomplete, other formats, out-of-range years.
    for (const text of ["25/11/202", "1/1/2026", "2026-11-25", "01/01/1899", "01/01/2101", "", null, undefined]) {
      expect(textToDay(text), String(text)).toBe("");
    }

    expect(dayToText("2026-11-25")).toBe("25/11/2026");
    expect(dayToText("2026-11-25T00:00:00.000Z")).toBe("25/11/2026");
    expect(dayToText("")).toBe("");
    expect(dayToText(null)).toBe("");
  });

  test("formatDayTyping: slashes while typing, pasted formats, single digits", () => {
    expect(formatDayTyping("2", true)).toBe("2");
    expect(formatDayTyping("25", true)).toBe("25/");
    expect(formatDayTyping("25/1", true)).toBe("25/1");
    expect(formatDayTyping("25/11", true)).toBe("25/11/");
    expect(formatDayTyping("25112026", false)).toBe("25/11/2026");
    expect(formatDayTyping("251120269", true)).toBe("25/11/2026"); // 8 digits at most
    // Deleting: no slash is added back.
    expect(formatDayTyping("25/", false)).toBe("25");
    // Pasted.
    expect(formatDayTyping("2026-11-25")).toBe("25/11/2026");
    expect(formatDayTyping(" 2026-11-25T00:00:00.000Z ")).toBe("25/11/2026");
    expect(formatDayTyping("25-11-2026")).toBe("25/11/2026");
    expect(formatDayTyping("25.11.2026")).toBe("25/11/2026");
    // A single-digit day / month closed with "/".
    expect(formatDayTyping("5/", true)).toBe("05/");
    expect(formatDayTyping("5/3/2026")).toBe("05/03/2026");
    // Letters are dropped.
    expect(formatDayTyping("2a5")).toBe("25");
  });

  test("localDayStartISO / localDayEndISO: local 00:00:00.000 and 23:59:59.999, back to back around midnight", () => {
    for (const day of ["2026-11-25", "2026-12-31", "2027-01-01", "2028-02-29"]) {
      const [year, month, date] = day.split("-").map(Number);
      const start = localDayStartISO(day);
      const end = localDayEndISO(day);

      expect(start).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.000Z$/);
      expect(localParts(start), day).toEqual([year, month, date, 0, 0, 0, 0]);
      expect(localParts(end), day).toEqual([year, month, date, 23, 59, 59, 999]);
      // The next day starts 1 ms after this one ends: no gap and no overlap at midnight.
      expect(new Date(localDayStartISO(nextDay(day))).getTime() - new Date(end).getTime(), day).toBe(1);
    }
  });
});
