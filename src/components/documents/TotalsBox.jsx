// The totals of a document (الإجمالي · الخصم · الضريبة · الصافي), under the lines on the inline-end side.
//
// Details page (read only, the SERVER's values, API strings):
//   <TotalsBox subTotal={q.subTotal} discountValue={q.discountValue} discountPercent={q.discountPercent}
//              taxValue={q.taxValue} taxPercent={q.taxPercent} netTotal={q.netTotal} />
//
// Form (live preview from utils/documentTotals + the discount / tax inputs):
//   <TotalsBox {...previewTotals} editor={{
//     discountType, discount, tax, errors: { discount, tax }, disabled,
//     onDiscountTypeChange, onDiscountChange, onTaxChange,
//   }} />
//   editor.discountType: "percent" | "amount" (toggle "نسبة %" / "مبلغ"); the texts are the typed values.
//
// extraRows (later: invoices / returns): [{ key, label, value, strong? }] under الصافي, e.g. المدفوع / المتبقي.
// A value null / undefined shows "—" (e.g. a preview that can't be computed yet).
import { formatMoney } from "../../utils/format";

const INPUT_CLASSES =
  "w-24 rounded-lg border px-2 py-1 text-sm outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20";

function Money({ value, className = "" }) {
  const text = value === null || value === undefined ? "—" : formatMoney(value);
  return (
    <span dir="ltr" className={className}>
      {text}
    </span>
  );
}

// "10%" for a percent above 0, nothing otherwise.
function percentLabel(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? ` (${Number(number.toFixed(2))}%)` : "";
}

function Row({ label, children, strong = false }) {
  return (
    <div className={`flex items-start justify-between gap-4 py-1.5 ${strong ? "text-base font-bold text-slate-900" : "text-sm text-slate-700"}`}>
      <span>{label}</span>
      <span className="text-end">{children}</span>
    </div>
  );
}

// The small "نسبة %" / "مبلغ" toggle of the header discount.
function DiscountTypeToggle({ value, onChange, disabled }) {
  const options = [
    { value: "percent", label: "نسبة %" },
    { value: "amount", label: "مبلغ" },
  ];
  return (
    <div role="radiogroup" aria-label="نوع الخصم" className="inline-flex rounded-lg border border-slate-300 p-0.5">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          disabled={disabled}
          onClick={() => onChange(option.value)}
          className={`rounded-md px-2 py-0.5 text-xs font-medium outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${
            value === option.value ? "bg-primary text-white" : "text-slate-600 hover:bg-slate-100"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function TotalsBox({
  subTotal,
  discountValue,
  discountPercent,
  taxValue,
  taxPercent,
  netTotal,
  editor,
  extraRows = [],
}) {
  return (
    <div className="ms-auto w-full max-w-sm rounded-lg border border-slate-200 bg-white p-4" role="group" aria-label="الإجماليات">
      <Row label="الإجمالي">
        <Money value={subTotal} />
      </Row>

      {editor ? (
        <>
          <div className="border-t border-slate-100 py-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm text-slate-700">الخصم</span>
              <DiscountTypeToggle value={editor.discountType} onChange={editor.onDiscountTypeChange} disabled={editor.disabled} />
              <input
                aria-label={editor.discountType === "percent" ? "نسبة الخصم %" : "قيمة الخصم"}
                inputMode="decimal"
                dir="ltr"
                value={editor.discount}
                onChange={(event) => editor.onDiscountChange(event.target.value)}
                disabled={editor.disabled}
                aria-invalid={Boolean(editor.errors?.discount)}
                className={`${INPUT_CLASSES} ${editor.errors?.discount ? "border-red-600" : "border-slate-300"}`}
              />
            </div>
            {editor.errors?.discount && <p className="mt-1 text-xs text-red-600">{editor.errors.discount}</p>}
            <div className="mt-1 flex justify-between text-sm text-slate-500">
              <span>قيمة الخصم</span>
              <Money value={discountValue} />
            </div>
          </div>
          <div className="border-t border-slate-100 py-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm text-slate-700">الضريبة %</span>
              <input
                aria-label="نسبة الضريبة %"
                inputMode="decimal"
                dir="ltr"
                value={editor.tax}
                onChange={(event) => editor.onTaxChange(event.target.value)}
                disabled={editor.disabled}
                aria-invalid={Boolean(editor.errors?.tax)}
                className={`${INPUT_CLASSES} ${editor.errors?.tax ? "border-red-600" : "border-slate-300"}`}
              />
            </div>
            {editor.errors?.tax && <p className="mt-1 text-xs text-red-600">{editor.errors.tax}</p>}
            <div className="mt-1 flex justify-between text-sm text-slate-500">
              <span>قيمة الضريبة</span>
              <Money value={taxValue} />
            </div>
          </div>
        </>
      ) : (
        <>
          <Row label={`الخصم${percentLabel(discountPercent)}`}>
            <Money value={discountValue} />
          </Row>
          <Row label={`الضريبة${percentLabel(taxPercent)}`}>
            <Money value={taxValue} />
          </Row>
        </>
      )}

      <div className="mt-1 border-t border-slate-200 pt-1">
        <Row label="الصافي" strong>
          <Money value={netTotal} className="text-lg" />
        </Row>
        {extraRows.map((row) => (
          <Row key={row.key} label={row.label} strong={row.strong}>
            <Money value={row.value} />
          </Row>
        ))}
      </div>

      {editor && <p className="mt-2 text-xs text-slate-500">معاينة — يحسب النظام الإجماليات النهائية عند الحفظ</p>}
      <p className="mt-1 text-xs text-slate-400">المبالغ بالعملة الأساسية</p>
    </div>
  );
}

export default TotalsBox;
