// A date field that shows and types the day as DD/MM/YYYY (never the browser's mm/dd/yyyy).
// Use it for EVERY date field: never <input type="date"> directly.
//
// Usage:
//   <DateInput
//     label="تاريخ التعيين"
//     value={form.hireDate}                                   // "YYYY-MM-DD" or ""
//     onChange={(value, { invalid }) => {                     // value: "YYYY-MM-DD" or ""
//       setForm({ ...form, hireDate: value });
//       setHireDateInvalid(invalid);
//     }}
//     error={fieldErrors.hireDate}
//   />
//
// - value / onChange use "YYYY-MM-DD" (or ""), so the form state and the API bodies stay the same.
// - Typing: the slashes come by themselves ("25112026" → "25/11/2026"). Paste works with "25/11/2026" and
//   "2026-11-25". The calendar button opens the browser's date picker.
// - While the text is not a full, real date (half typed, or impossible like 31/02/2026) onChange gives
//   value "" and invalid: true. ALWAYS store the value you get, and block saving while invalid is true
//   (the form's validate()). The field shows "تاريخ غير صحيح" itself once the date is complete or the user
//   leaves the field; an `error` from the form shows when there is no such message.
// - Same label / error / readOnly / disabled look as Input.
import { useId, useRef, useState } from "react";
import { CalendarDays } from "lucide-react";
import { dayToText, formatDayTyping, textToDay } from "../../utils/dates";

const INVALID_DATE = "تاريخ غير صحيح";
// Arabic placeholder in the order of the digits (day on the left); the marks keep the words in LTR order.
const PLACEHOLDER = "يوم‎/‎شهر‎/‎سنة";

function DateInput({
  label,
  value = "",
  onChange,
  required = false,
  error,
  readOnly = false,
  disabled = false,
  className = "",
  ...rest
}) {
  const id = useId();
  const pickerRef = useRef(null);
  const [text, setText] = useState(() => dayToText(value));
  const [touched, setTouched] = useState(false);
  // The value our text stands for. When the parent passes another value (reset, "مسح الفلاتر", edit form),
  // the text follows it. (Adjusting state during render: React re-renders right away.)
  const [shownValue, setShownValue] = useState(value);
  if (value !== shownValue) {
    setShownValue(value);
    setText(dayToText(value));
    setTouched(false);
  }

  const locked = readOnly || disabled;
  const invalid = text !== "" && textToDay(text) === "";
  // Complete text (10 characters) → say it now; half typed → only after leaving the field.
  const ownError = invalid && (text.length === 10 || touched) ? INVALID_DATE : "";
  const shownError = ownError || error;

  function emit(nextText) {
    const day = textToDay(nextText);
    setText(nextText);
    setShownValue(day);
    onChange?.(day, { invalid: nextText !== "" && day === "" });
  }

  // Typing again hides the "half typed" error until the field is left again.
  function handleTyping(event) {
    const raw = event.target.value;
    setTouched(false);
    emit(formatDayTyping(raw, raw.length > text.length));
  }

  // The browser's picker gives "YYYY-MM-DD".
  function handlePicked(event) {
    setTouched(false);
    emit(dayToText(event.target.value));
  }

  function openPicker() {
    const picker = pickerRef.current;
    if (typeof picker.showPicker === "function") {
      try {
        picker.showPicker();
        return;
      } catch {
        // Some browsers refuse it here; fall through to the old way.
      }
    }
    picker.focus();
    picker.click();
  }

  return (
    <div className={className}>
      {label && (
        <label htmlFor={id} className="mb-1 block text-sm font-medium text-slate-700">
          {label}
          {required && <span className="ms-1 text-red-600">*</span>}
        </label>
      )}
      {/* LTR like the digits: the calendar button sits on the right, inside the field. */}
      <div dir="ltr" className="relative">
        <input
          {...rest}
          id={id}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          placeholder={PLACEHOLDER}
          maxLength={10}
          value={text}
          onChange={handleTyping}
          onBlur={() => setTouched(true)}
          readOnly={readOnly}
          disabled={disabled}
          aria-invalid={Boolean(shownError)}
          className={`w-full rounded-lg border py-2 ps-3 pe-10 text-sm outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20 ${
            shownError ? "border-red-600" : "border-slate-300"
          } ${locked ? "cursor-default bg-slate-100 text-slate-500" : "bg-white"}`}
        />
        {/* The browser's own picker, invisible under the calendar button (showPicker() opens it there). */}
        <input
          ref={pickerRef}
          type="date"
          tabIndex={-1}
          aria-hidden="true"
          value={textToDay(text)}
          onChange={handlePicked}
          className="pointer-events-none absolute inset-y-0 end-0 w-10 opacity-0"
        />
        <button
          type="button"
          onClick={openPicker}
          disabled={locked}
          title="فتح التقويم"
          aria-label="فتح التقويم"
          className="absolute inset-y-0 end-0 flex w-10 items-center justify-center rounded-e-lg text-slate-500 outline-none hover:text-primary focus-visible:ring-2 focus-visible:ring-primary/40 disabled:opacity-60"
        >
          <CalendarDays size={18} />
        </button>
      </div>
      {shownError && <p className="mt-1 text-xs text-red-600">{shownError}</p>}
    </div>
  );
}

export default DateInput;
