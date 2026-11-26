// Plain functions of the quotation form (PurchaseQuotationForm / components/QuotationEditor):
// starting values, the unsaved-changes check, the live totals preview and the client validation.
// No React, no API calls. The body sent to the API is built in purchaseQuotationsApi.js.
//
// The form object (every number is the typed text):
//   { quotationDate, validUntil, supplierId, branchId, warehouseId, notes,
//     discountType: "percent" | "amount", discount, tax, lines: [line objects, utils/documentLines.js] }
import { todayDay } from "../../utils/dates";
import { calcDocumentTotals, calcLineTotal } from "../../utils/documentTotals";
import {
  filledLineIndexes,
  lineFromServer,
  newLine,
  validateLines,
  validatePercent,
} from "../../utils/documentLines";
import { validateMoney } from "../../utils/money";

export const NOTES_MAX = 500;
// Quotations that can still be edited (week2flow §6.1).
export const EDITABLE_STATUSES = ["DRAFT", "SENT"];

// The "منتهي" badge (validUntil has passed): only while the quotation is still open (list + details).
export function showsExpired(quotation) {
  return Boolean(quotation.isExpired) && ["DRAFT", "SENT", "ACCEPTED"].includes(quotation.status);
}

// An API day ("2026-11-20T00:00:00.000Z") → "2026-11-20" (never through a Date: the day must not shift).
function toDay(value) {
  return value ? value.slice(0, 10) : "";
}

// Starting values. quotation = the saved quotation (edit) or null (new).
// New: today's date, the branch already chosen when there is only one, one empty line.
export function getInitialForm(quotation, branches) {
  if (!quotation) {
    return {
      quotationDate: todayDay(),
      validUntil: "",
      supplierId: "",
      branchId: branches.length === 1 ? branches[0].id : "",
      warehouseId: "",
      notes: "",
      discountType: "percent",
      discount: "0",
      tax: "0",
      lines: [newLine()],
    };
  }
  // The server stores the computed amount in discountValue: a percent above 0 means percent mode.
  const percent = Number(quotation.discountPercent);
  const amount = Number(quotation.discountValue);
  let discountType = "percent";
  let discount = "0";
  if (percent > 0) discount = String(quotation.discountPercent);
  else if (amount > 0) {
    discountType = "amount";
    discount = String(quotation.discountValue);
  }
  return {
    quotationDate: toDay(quotation.quotationDate),
    validUntil: toDay(quotation.validUntil),
    supplierId: quotation.supplierId,
    branchId: quotation.branchId,
    warehouseId: quotation.warehouseId ?? "",
    notes: quotation.notes ?? "",
    discountType,
    discount,
    tax: String(quotation.taxPercent ?? "0"),
    lines: quotation.lines.map((line) => lineFromServer(line, line.unitPrice)),
  };
}

// What counts for "unsaved changes": the header + the filled lines without the screen-only fields
// (an added empty row or an opened notes box alone is not a change).
function comparable(form) {
  const lines = filledLineIndexes(form.lines).map((index) => {
    const line = form.lines[index];
    return [line.productId, line.itemUnitId, line.quantity, line.price, line.discountType, line.discount, line.notes];
  });
  return JSON.stringify({ ...form, lines });
}

export function isFormDirty(form, initialForm) {
  return comparable(form) !== comparable(initialForm);
}

// The live preview: { subTotal, discountValue, taxValue, netTotal } (numbers) + the total of every row
// (null when it can't be computed). The server computes the real totals when saving.
export function getPreview(form) {
  const lineTotals = form.lines.map((line) => calcLineTotal(line));
  const totals = calcDocumentTotals(
    lineTotals.filter((total) => total !== null),
    { discountType: form.discountType, discount: form.discount, tax: form.tax },
  );
  return { ...totals, lineTotals };
}

// Client validation. invalidDates = DateInput's flags { quotationDate, validUntil } (half typed / impossible).
// → { errors (header fields), lineErrors (per row), linesError, ok }
export function validateForm(form, invalidDates) {
  const errors = {};
  if (!form.supplierId) errors.supplierId = "اختر المورد";

  if (invalidDates.quotationDate) errors.quotationDate = "تاريخ غير صحيح";
  else if (!form.quotationDate) errors.quotationDate = "تاريخ العرض مطلوب";

  if (invalidDates.validUntil) errors.validUntil = "تاريخ غير صحيح";
  else if (form.validUntil && form.quotationDate && form.validUntil < form.quotationDate) {
    errors.validUntil = "تاريخ الصلاحية لا يمكن أن يكون قبل تاريخ العرض";
  }

  if (!form.branchId) errors.branchId = "اختر الفرع";
  if (form.notes.trim().length > NOTES_MAX) errors.notes = `الحد الأقصى ${NOTES_MAX} حرف`;

  if (form.discountType === "percent") {
    const error = validatePercent(form.discount);
    if (error) errors.discount = error;
  } else {
    const error = validateMoney(form.discount, { min: 0 });
    if (error) errors.discount = error;
    else if (Number(form.discount || 0) > getPreview(form).subTotal) errors.discount = "قيمة الخصم أكبر من الإجمالي";
  }
  const taxError = validatePercent(form.tax);
  if (taxError) errors.tax = taxError;

  const lines = validateLines(form.lines);
  const linesError = lines.filledCount === 0 ? "يجب إضافة بند واحد على الأقل" : "";

  return {
    errors,
    lineErrors: lines.errors,
    linesError,
    ok: Object.keys(errors).length === 0 && !lines.hasErrors && !linesError,
  };
}
