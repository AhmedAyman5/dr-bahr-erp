// A dropdown you can type in to search (combobox): for long lists (products, suppliers) where a plain
// <select> is unusable.
//
// Usage:
//   <SearchSelect
//     label="المورد"
//     required
//     value={form.supplierId}                       // "" = nothing chosen
//     onChange={(value) => setForm({ ...form, supplierId: value })}   // the value, not the event
//     options={suppliers.map((s) => ({ value: s.id, label: s.name, sub: s.code }))}
//     placeholder="ابحث بالاسم أو الكود"
//     error={errors.supplierId}
//   />
//   Filters: emptyLabel="كل الموردين" adds a first option with value "" (choosing it clears the filter).
//   A chosen value that is not in the options any more (deleted record): missingLabel="النيل (محذوف)" (gray).
//   Without a visible label (a table cell): pass aria-label.
//
// options: [{ value, label, sub?, keywords? }] — sub = a small gray line under the label (e.g. the code);
// keywords = extra text the search also looks in (e.g. code + barcode). The search ignores case, Arabic letter
// forms (أ إ آ → ا, ة → ه, ى → ي), diacritics and Arabic-Indic digits (٠١٢ → 012); every typed word must match.
//
// Keyboard: ↓ / ↑ move, Enter chooses, Escape / Tab close. The mouse works too; clicking outside closes it.
// Closing without choosing keeps the old value. The list is drawn in a portal on top of the page (fixed position
// under the input, or above it when there is no room), so a scrolling table never cuts it off.
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";

const NO_RESULTS = "لا توجد نتائج";
// Room the list needs below the input before it opens above instead (about max-h-64 = 16rem).
const LIST_ROOM_REM = 16.5;

// For searching: lower case, Western digits, one form per Arabic letter, no diacritics / tatweel.
function normalizeSearchText(text) {
  return String(text ?? "")
    .toLowerCase()
    .replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (digit) => String(digit.charCodeAt(0) - 0x06f0))
    .replace(/[ً-ٰٟـ]/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي");
}

function matches(option, words) {
  const text = normalizeSearchText(`${option.label} ${option.sub ?? ""} ${option.keywords ?? ""}`);
  return words.every((word) => text.includes(word));
}

// Where the list goes (fixed position, in px from the window): under the input, or above it when there is no
// room below; lined up with the input's start edge (the right edge in RTL) and at least as wide as it.
function getListPosition(input) {
  const rect = input.getBoundingClientRect();
  const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
  const roomBelow = window.innerHeight - rect.bottom;
  const openUp = roomBelow < LIST_ROOM_REM * rem && rect.top > roomBelow;
  const rtl = getComputedStyle(input).direction === "rtl";
  return {
    minWidth: rect.width,
    ...(openUp ? { bottom: window.innerHeight - rect.top + 4 } : { top: rect.bottom + 4 }),
    ...(rtl ? { right: window.innerWidth - rect.right } : { left: rect.left }),
  };
}

function SearchSelect({
  label,
  value = "",
  onChange,
  options = [],
  placeholder = "ابحث...",
  emptyLabel,
  missingLabel,
  required = false,
  error,
  readOnly = false,
  disabled = false,
  autoFocus = false,
  className = "",
  "aria-label": ariaLabel,
}) {
  const id = useId();
  const listId = `${id}-list`;
  const inputRef = useRef(null);

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [position, setPosition] = useState(null);

  const allOptions = emptyLabel ? [{ value: "", label: emptyLabel }, ...options] : options;
  const selected = allOptions.find((option) => option.value === value);
  const missing = Boolean(value) && !selected;
  const shownLabel = selected?.label ?? (missing ? (missingLabel ?? "") : "");

  const words = normalizeSearchText(query).split(/\s+/).filter(Boolean);
  const filtered = words.length > 0 ? allOptions.filter((option) => matches(option, words)) : allOptions;
  const locked = readOnly || disabled;
  const optionId = (index) => `${id}-option-${index}`;

  // While open, the list follows the input when the page / a table scrolls or the window resizes.
  useEffect(() => {
    if (!open) return;
    function update() {
      if (inputRef.current) setPosition(getListPosition(inputRef.current));
    }
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [open]);

  function openList(nextQuery = "") {
    if (locked) return;
    setPosition(getListPosition(inputRef.current));
    setQuery(nextQuery);
    // Start on the chosen option when the whole list shows; on the first match while searching.
    const index = nextQuery ? 0 : Math.max(allOptions.findIndex((option) => option.value === value), 0);
    setActiveIndex(index);
    setOpen(true);
  }

  function closeList() {
    setOpen(false);
    setQuery("");
  }

  function choose(option) {
    closeList();
    if (option.value !== value) onChange?.(option.value);
  }

  function moveActive(step) {
    if (filtered.length === 0) return;
    const next = Math.min(Math.max(activeIndex + step, 0), filtered.length - 1);
    setActiveIndex(next);
    document.getElementById(optionId(next))?.scrollIntoView({ block: "nearest" });
  }

  function handleKeyDown(event) {
    if (locked) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (open) moveActive(1);
      else openList();
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      if (open) moveActive(-1);
    } else if (event.key === "Enter") {
      // Enter chooses (and does not submit the form) only while the list is open.
      if (open) {
        event.preventDefault();
        if (filtered[activeIndex]) choose(filtered[activeIndex]);
      }
    } else if (event.key === "Escape") {
      if (open) {
        // Closes the list only (not a modal around it).
        event.stopPropagation();
        closeList();
      }
    } else if (event.key === "Tab") {
      if (open) closeList();
    }
  }

  function handleTyping(event) {
    const text = event.target.value;
    if (!open) openList(text);
    else {
      setQuery(text);
      setActiveIndex(0);
    }
  }

  const activeId = open && filtered[activeIndex] ? optionId(activeIndex) : undefined;

  return (
    <div className={className}>
      {label && (
        <label htmlFor={id} className="mb-1 block text-sm font-medium text-slate-700">
          {label}
          {required && <span className="ms-1 text-red-600">*</span>}
        </label>
      )}
      <div className="relative">
        <input
          ref={inputRef}
          id={id}
          type="text"
          role="combobox"
          aria-label={ariaLabel}
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={activeId}
          aria-invalid={Boolean(error)}
          autoComplete="off"
          autoFocus={autoFocus}
          readOnly={readOnly}
          disabled={disabled}
          value={open ? query : shownLabel}
          // While searching, the chosen label stays visible as the placeholder.
          placeholder={open && shownLabel ? shownLabel : placeholder}
          onChange={handleTyping}
          onClick={() => (open ? closeList() : openList())}
          onKeyDown={handleKeyDown}
          onBlur={closeList}
          className={`w-full truncate rounded-lg border py-2 ps-3 pe-9 text-sm outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20 ${
            error ? "border-red-600" : "border-slate-300"
          } ${locked ? "cursor-default bg-slate-100 text-slate-500" : "cursor-pointer bg-white"} ${
            missing && !open ? "text-slate-400" : ""
          }`}
        />
        <ChevronDown
          size={16}
          className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 text-slate-400"
          aria-hidden="true"
        />
      </div>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}

      {open &&
        position &&
        createPortal(
          <ul
            id={listId}
            role="listbox"
            aria-label={label || ariaLabel}
            // Clicking the list (or its scrollbar) keeps the focus in the input, so it does not close.
            onMouseDown={(event) => event.preventDefault()}
            style={position}
            className="fixed z-60 max-h-64 w-max max-w-sm overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 text-sm shadow-lg"
          >
            {filtered.length === 0 && <li className="px-3 py-2 text-slate-500">{NO_RESULTS}</li>}
            {filtered.map((option, index) => {
              const isChosen = option.value === value;
              return (
                <li
                  key={option.value || "empty"}
                  id={optionId(index)}
                  role="option"
                  aria-selected={isChosen}
                  onClick={() => choose(option)}
                  onMouseMove={() => index !== activeIndex && setActiveIndex(index)}
                  className={`flex cursor-pointer items-start gap-2 px-3 py-2 ${
                    index === activeIndex ? "bg-primary-soft" : ""
                  }`}
                >
                  <span className="mt-0.5 w-4 shrink-0 text-primary">{isChosen && <Check size={16} />}</span>
                  <span className="min-w-0">
                    <span className={`block whitespace-normal ${isChosen ? "font-medium" : ""} text-slate-900`}>
                      {option.label}
                    </span>
                    {option.sub && <span className="block text-xs text-slate-500">{option.sub}</span>}
                  </span>
                </li>
              );
            })}
          </ul>,
          document.body,
        )}
    </div>
  );
}

export default SearchSelect;
