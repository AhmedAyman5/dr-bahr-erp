// Purchase quotations (عروض أسعار الشراء) — the list. The reference DOCUMENT list page:
// paginated on the server (usePaginatedData) with filters; the form and the details are their own pages.
// A quotation never touches stock or money. Newest quotationDate first.
//
// Filters: search (code / supplier name / notes, waits 400 ms after typing), supplier, branch, status, date range
// (quotationDate is a DATE-ONLY column: plain "YYYY-MM-DD", see utils/dates.js). A success message from another
// view (e.g. after a delete) arrives through the router state (hooks/useRouteMessage).
import { useState } from "react";
import { Link } from "react-router-dom";
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
import SearchInput from "../../components/ui/SearchInput";
import SearchSelect from "../../components/ui/SearchSelect";
import Select from "../../components/ui/Select";
import StackedCell from "../../components/ui/StackedCell";
import StatusBadge from "../../components/ui/StatusBadge";
import useDebouncedCallback from "../../hooks/useDebouncedCallback";
import useLoadData from "../../hooks/useLoadData";
import usePaginatedData from "../../hooks/usePaginatedData";
import useRouteMessage from "../../hooks/useRouteMessage";
import { formatDay, formatMoney } from "../../utils/format";
import { QUOTATION_STATUSES, getLabel } from "../../utils/labels";
import { getBranches, getPurchaseQuotations, getSuppliers } from "./purchaseQuotationsApi";
import { EDITABLE_STATUSES, showsExpired } from "./quotationForm";

const NO_FILTERS = { search: "", supplierId: "", branchId: "", status: "", dateFrom: "", dateTo: "" };
const DATE_RANGE_ERROR = "تاريخ البداية بعد تاريخ النهاية";

// 6 columns + the row actions; secondary info stacked under the main value (StackedCell).
const COLUMNS = [
  {
    key: "code",
    label: "رقم العرض",
    render: (row) => (
      <StackedCell
        main={
          <Link to={`/purchase-quotations/${row.id}`} dir="ltr" className="font-medium text-primary hover:underline">
            {row.code}
          </Link>
        }
        sub={`عدد البنود: ${row._count?.lines ?? 0}`}
      />
    ),
  },
  {
    key: "quotationDate",
    label: "التاريخ",
    render: (row) => (
      <StackedCell
        main={<span className="whitespace-nowrap">{formatDay(row.quotationDate)}</span>}
        // Wraps on two lines instead of widening the column ("صالح حتى" / "26 ديسمبر 2026").
        sub={
          row.validUntil ? (
            <span className="block max-w-24 whitespace-normal">صالح حتى {formatDay(row.validUntil)}</span>
          ) : null
        }
      />
    ),
  },
  {
    key: "supplier",
    label: "المورد",
    render: (row) => (
      <StackedCell
        main={<span className="block max-w-36 whitespace-normal">{row.supplier?.name ?? "-"}</span>}
        sub={row.supplier?.code}
      />
    ),
  },
  {
    key: "branch",
    label: "الفرع",
    render: (row) => (
      <StackedCell
        main={<span className="block max-w-32 whitespace-normal">{row.branch?.name ?? "-"}</span>}
        sub={row.warehouse?.name ?? "بدون مخزن"}
      />
    ),
  },
  {
    key: "netTotal",
    label: "الصافي",
    render: (row) => (
      <span dir="ltr" className="font-semibold">
        {formatMoney(row.netTotal)}
      </span>
    ),
  },
  {
    key: "status",
    label: "الحالة",
    render: (row) => (
      <div className="flex flex-wrap items-center gap-1">
        <StatusBadge status={row.status} />
        {showsExpired(row) && <StatusBadge expired />}
      </div>
    ),
  },
];

// The lists of the supplier / branch filters, loaded together.
async function loadFilterLists() {
  const [suppliers, branches] = await Promise.all([getSuppliers(), getBranches()]);
  return { suppliers, branches };
}

function PurchaseQuotations() {
  const [successMessage, , hideSuccessMessage] = useRouteMessage();

  const { data: lists, loading: listsLoading, error: listsError, reload: reloadLists } = useLoadData(loadFilterLists);
  const suppliers = lists?.suppliers ?? [];
  const branches = lists?.branches ?? [];

  const { items, meta, filters, loading, error, refreshError, reload, setPage, setPageSize, setFilters } =
    usePaginatedData(getPurchaseQuotations, NO_FILTERS);

  // The search box shows what is typed at once; the filter follows 400 ms after the last key.
  const [searchText, setSearchText] = useState("");
  const applySearch = useDebouncedCallback((text) => setFilters({ search: text.trim() }), 400);

  // Date range (like حركات المخزون): kept here with DateInput's invalid flags, sent only when valid and من ≤ إلى.
  const [dates, setDates] = useState({ dateFrom: "", dateTo: "" });
  const [invalidDates, setInvalidDates] = useState({ dateFrom: false, dateTo: false });
  const [dateInputsKey, setDateInputsKey] = useState(0);
  const dateRangeError = dates.dateFrom && dates.dateTo && dates.dateFrom > dates.dateTo ? DATE_RANGE_ERROR : "";

  const filtersApplied = Object.values(filters).some(Boolean);
  const anyFilter =
    filtersApplied ||
    searchText.trim() !== "" ||
    Boolean(dates.dateFrom || dates.dateTo || invalidDates.dateFrom || invalidDates.dateTo);

  function changeSearch(text) {
    setSearchText(text);
    applySearch(text);
  }

  function changeDate(name, value, { invalid }) {
    const nextDates = { ...dates, [name]: value };
    const nextInvalid = { ...invalidDates, [name]: invalid };
    setDates(nextDates);
    setInvalidDates(nextInvalid);
    if (nextInvalid.dateFrom || nextInvalid.dateTo) return;
    if (nextDates.dateFrom && nextDates.dateTo && nextDates.dateFrom > nextDates.dateTo) return;
    setFilters(nextDates);
  }

  function clearFilters() {
    applySearch.cancel();
    setSearchText("");
    setDates({ dateFrom: "", dateTo: "" });
    setInvalidDates({ dateFrom: false, dateTo: false });
    setDateInputsKey((key) => key + 1);
    setFilters(NO_FILTERS);
  }

  const supplierOptions = suppliers.map((supplier) => ({
    value: supplier.id,
    label: supplier.name,
    sub: supplier.code,
    keywords: supplier.code,
  }));
  const branchOptions = branches.map((branch) => ({ value: branch.id, label: branch.name }));

  function renderNewButton() {
    return (
      <Button to="/purchase-quotations/new">
        <Plus size={18} />
        عرض سعر جديد
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
        <Button
          variant="ghost"
          className="px-2"
          to={`/purchase-quotations/${row.id}`}
          title="عرض"
          aria-label={`عرض ${row.code}`}
        >
          <Eye size={16} />
        </Button>
        {canEdit ? (
          <Button
            variant="ghost"
            className="px-2"
            to={`/purchase-quotations/${row.id}/edit`}
            title="تعديل"
            aria-label={`تعديل ${row.code}`}
          >
            <Pencil size={16} />
          </Button>
        ) : (
          // A disabled button shows no tooltip in every browser: the title sits on a wrapper.
          <span title={`لا يمكن تعديل عرض حالته «${getLabel(QUOTATION_STATUSES, row.status)}»`}>
            <Button variant="ghost" className="px-2" disabled aria-label={`تعديل ${row.code}`}>
              <Pencil size={16} />
            </Button>
          </span>
        )}
      </>
    );
  }

  function renderFilters() {
    return (
      <div className="mb-4 rounded-lg border border-slate-200 bg-white p-4">
        <div className="grid grid-cols-1 items-start gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <span className="mb-1 block text-sm font-medium text-slate-700">بحث</span>
            <SearchInput
              value={searchText}
              onChange={changeSearch}
              placeholder="بحث برقم العرض أو اسم المورد أو الملاحظات"
            />
          </div>
          <SearchSelect
            label="المورد"
            value={filters.supplierId}
            onChange={(supplierId) => setFilters({ supplierId })}
            options={supplierOptions}
            emptyLabel="كل الموردين"
            placeholder="كل الموردين"
          />
          <Select
            label="الفرع"
            value={filters.branchId}
            onChange={(event) => setFilters({ branchId: event.target.value })}
            options={branchOptions}
            placeholder="كل الفروع"
          />
          <Select
            label="الحالة"
            value={filters.status}
            onChange={(event) => setFilters({ status: event.target.value })}
            options={QUOTATION_STATUSES}
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

  function renderQuotations() {
    if (loading) return <LoadingState message="جارٍ تحميل عروض الأسعار..." />;
    // A bad filter (400) lands here too, with its Arabic message; the filters stay above.
    if (error) return <ErrorState message={error} onRetry={reload} />;
    if (items.length === 0) {
      return filtersApplied ? (
        <EmptyState message="لا توجد عروض أسعار تطابق الفلاتر" action={renderClearButton()} />
      ) : (
        <EmptyState message="لا توجد عروض أسعار بعد" action={renderNewButton()} />
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
        {renderQuotations()}
      </>
    );
  }

  return (
    <div>
      <PageHeader
        title="عروض أسعار الشراء"
        subtitle="عروض الأسعار التي يرسلها الموردون — لا تؤثر على المخزون أو الحسابات"
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

export default PurchaseQuotations;
