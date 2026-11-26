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
//
// Tables should fit the screen (stack secondary info with StackedCell). When one still overflows, it scrolls
// sideways and a soft fade shows on the side that has hidden columns (RTL: the hidden columns start on the
// left). The fades follow scrolling and resizing; none when the table fits.
import { useEffect, useRef, useState } from "react";

// Fade overlays: darkest at the table's edge, fading inwards. start = right in RTL, end = left in RTL.
const FADE_CLASSES = "pointer-events-none absolute inset-y-0 w-8 from-slate-900/15 to-transparent";
const START_FADE = `${FADE_CLASSES} start-0 rounded-s-lg rtl:bg-linear-to-l ltr:bg-linear-to-r`;
const END_FADE = `${FADE_CLASSES} end-0 rounded-e-lg rtl:bg-linear-to-r ltr:bg-linear-to-l`;

function DataTable({ columns, rows, renderActions, rowKey = "id" }) {
  const scrollRef = useRef(null);
  // Which sides have hidden columns right now.
  const [hidden, setHidden] = useState({ start: false, end: false });

  useEffect(() => {
    const box = scrollRef.current;

    function update() {
      const maxScroll = box.scrollWidth - box.clientWidth;
      // RTL: scrollLeft is 0 at the start and goes negative towards the end (LTR: positive). abs() covers both.
      const scrolled = Math.abs(box.scrollLeft);
      const start = scrolled > 1;
      const end = maxScroll - scrolled > 1;
      // Same values → keep the old object, so React does not render again.
      setHidden((old) => (old.start === start && old.end === end ? old : { start, end }));
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

  return (
    <div className="relative rounded-lg border border-slate-200 bg-white">
      <div ref={scrollRef} className="overflow-x-auto rounded-lg">
        <table className="w-full min-w-max text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              {columns.map((column) => (
                <th key={column.key} className="px-4 py-3 text-start font-semibold">
                  {column.label}
                </th>
              ))}
              {renderActions && <th className="px-4 py-3 text-start font-semibold">الإجراءات</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {rows.map((row) => (
              <tr key={row[rowKey]} className="hover:bg-slate-50">
                {columns.map((column) => (
                  <td key={column.key} className="px-4 py-3 text-slate-900">
                    {column.render ? column.render(row) : (row[column.key] ?? "-")}
                  </td>
                ))}
                {renderActions && (
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">{renderActions(row)}</div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {hidden.start && <div aria-hidden="true" data-overflow-fade="start" className={START_FADE} />}
      {hidden.end && <div aria-hidden="true" data-overflow-fade="end" className={END_FADE} />}
    </div>
  );
}

export default DataTable;
