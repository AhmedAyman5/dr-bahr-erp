// تاريخ الصلاحية + رقم التشغيلة of ONE invoice line, shown UNDER the product in the lines table
// (LinesTable's renderLineDetails: an extra column would not fit 1280×720).
// - A product with hasExpiryDate: the date (required *) and the batch input are always shown.
// - Another product: the batch input once "+ رقم التشغيلة" was clicked (InvoiceEditor's line links: STOCK products)
//   or when it is filled; a date that is already filled (e.g. the product changed) stays visible so nothing hidden
//   is sent.
// - Amber "منتهي الصلاحية" when the date is before the invoice date (a warning only: saving is allowed).
import DateInput from "../../../components/ui/DateInput";
import { BATCH_MAX, isExpiredOnInvoiceDate, showsBatchInput, showsExpiryInput } from "../invoiceForm";

function LineExpiryFields({ line, index, product, invoiceDate, errors = {}, update, disabled }) {
  const date = showsExpiryInput(line, product);
  const batch = showsBatchInput(line, product);
  if (!date && !batch) return null;
  const rowNumber = index + 1;

  return (
    <div className="mt-2 space-y-1">
      {date && (
        <div>
          <span className="mb-0.5 block text-xs font-medium text-slate-600">
            تاريخ الصلاحية
            {product?.hasExpiryDate && <span className="ms-0.5 text-red-600">*</span>}
          </span>
          <DateInput
            aria-label={`تاريخ الصلاحية — البند ${rowNumber}`}
            value={line.expiryDate}
            onChange={(value, { invalid }) => update({ expiryDate: value, expiryInvalid: invalid })}
            error={errors.expiryDate}
            disabled={disabled}
          />
          {isExpiredOnInvoiceDate(line.expiryDate, invoiceDate) && (
            <p className="mt-1 text-xs font-medium text-amber-700">منتهي الصلاحية</p>
          )}
        </div>
      )}
      {batch && (
        <div>
          <input
            aria-label={`رقم التشغيلة — البند ${rowNumber}`}
            placeholder="رقم التشغيلة"
            dir="ltr"
            autoComplete="off"
            maxLength={BATCH_MAX}
            value={line.batchNumber}
            onChange={(event) => update({ batchNumber: event.target.value })}
            disabled={disabled}
            aria-invalid={Boolean(errors.batchNumber)}
            className={`w-full rounded-lg border px-2 py-1 text-xs outline-none placeholder:text-end focus:border-primary focus:ring-2 focus:ring-primary/20 ${
              errors.batchNumber ? "border-red-600" : "border-slate-300"
            }`}
          />
          {errors.batchNumber && <p className="mt-1 text-xs text-red-600">{errors.batchNumber}</p>}
        </div>
      )}
    </div>
  );
}

export default LineExpiryFields;
