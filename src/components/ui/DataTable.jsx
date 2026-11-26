// Usage:
//   const columns = [
//     { key: "code", label: "الكود" },
//     { key: "name", label: "الاسم" },
//     { key: "createdAt", label: "تاريخ الإضافة", render: (row) => formatDate(row.createdAt) },
//   ];
//   <DataTable
//     columns={columns}
//     rows={branches}
//     renderActions={(row) => <Button variant="ghost" onClick={() => edit(row)}><Pencil size={16} /></Button>}
//   />
// Each row needs a unique "id" (or pass rowKey="otherField").
// column.render(row, index) and renderActions(row, index) also get the row's index (e.g. a "#" column).
//
// Optional (document lines, see components/documents/LinesTable): dense = smaller cell padding (inputs in cells);
// rowClassName(row, index) = extra classes for a row (e.g. "align-top", a red tint for a row with an error);
// actionsLabel = the header of the actions column (default "الإجراءات").
//
// Tables should fit the screen (stack secondary info with StackedCell). When one still overflows, it scrolls
// sideways and a soft fade shows on the side that has hidden columns (RTL: the hidden columns start on the
// left). The fades follow scrolling and resizing; none when the table fits.
//
// The actions column is STICKY on the inline-end side (left in RTL): when the table overflows, the row buttons
// stay visible and the other columns scroll under it. It then gets a thin line on its scrolling side, and the
// end fade sits just before it. When the table fits nothing changes (same background as the row).
import { useEffect, useRef, useState } from "react";

// Fade overlays: darkest at the table's edge, fading inwards. start = right in RTL, end = left in RTL.
const FADE_CLASSES = "pointer-events-none absolute inset-y-0 w-8 from-slate-900/15 to-transparent";
const START_FADE = `${FADE_CLASSES} start-0 rounded-s-lg rtl:bg-linear-to-l ltr:bg-linear-to-r`;
const END_FADE = `${FADE_CLASSES} rtl:bg-linear-to-r ltr:bg-linear-to-l`;

// Sticky actions cell. `before:` = the thin separating line on its scrolling side (shown only while the table
// overflows: a real border would scroll away with border-collapse).
const CELL_PADDING = "px-4 py-3";
const DENSE_PADDING = "px-2 py-2";
const STICKY_CELL = "sticky end-0";
const STICKY_LINE = "before:absolute before:inset-y-0 before:start-0 before:w-px before:bg-slate-200";

function DataTable({ columns, rows, renderActions, rowKey = "id", dense = false, rowClassName, actionsLabel = "الإجراءات" }) {
  const scrollRef = useRef(null);
  const actionsHeaderRef = useRef(null);
  // Which sides have hidden columns right now + the width of the sticky actions column (0 = none).
  const [hidden, setHidden] = useState({ start: false, end: false, actionsWidth: 0 });

  useEffect(() => {
    const box = scrollRef.current;

    function update() {
      const maxScroll = box.scrollWidth - box.clientWidth;
      // RTL: scrollLeft is 0 at the start and goes negative towards the end (LTR: positive). abs() covers both.
      const scrolled = Math.abs(box.scrollLeft);
      const start = scrolled > 1;
      const end = maxScroll - scrolled > 1;
      const actionsWidth = actionsHeaderRef.current?.offsetWidth ?? 0;
      // Same values → keep the old object, so React does not render again.
      setHidden((old) =>
        old.start === start && old.end === end && old.actionsWidth === actionsWidth ? old : { start, end, actionsWidth },
      );
    }

    box.addEventListener("scroll", update, { passive: true });
    // Fires once right away, then whenever the box (window resize) or the table (new rows) changes size.
    const observer = new ResizeObserver(update);
    observer.observe(box);
    observer.observe(box.firstElementChild);
    return () => {
      box.removeEventListener("scroll", update);
      observer.disconnect();
    };
  }, []);

  const overflows = hidden.start || hidden.end;
  const padding = dense ? DENSE_PADDING : CELL_PADDING;

  return (
    <div className="relative rounded-lg border border-slate-200 bg-white">
      <div ref={scrollRef} className="overflow-x-auto rounded-lg">
        <table className="w-full min-w-max text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              {columns.map((column) => (
                <th key={column.key} className={`${padding} text-start font-semibold`}>
                  {column.label}
                </th>
              ))}
              {renderActions && (
                <th
                  ref={actionsHeaderRef}
                  data-sticky-actions
                  className={`${STICKY_CELL} ${padding} bg-slate-50 text-start font-semibold ${overflows ? STICKY_LINE : ""}`}
                >
                  {actionsLabel}
                </th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {rows.map((row, index) => (
              <tr key={row[rowKey]} className={`group hover:bg-slate-50 ${rowClassName ? rowClassName(row, index) : ""}`}>
                {columns.map((column) => (
                  <td key={column.key} className={`${padding} text-slate-900`}>
                    {column.render ? column.render(row, index) : (row[column.key] ?? "-")}
                  </td>
                ))}
                {renderActions && (
                  <td
                    data-sticky-actions
                    className={`${STICKY_CELL} ${padding} bg-white group-hover:bg-slate-50 ${overflows ? STICKY_LINE : ""}`}
                  >
                    <div className="flex items-center gap-1">{renderActions(row, index)}</div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {hidden.start && <div aria-hidden="true" data-overflow-fade="start" className={START_FADE} />}
      {hidden.end && (
        <div
          aria-hidden="true"
          data-overflow-fade="end"
          // Just before the sticky actions column (or at the table's edge when there is none).
          className={`${END_FADE} ${hidden.actionsWidth ? "" : "rounded-e-lg"}`}
          style={{ insetInlineEnd: hidden.actionsWidth }}
        />
      )}
    </div>
  );
}

export default DataTable;
