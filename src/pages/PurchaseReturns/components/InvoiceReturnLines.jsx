// The lines of a return LINKED to an invoice: one row per invoice line, the user types how much goes back.
// Presentational: ReturnEditor keeps the quantities (form.quantities) and passes the loaded invoice + returnable.
//
// Columns (fit 1366×768 and 1280×720 at font متوسط; secondary info stacked in the cells):
//   # · الصنف (name / code, the stock hint, "+ ملاحظة للبند") · الوحدة ("كرتونة" / "12 قطعة")
//   · الكميات ("متاح للإرجاع 8" / "اشتريت 10 · مرتجع سابقًا 2") · كمية المرتجع (input + "الكل", "= 24 قطعة" under it)
//   · سعر الوحدة (the invoice line's price after its line discount, read only) · الإجمالي (preview)
// - An empty quantity = this line is not returned. "الكل" fills what is left (remainingQuantity).
// - A line with nothing left is disabled: "تم إرجاعه بالكامل".
// - Quantities are in the LINE's unit (cartons); stock is in pieces (the gray "= 24 قطعة").
// - highlightLineId (a server error on that line): red row, scrolled into view.
import { useEffect, useRef } from "react";
import { formatMoney, formatNumber, formatQuantity } from "../../../utils/format";
import { LINE_NOTES_MAX } from "../../../utils/documentLines";
import DataTable from "../../../components/ui/DataTable";
import StackedCell from "../../../components/ui/StackedCell";
import { invoiceUnitCost } from "../returnForm";

const LINK_CLASSES =
  "rounded text-xs text-primary outline-none hover:underline focus-visible:ring-2 focus-visible:ring-primary/40";

function InvoiceReturnLines({
  invoice,
  returnable,
  quantities,
  onChange, // (invoiceLineId, changes) → merged into quantities[invoiceLineId]
  lineTotals, // { [invoiceLineId]: total | null } (the preview)
  errors = {}, // { [invoiceLineId]: { quantity?, notes? } }
  highlightLineId = null,
  primaryUnitName, // (productId) → "قطعة"
  renderStockHint, // (invoiceLine) → the StockHint under the product
  disabled = false,
}) {
  const containerRef = useRef(null);

  // A server error on a line: bring that row into view.
  useEffect(() => {
    if (!highlightLineId) return;
    const index = invoice.lines.findIndex((line) => line.id === highlightLineId);
    const row = containerRef.current?.querySelectorAll("tbody tr")[index];
    row?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [highlightLineId, invoice.lines]);

  const returnableById = new Map((returnable?.lines ?? []).map((line) => [line.lineId, line]));

  function rowOf(lineId) {
    return quantities[lineId] ?? { quantity: "", notes: "", notesOpen: false };
  }

  // "= 24 قطعة" under the quantity (only when the factor ≠ 1 and the quantity is a number above 0).
  function baseQuantityText(line) {
    const factor = Number(line.unitFactor);
    const text = String(rowOf(line.id).quantity).trim();
    const quantity = Number(text);
    if (factor === 1 || text === "" || !(quantity > 0)) return "";
    return `= ${formatQuantity(quantity * factor)} ${primaryUnitName(line.productId)}`;
  }

  const columns = [
    {
      key: "number",
      label: "#",
      render: (_, index) => <span className="block w-5 pt-2 text-slate-500">{index + 1}</span>,
    },
    {
      key: "product",
      label: "الصنف",
      render: (line, index) => {
        const row = rowOf(line.id);
        const error = errors[line.id]?.notes;
        return (
          <div className="w-44 pt-1">
            <span className="block whitespace-normal font-medium text-slate-900">{line.product?.name ?? "-"}</span>
            <span className="block text-xs text-slate-500">{line.product?.code}</span>
            {renderStockHint(line)}
            {row.notesOpen ? (
              <div className="mt-1">
                <input
                  aria-label={`ملاحظة البند ${index + 1}`}
                  placeholder="ملاحظة للبند"
                  maxLength={LINE_NOTES_MAX}
                  value={row.notes}
                  onChange={(event) => onChange(line.id, { notes: event.target.value })}
                  disabled={disabled}
                  className={`w-full rounded-lg border px-2 py-1 text-xs outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 ${
                    error ? "border-red-600" : "border-slate-300"
                  }`}
                />
                {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
              </div>
            ) : (
              <button
                type="button"
                onClick={() => onChange(line.id, { notesOpen: true })}
                disabled={disabled}
                className={`mt-1 ${LINK_CLASSES}`}
              >
                + ملاحظة للبند
              </button>
            )}
          </div>
        );
      },
    },
    {
      key: "unit",
      label: "الوحدة",
      render: (line) => (
        <div className="pt-1">
          <StackedCell
            main={line.itemUnit?.name ?? "-"}
            sub={
              Number(line.unitFactor) !== 1
                ? `${formatNumber(line.unitFactor)} ${primaryUnitName(line.productId)}`
                : null
            }
          />
        </div>
      ),
    },
    {
      key: "quantities",
      label: "الكميات",
      render: (line) => {
        const left = returnableById.get(line.id);
        const remaining = Number(left?.remainingQuantity ?? 0);
        const returned = Number(left?.returnedQuantity ?? 0);
        return (
          <div className="w-32 pt-1">
            <StackedCell
              main={
                remaining > 0 ? (
                  <span className="font-medium text-slate-900">
                    متاح للإرجاع <span dir="ltr">{formatQuantity(remaining)}</span>
                  </span>
                ) : (
                  <span className="font-medium text-slate-400">تم إرجاعه بالكامل</span>
                )
              }
              sub={
                <span className="block whitespace-normal">
                  اشتريت <span dir="ltr">{formatQuantity(line.quantity)}</span>
                  {returned > 0 && (
                    <>
                      {" "}
                      · مرتجع سابقًا <span dir="ltr">{formatQuantity(returned)}</span>
                    </>
                  )}
                </span>
              }
            />
          </div>
        );
      },
    },
    {
      key: "quantity",
      label: "كمية المرتجع",
      render: (line, index) => {
        const remaining = Number(returnableById.get(line.id)?.remainingQuantity ?? 0);
        const done = remaining <= 0;
        const error = errors[line.id]?.quantity;
        const base = baseQuantityText(line);
        return (
          <div className="w-32">
            <div className="flex items-center gap-1">
              <input
                aria-label={`كمية المرتجع — البند ${index + 1}`}
                inputMode="decimal"
                dir="ltr"
                autoComplete="off"
                value={rowOf(line.id).quantity}
                onChange={(event) => onChange(line.id, { quantity: event.target.value })}
                disabled={disabled || done}
                aria-invalid={Boolean(error)}
                className={`w-full min-w-0 rounded-lg border bg-white px-2 py-2 text-sm outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:bg-slate-50 ${
                  error ? "border-red-600" : "border-slate-300"
                }`}
              />
              <button
                type="button"
                onClick={() => onChange(line.id, { quantity: String(remaining) })}
                disabled={disabled || done}
                title="إرجاع كل المتاح"
                aria-label={`الكل — البند ${index + 1}`}
                className="shrink-0 rounded-lg border border-slate-300 px-2 py-2 text-xs font-medium text-slate-600 outline-none hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-primary/40 disabled:opacity-50"
              >
                الكل
              </button>
            </div>
            {base && <p className="mt-1 whitespace-normal text-xs text-slate-500">{base}</p>}
            {error && <p className="mt-1 whitespace-normal text-xs text-red-600">{error}</p>}
          </div>
        );
      },
    },
    {
      key: "unitCost",
      label: "سعر الوحدة",
      render: (line) => (
        <span dir="ltr" className="block pt-2 text-end">
          {formatMoney(invoiceUnitCost(line), { maxDecimals: 4 })}
        </span>
      ),
    },
    {
      key: "total",
      label: "الإجمالي",
      render: (line) => {
        const total = lineTotals[line.id];
        return (
          <span dir="ltr" className="block w-24 pt-2 text-end font-medium">
            {total === null || total === undefined ? "—" : formatMoney(total, { maxDecimals: 4 })}
          </span>
        );
      },
    },
  ];

  return (
    <div ref={containerRef}>
      <DataTable
        dense
        columns={columns}
        rows={invoice.lines}
        rowClassName={(line) => {
          const done = Number(returnableById.get(line.id)?.remainingQuantity ?? 0) <= 0;
          const marked = line.id === highlightLineId ? "bg-red-50" : done ? "bg-slate-50" : "";
          return `align-top ${marked}`;
        }}
      />
    </div>
  );
}

export default InvoiceReturnLines;
