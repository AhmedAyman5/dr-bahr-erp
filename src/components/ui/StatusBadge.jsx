// Status of a Week 2 document (quotation / invoice / return): Arabic label + one fixed color.
// Usage:
//   <StatusBadge status={invoice.status} />          // "POSTED" → "مُرحّل" (green)
//   {quotation.isExpired && <StatusBadge expired />} // "منتهي" (amber): validUntil has passed
//
// Colors (soft background + border; never the solid sky / violet of مدين / دائن):
//   DRAFT gray · SENT / ACCEPTED blue · POSTED green · REJECTED / CANCELLED red · CONVERTED purple · منتهي amber
import { DOCUMENT_STATUSES, QUOTATION_STATUSES, getLabel } from "../../utils/labels";

const STATUS_COLORS = {
  DRAFT: "border-slate-200 bg-slate-100 text-slate-700",
  SENT: "border-blue-200 bg-primary-soft text-primary",
  ACCEPTED: "border-blue-200 bg-primary-soft text-primary",
  POSTED: "border-green-200 bg-green-50 text-green-700",
  REJECTED: "border-red-200 bg-red-50 text-red-700",
  CANCELLED: "border-red-200 bg-red-50 text-red-700",
  CONVERTED: "border-purple-200 bg-purple-50 text-purple-700",
};
const EXPIRED_COLOR = "border-amber-200 bg-amber-50 text-amber-700";
const UNKNOWN_COLOR = "border-slate-200 bg-slate-100 text-slate-700";

// DRAFT is in both lists with the same label, so one lookup covers every status.
const ALL_STATUSES = [...QUOTATION_STATUSES, ...DOCUMENT_STATUSES];

function StatusBadge({ status, expired = false }) {
  const label = expired ? "منتهي" : getLabel(ALL_STATUSES, status);
  const color = expired ? EXPIRED_COLOR : STATUS_COLORS[status] || UNKNOWN_COLOR;

  return (
    <span className={`inline-block whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-medium ${color}`}>
      {label}
    </span>
  );
}

export default StatusBadge;
