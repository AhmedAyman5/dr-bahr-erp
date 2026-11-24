// Help under an opening balance input (customer / supplier forms):
// - a short gray hint: how to type the sign;
// - a LIVE preview of what will be saved, updated while typing, e.g.
//   "سيتم تسجيله: 250.50 دائن — للعميل علينا". Nothing while the value is empty, 0 or invalid.
//
// Usage (right after the opening balance <Input>, inside the same grid cell):
//   <BalancePreview value={form.openingBalance} party="customer" />
import { formatMoney } from "../../utils/format";
import { getBalanceSide } from "../../utils/labels";
import { validateMoney } from "../../utils/money";

const HINTS = {
  customer: "اكتب الرقم موجب لو العميل عليه فلوس، وسالب لو له فلوس عندنا",
  supplier: "اكتب الرقم موجب لو علينا فلوس للمورد، وسالب لو المورد عليه فلوس لنا",
};

function BalancePreview({ value, party }) {
  // Only a valid amount gets a preview (the field shows its own error otherwise).
  const side = validateMoney(value) === "" ? getBalanceSide(value, party) : null;

  return (
    <div className="mt-1 space-y-0.5 text-xs" aria-live="polite">
      <p className="text-slate-500">{HINTS[party]}</p>
      {side && (
        <p className="font-medium text-slate-700">
          سيتم تسجيله: <span dir="ltr">{formatMoney(Math.abs(Number(value)))}</span> {side.label} — {side.meaning}
        </p>
      )}
    </div>
  );
}

export default BalancePreview;
