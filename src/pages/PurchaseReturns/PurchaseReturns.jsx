// Purchase returns (مرتجعات الشراء) — the list. Same pattern as the invoices list: paginated on the server
// (usePaginatedData) with filters; the form and the details are their own pages. Newest returnDate first.
// Posting a return takes its goods out of the warehouse (details page).
//
// Filters (the API has ONLY these, no search): supplier, status, date range (returnDate is a DATE-ONLY column:
// plain "YYYY-MM-DD", see utils/dates.js), and the invoice: /purchase-returns?invoice=<id> (from the invoice's
// details) filters by purchaseInvoiceId and shows a removable chip "فاتورة PI-…". The first filter change clears the
// query string; "مسح الفلاتر" drops the invoice filter too.
import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Eye, Pencil, Plus, X } from "lucide-react";
import PageHeader from "../../components/layout/PageHeader";
import Alert from "../../components/ui/Alert";
import Button from "../../components/ui/Button";
import DataTable from "../../components/ui/DataTable";
import DateInput from "../../components/ui/DateInput";
import EmptyState from "../../components/ui/EmptyState";
import ErrorState from "../../components/ui/ErrorState";
import LoadingState from "../../components/ui/LoadingState";
import Pagination from "../../components/ui/Pagination";
import SearchSelect from "../../components/ui/SearchSelect";
import Select from "../../components/ui/Select";
import StackedCell from "../../components/ui/StackedCell";
import StatusBadge from "../../components/ui/StatusBadge";
import useLoadData from "../../hooks/useLoadData";
import usePaginatedData from "../../hooks/usePaginatedData";
import useRouteMessage from "../../hooks/useRouteMessage";
import { formatDay, formatMoney } from "../../utils/format";
import { DOCUMENT_STATUSES, getLabel } from "../../utils/labels";
import { getPurchaseInvoice, getPurchaseReturns, getSuppliers } from "./purchaseReturnsApi";
import { EDITABLE_STATUSES } from "./returnForm";

const NO_FILTERS = { supplierId: "", purchaseInvoiceId: "", status: "", dateFrom: "", dateTo: "" };
const DATE_RANGE_ERROR = "تاريخ البداية بعد تاريخ النهاية";

// 6 columns + the row actions; secondary info stacked under the main value (StackedCell). Long texts wrap.
// الصافي: no currency code (returns store none; a linked one is in its invoice's currency — question for Mazen).
const COLUMNS = [
  {
    key: "code",
    label: "رقم المرتجع",
    render: (row) => (
      <StackedCell
        main={
          <Link to={`/purchase-returns/${row.id}`} dir="ltr" className="font-medium text-primary hover:underline">
            {row.code}
          </Link>
        }
        sub={`عدد البنود: ${row._count?.lines ?? 0}`}
      />
    ),
  },
  {
    key: "returnDate",
    label: "التاريخ",
    render: (row) => <span className="whitespace-nowrap">{formatDay(row.returnDate)}</span>,
  },
  {
    key: "supplier",
    label: "المورد",
    render: (row) => (
      <StackedCell
        main={<span className="block max-w-32 whitespace-normal">{row.supplier?.name ?? "-"}</span>}
        sub={
          row.purchaseInvoice ? (
            <Link
              to={`/purchase-invoices/${row.purchaseInvoice.id}`}
              dir="ltr"
              className="font-medium text-primary hover:underline"
            >
              {row.purchaseInvoice.code}
            </Link>
          ) : (
            "بدون فاتورة"
          )
        }
      />
    ),
  },
  {
    key: "branch",
    label: "الفرع",
    render: (row) => (
      <StackedCell
        main={<span className="block max-w-28 whitespace-normal">{row.branch?.name ?? "-"}</span>}
        sub={<span className="block max-w-28 whitespace-normal">{row.warehouse?.name ?? "-"}</span>}
      />
    ),
  },
  {
    key: "netTotal",
    label: "الصافي",
    render: (row) => (
      <StackedCell
        main={
          <span dir="ltr" className="whitespace-nowrap font-semibold">
            {formatMoney(row.netTotal)}
          </span>
        }
        sub={
          Number(row.refundAmount) > 0 ? (
            <>
              مسترد <span dir="ltr">{formatMoney(row.refundAmount)}</span>
            </>
          ) : null
        }
      />
    ),
  },
  { key: "status", label: "الحالة", render: (row) => <StatusBadge status={row.status} /> },
];

// The invoice of the ?invoice= filter (for the chip), or null when it was deleted / not found.
async function loadFilterInvoice(invoiceId) {
  if (!invoiceId) return null;
  try {
    return await getPurchaseInvoice(invoiceId);
  } catch (err) {
    if (err.response?.status === 404) return null;
    throw err;
  }
}

function PurchaseReturns() {
  const [successMessage, , hideSuccessMessage] = useRouteMessage();
  const [searchParams, setSearchParams] = useSearchParams();

  const { data: suppliersData, loading: listsLoading, error: listsError, reload: reloadLists } = useLoadData(getSuppliers);
  const suppliers = suppliersData ?? [];

  // Starting filters: the invoice from the link when there is one (used only on the first render).
  const { items, meta, filters, loading, error, refreshError, reload, setPage, setPageSize, setFilters } =
    usePaginatedData(getPurchaseReturns, { ...NO_FILTERS, purchaseInvoiceId: searchParams.get("invoice") || "" });

  // The chip's invoice code. A failed load just shows "فاتورة" (the filter itself still works).
  const { data: filterInvoice, loading: filterInvoiceLoading } = useLoadData(
    () => loadFilterInvoice(filters.purchaseInvoiceId),
    [filters.purchaseInvoiceId],
  );

  // Date range (like the invoices): kept here with DateInput's invalid flags, sent only when valid and من ≤ إلى.
  const [dates, setDates] = useState({ dateFrom: "", dateTo: "" });
  const [invalidDates, setInvalidDates] = useState({ dateFrom: false, dateTo: false });
  const [dateInputsKey, setDateInputsKey] = useState(0);
  const dateRangeError = dates.dateFrom && dates.dateTo && dates.dateFrom > dates.dateTo ? DATE_RANGE_ERROR : "";

  const filtersApplied = Object.values(filters).some(Boolean);
  const anyFilter =
    filtersApplied || Boolean(dates.dateFrom || dates.dateTo || invalidDates.dateFrom || invalidDates.dateTo);

  function changeFilters(changes) {
    setFilters(changes);
    if (searchParams.toString()) setSearchParams({}, { replace: true });
  }

  function changeDate(name, value, { invalid }) {
    const nextDates = { ...dates, [name]: value };
    const nextInvalid = { ...invalidDates, [name]: invalid };
    setDates(nextDates);
    setInvalidDates(nextInvalid);
    if (nextInvalid.dateFrom || nextInvalid.dateTo) return;
    if (nextDates.dateFrom && nextDates.dateTo && nextDates.dateFrom > nextDates.dateTo) return;
    changeFilters(nextDates);
  }

  function clearFilters() {
    setDates({ dateFrom: "", dateTo: "" });
    setInvalidDates({ dateFrom: false, dateTo: false });
    setDateInputsKey((key) => key + 1);
    changeFilters(NO_FILTERS);
  }

  const supplierOptions = suppliers.map((supplier) => ({
    value: supplier.id,
    label: supplier.name,
    sub: supplier.code,
    keywords: supplier.code,
  }));

  function renderNewButton() {
    return (
      <Button to="/purchase-returns/new">
        <Plus size={18} />
        مرتجع جديد
      </Button>
    );
  }

  function renderClearButton() {
    return (
      <Button variant="secondary" onClick={clearFilters}>
        <X size={16} />
        مسح الفلاتر
      </Button>
    );
  }

  function renderActions(row) {
    const canEdit = EDITABLE_STATUSES.includes(row.status);
    return (
      <>
        <Button variant="ghost" className="px-2" to={`/purchase-returns/${row.id}`} title="عرض" aria-label={`عرض ${row.code}`}>
          <Eye size={16} />
        </Button>
        {canEdit ? (
          <Button
            variant="ghost"
            className="px-2"
            to={`/purchase-returns/${row.id}/edit`}
            title="تعديل"
            aria-label={`تعديل ${row.code}`}
          >
            <Pencil size={16} />
          </Button>
        ) : (
          // A disabled button shows no tooltip in every browser: the title sits on a wrapper.
          <span title={`لا يمكن تعديل مرتجع حالته «${getLabel(DOCUMENT_STATUSES, row.status)}»`}>
            <Button variant="ghost" className="px-2" disabled aria-label={`تعديل ${row.code}`}>
              <Pencil size={16} />
            </Button>
          </span>
        )}
      </>
    );
  }

  // "فاتورة PI-2026-000032" + ✕ (removes only the invoice filter).
  function renderInvoiceChip() {
    if (!filters.purchaseInvoiceId) return null;
    let label = "فاتورة";
    if (!filterInvoiceLoading) label = filterInvoice ? `فاتورة ${filterInvoice.code}` : "فاتورة محذوفة";
    return (
      <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
        <span className="text-slate-500">مرتجعات الفاتورة:</span>
        <span className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-primary-soft py-0.5 ps-3 pe-1 text-primary">
          <bdi>{label}</bdi>
          <button
            type="button"
            onClick={() => changeFilters({ purchaseInvoiceId: "" })}
            title="إزالة فلتر الفاتورة"
            aria-label="إزالة فلتر الفاتورة"
            className="rounded-full p-0.5 outline-none hover:bg-blue-100 focus-visible:ring-2 focus-visible:ring-primary/40"
          >
            <X size={14} />
          </button>
        </span>
      </div>
    );
  }

  function renderFilters() {
    return (
      <div className="mb-4 rounded-lg border border-slate-200 bg-white p-4">
        {renderInvoiceChip()}
        <div className="grid grid-cols-1 items-start gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <SearchSelect
            label="المورد"
            value={filters.supplierId}
            onChange={(supplierId) => changeFilters({ supplierId })}
            options={supplierOptions}
            emptyLabel="كل الموردين"
            placeholder="كل الموردين"
          />
          <Select
            label="الحالة"
            value={filters.status}
            onChange={(event) => changeFilters({ status: event.target.value })}
            options={DOCUMENT_STATUSES}
            placeholder="كل الحالات"
          />
          <DateInput
            key={`from-${dateInputsKey}`}
            label="من تاريخ"
            value={dates.dateFrom}
            onChange={(value, flags) => changeDate("dateFrom", value, flags)}
            error={dateRangeError}
          />
          <DateInput
            key={`to-${dateInputsKey}`}
            label="إلى تاريخ"
            value={dates.dateTo}
            onChange={(value, flags) => changeDate("dateTo", value, flags)}
          />
        </div>
        {anyFilter && <div className="mt-4 flex justify-end">{renderClearButton()}</div>}
      </div>
    );
  }

  function renderReturns() {
    if (loading) return <LoadingState message="جارٍ تحميل مرتجعات الشراء..." />;
    // A bad filter (400) lands here too, with its Arabic message; the filters stay above.
    if (error) return <ErrorState message={error} onRetry={reload} />;
    if (items.length === 0) {
      return filtersApplied ? (
        <EmptyState message="لا توجد مرتجعات شراء تطابق الفلاتر" action={renderClearButton()} />
      ) : (
        <EmptyState message="لا توجد مرتجعات شراء بعد" action={renderNewButton()} />
      );
    }
    return (
      <>
        <DataTable columns={COLUMNS} rows={items} renderActions={renderActions} />
        <Pagination meta={meta} onPageChange={setPage} onPageSizeChange={setPageSize} />
      </>
    );
  }

  function renderContent() {
    if (listsLoading) return <LoadingState />;
    if (listsError) return <ErrorState message={listsError} onRetry={reloadLists} />;
    return (
      <>
        {renderFilters()}
        {renderReturns()}
      </>
    );
  }

  return (
    <div>
      <PageHeader
        title="مرتجعات الشراء"
        subtitle="البضاعة المرتجعة للموردين — الترحيل يُخرج الكميات من المخزن"
        action={renderNewButton()}
      />
      {successMessage && (
        <Alert type="success" className="mb-4" onClose={hideSuccessMessage}>
          {successMessage}
        </Alert>
      )}
      {refreshError && (
        <Alert type="error" className="mb-4">
          {refreshError}
        </Alert>
      )}
      {renderContent()}
    </div>
  );
}

export default PurchaseReturns;
