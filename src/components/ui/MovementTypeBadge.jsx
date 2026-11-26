// Type of a stock movement (حركة مخزن): Arabic label + one fixed color.
// Usage:
//   <MovementTypeBadge type={movement.type} />   // "PURCHASE" → "شراء" (green)
//
// Colors (soft background + border, like StatusBadge):
//   stock IN  (رصيد افتتاحي، شراء، إلغاء مرتجع شراء)  → green
//   stock OUT (مرتجع شراء، إلغاء فاتورة شراء)         → red
//   تسوية ADJUSTMENT (can be + or −)                   → neutral gray
// The IN / OUT lists live in utils/labels.js next to MOVEMENT_TYPES.
import { MOVEMENT_TYPES, STOCK_IN_TYPES, STOCK_OUT_TYPES, getLabel } from "../../utils/labels";

const IN_COLOR = "border-green-200 bg-green-50 text-green-700";
const OUT_COLOR = "border-red-200 bg-red-50 text-red-700";
const NEUTRAL_COLOR = "border-slate-200 bg-slate-100 text-slate-700";

function MovementTypeBadge({ type }) {
  let color = NEUTRAL_COLOR;
  if (STOCK_IN_TYPES.includes(type)) color = IN_COLOR;
  if (STOCK_OUT_TYPES.includes(type)) color = OUT_COLOR;

  return (
    <span className={`inline-block whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-medium ${color}`}>
      {getLabel(MOVEMENT_TYPES, type)}
    </span>
  );
}

export default MovementTypeBadge;
