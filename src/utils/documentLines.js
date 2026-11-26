// The editable LINES of a document form (quotations now; invoices / returns later): plain helpers for the
// line objects that components/documents/LinesTable edits. No React, no API calls.
//
// One line in the form (every number is the typed TEXT, like every money input):
//   {
//     key,                    // React key (never sent)
//     productId, itemUnitId,  // "" = not chosen
//     quantity, price,        // price = unitPrice (quotation) / unitCost (invoice): the API file names it
//     discountType,           // "percent" | "amount" (the small toggle of the row)
//     discount,               // "" = no line discount
//     notes, notesOpen,       // line notes (max 250) + is the notes input shown
//     savedProductName, savedProductCode, savedUnitName, // edit: names from the saved document (shown as "(محذوف)")
//   }
//
// Usage:
//   const [lines, setLines] = useState([newLine()]);
//   const { errors, filledCount, hasErrors } = validateLines(lines);
//   const sentIndexes = filledLineIndexes(lines); // server "lines.N" → form row sentIndexes[N]
import { validateMoney } from "./money";

export const LINE_NOTES_MAX = 250;
export const PERCENT_RANGE_ERROR = "النسبة يجب أن تكون بين 0 و 100";

// Quantities, prices and line discount amounts: Decimal(18,4). Percents: max 2 decimals.
const DECIMALS_4 = { maxDecimals: 4 };

let lastKey = 0;
function nextKey() {
  lastKey += 1;
  return `line-${lastKey}`;
}

// A new empty line.
export function newLine() {
  return {
    key: nextKey(),
    productId: "",
    itemUnitId: "",
    quantity: "",
    price: "",
    discountType: "percent",
    discount: "",
    notes: "",
    notesOpen: false,
    savedProductName: "",
    savedProductCode: "",
    savedUnitName: "",
  };
}

// A saved line from the API → a form line. price = the line's price field (quotation: line.unitPrice).
export function lineFromServer(line, price) {
  const hasPercent = line.discountPercent !== null && line.discountPercent !== undefined;
  const hasAmount = line.discountValue !== null && line.discountValue !== undefined;
  return {
    ...newLine(),
    productId: line.productId,
    itemUnitId: line.itemUnitId,
    quantity: String(line.quantity),
    price: String(price),
    discountType: !hasPercent && hasAmount ? "amount" : "percent",
    discount: hasPercent ? String(line.discountPercent) : hasAmount ? String(line.discountValue) : "",
    notes: line.notes ?? "",
    notesOpen: Boolean(line.notes),
    savedProductName: line.product?.name ?? "",
    savedProductCode: line.product?.code ?? "",
    savedUnitName: line.itemUnit?.name ?? "",
  };
}

function isBlank(text) {
  return String(text ?? "").trim() === "";
}

// A completely empty row: ignored on save (not validated, not sent).
export function isEmptyLine(line) {
  return (
    !line.productId &&
    !line.itemUnitId &&
    isBlank(line.quantity) &&
    isBlank(line.price) &&
    isBlank(line.discount) &&
    isBlank(line.notes)
  );
}

// The form indexes of the rows that are sent (empty rows dropped), in order.
// The server's "lines.N" is the N-th SENT line → form row filledLineIndexes(lines)[N].
export function filledLineIndexes(lines) {
  return lines.flatMap((line, index) => (isEmptyLine(line) ? [] : [index]));
}

// A percent (discount %, tax %): empty = 0, else 0 to 100 with at most 2 decimals. "" when valid.
export function validatePercent(text) {
  if (isBlank(text)) return "";
  const error = validateMoney(text, { maxDecimals: 2 });
  if (error) return error;
  const value = Number(text);
  return value < 0 || value > 100 ? PERCENT_RANGE_ERROR : "";
}

// The errors of one (non-empty) line: { productId?, itemUnitId?, quantity?, price?, discount?, notes? }.
function validateLine(line) {
  const errors = {};
  if (!line.productId) errors.productId = "اختر الصنف";
  if (!line.itemUnitId) errors.itemUnitId = "اختر الوحدة";

  if (isBlank(line.quantity)) {
    errors.quantity = "الكمية مطلوبة";
  } else {
    const error = validateMoney(line.quantity, DECIMALS_4);
    if (error) errors.quantity = error;
    else if (Number(line.quantity) <= 0) errors.quantity = "الكمية يجب أن تكون أكبر من صفر";
  }

  if (isBlank(line.price)) {
    errors.price = "السعر مطلوب";
  } else {
    const error = validateMoney(line.price, { min: 0, ...DECIMALS_4 });
    if (error) errors.price = error;
  }

  if (!isBlank(line.discount)) {
    if (line.discountType === "percent") {
      const error = validatePercent(line.discount);
      if (error) errors.discount = error;
    } else {
      const error = validateMoney(line.discount, { min: 0, ...DECIMALS_4 });
      if (error) errors.discount = error;
      // The amount can't be bigger than quantity × price (only checked when both are valid).
      else if (!errors.quantity && !errors.price && Number(line.discount) > Number(line.quantity) * Number(line.price)) {
        errors.discount = "الخصم أكبر من قيمة البند";
      }
    }
  }

  if (String(line.notes ?? "").trim().length > LINE_NOTES_MAX) {
    errors.notes = `الحد الأقصى ${LINE_NOTES_MAX} حرفًا`;
  }
  return errors;
}

// Validates every non-empty line.
// → { errors: [ {...} per row ({} for a valid or empty row) ], filledCount, hasErrors }
// filledCount === 0 → the page shows "يجب إضافة بند واحد على الأقل".
export function validateLines(lines) {
  const errors = lines.map((line) => (isEmptyLine(line) ? {} : validateLine(line)));
  return {
    errors,
    filledCount: lines.filter((line) => !isEmptyLine(line)).length,
    hasErrors: errors.some((lineErrors) => Object.keys(lineErrors).length > 0),
  };
}
