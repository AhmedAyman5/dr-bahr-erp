// Page controls under a paginated table (Week 2 lists: data.items + data.meta).
// Usage (with hooks/usePaginatedData):
//   const { items, meta, setPage, setPageSize } = usePaginatedData(getPurchaseInvoices);
//   <Pagination meta={meta} onPageChange={setPage} onPageSizeChange={setPageSize} />
//
// meta = { page, pageSize, total, totalPages } from the API.
// Shows "إجمالي: N", the page size (20 / 50 / 100), "صفحة X من Y" and السابق / التالي.
// RTL: السابق is on the right with an arrow pointing right, التالي on the left pointing left.
import { ChevronLeft, ChevronRight } from "lucide-react";
import Button from "./Button";
import Select from "./Select";
import { formatNumber } from "../../utils/format";

// The API allows 1 to 100 per page (default 20).
const PAGE_SIZE_OPTIONS = [20, 50, 100].map((size) => ({ value: String(size), label: String(size) }));

function Pagination({ meta, onPageChange, onPageSizeChange }) {
  const page = meta.page;
  // No records → totalPages is 0; still show "صفحة 1 من 1".
  const totalPages = Math.max(meta.totalPages, 1);

  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-slate-600">
      <div className="flex items-center gap-4">
        <span>إجمالي: {formatNumber(meta.total)}</span>
        <div className="flex items-center gap-2">
          <span>عدد الصفوف:</span>
          <Select
            aria-label="عدد الصفوف في الصفحة"
            value={String(meta.pageSize)}
            onChange={(event) => onPageSizeChange(Number(event.target.value))}
            options={PAGE_SIZE_OPTIONS}
            className="w-20"
          />
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Button variant="secondary" className="px-3" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
          <ChevronRight size={16} />
          السابق
        </Button>
        <span className="px-2">
          صفحة {formatNumber(page)} من {formatNumber(totalPages)}
        </span>
        <Button
          variant="secondary"
          className="px-3"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
        >
          التالي
          <ChevronLeft size={16} />
        </Button>
      </div>
    </div>
  );
}

export default Pagination;
