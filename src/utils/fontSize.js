// Font size setting (حجم الخط) for the whole app — chosen in the Header (FontSizeMenu).
//
// How it works: it sets the ROOT font size on <html>. Every size in the app is in rem (Tailwind), so
// text, spacing and controls all scale together. Never hard-code px for text or spacing (CLAUDE.md §8).
//
// The choice is a device setting, not a user setting: saved in localStorage (key "ui.fontSize"), kept on
// logout, not sent to the backend. main.jsx applies it BEFORE the first render, so the page never
// flashes in the wrong size.
//
// Usage:
//   applyFontSize(getFontSize()); // main.jsx, once at start
//   setFontSize("large");         // the Header menu: apply + save

const STORAGE_KEY = "ui.fontSize";

// rootSize is relative to the browser's own default (16px unless the user changed it in the browser):
// 87.5% = 14px · 100% = 16px (the original design) · 112.5% = 18px. A user who made the browser text
// bigger keeps that on top of this setting.
export const FONT_SIZES = [
  { value: "small", label: "صغير", rootSize: "87.5%" },
  { value: "medium", label: "متوسط", rootSize: "100%" },
  { value: "large", label: "كبير", rootSize: "112.5%" },
];

export const DEFAULT_FONT_SIZE = "medium";

function findFontSize(value) {
  return FONT_SIZES.find((size) => size.value === value);
}

// The saved choice: "small" / "medium" / "large". Nothing saved, an unknown value or no storage → "medium".
export function getFontSize() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return findFontSize(saved) ? saved : DEFAULT_FONT_SIZE;
  } catch {
    return DEFAULT_FONT_SIZE;
  }
}

// Sets the root font size on <html> (an unknown value → medium).
export function applyFontSize(value) {
  const size = findFontSize(value) ?? findFontSize(DEFAULT_FONT_SIZE);
  document.documentElement.style.fontSize = size.rootSize;
}

// Applies the new size and saves it for the next visit.
export function setFontSize(value) {
  applyFontSize(value);
  try {
    localStorage.setItem(STORAGE_KEY, value);
  } catch {
    // Storage blocked or full: the size still works until the page is reloaded.
  }
}
