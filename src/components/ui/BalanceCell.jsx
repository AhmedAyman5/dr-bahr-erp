// An opening balance in a table cell (customers, suppliers), all visible — no tooltip:
//   line 1: the amount WITHOUT its sign + a small "مدين" / "دائن" badge
//   line 2: the plain meaning in small gray text, e.g. "على العميل لنا"
// 0 → "0.00" with no badge. Each side has its own solid color so they are told apart at a glance:
// مدين = sky-600, دائن = violet-600, white bold text (reserved for debit / credit only). Never red / green: debit /
// credit is a direction, not good or bad.
//
// Usage (a DataTable column):
//   { key: "openingBalance", label: "الرصيد الافتتاحي",
//     render: (row) => <BalanceCell value={row.openingBalance} party="customer" /> }
import { formatMoney } from "../../utils/format";
import { getBalanceSide } from "../../utils/labels";

const BADGE_COLORS = {
  مدين: "bg-sky-600 text-white",
  دائن: "bg-violet-600 text-white",
};

function BalanceCell({ value, party }) {
  const side = getBalanceSide(value, party);

  return (
    <div>
      <div className="flex items-center gap-2">
        <span dir="ltr" className="text-sm font-semibold">
          {formatMoney(Math.abs(Number(value)))}
        </span>
        {side && (
          <span className={`rounded-full px-2.5 py-0.5 text-sm font-bold ${BADGE_COLORS[side.label]}`}>
            {side.label}
          </span>
        )}
      </div>
      {side && <p className="mt-0.5 text-xs text-slate-500">{side.meaning}</p>}
    </div>
  );
}

export default BalanceCell;
