// Purchase invoices (فواتير الشراء) — the list. Same pattern as the quotations list (the reference document list):
// paginated on the server (usePaginatedData) with filters; the form and the details are their own pages.
// Newest invoiceDate first. Posting an invoice adds its goods to the warehouse (details page).
//
// Filters: search (code / supplier's invoice number / supplier name / notes, waits 400 ms after typing), supplier,
// branch, warehouse, status, payment type, date range (invoiceDate is a DATE-ONLY column: plain "YYYY-MM-DD", see
// utils/dates.js). A success message from another view (e.g. after a delete) arrives through the router state.
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
import { DOCUMENT_STATUSES, PAYMENT_TYPES, getLabel } from "../../utils/labels";
import { getBranches, getInventories, getPurchaseInvoices, getSuppliers } from "./purchaseInvoicesApi";
import { EDITABLE_STATUSES } from "./invoiceForm";

const NO_FILTERS = {
  search: "",
  supplierId: "",
  branchId: "",
  warehouseId: "",
  status: "",
  paymentType: "",
  dateFrom: "",
  dateTo: "",
};
const DATE_RANGE_ERROR = "تاريخ البداية بعد تاريخ النهاية";

// Under the net total: "نقدي", or "آجل · المتبقي 1,039.00".
function paymentLine(invoice) {
  if (invoice.paymentType !== "CREDIT") return getLabel(PAYMENT_TYPES, invoice.paymentType);
  return (
    <>
      آجل · المتبقي <span dir="ltr">{formatMoney(invoice.remainingAmount)}</span>
    </>
  );
}

// 6 columns + the row actions; secondary info stacked under the main value (StackedCell). Long texts wrap
// (max-w-*) so the table fits 1280×720 with the demo data (e.g. "شركة القاهرة لمستحضرات التجميل").
const COLUMNS = [
  {
    key: "code",
    label: "رقم الفاتورة",
    render: (row) => (
      <StackedCell
        main={
          <Link to={`/purchase-invoices/${row.id}`} dir="ltr" className="font-medium text-primary hover:underline">
            {row.code}
          </Link>
        }
        sub={
          row.supplierInvoiceNumber ? (
            <span className="block max-w-28 whitespace-normal">
              فاتورة المورد: <bdi>{row.supplierInvoiceNumber}</bdi>
            </span>
          ) : null
        }
      />
    ),
  },
  {
    key: "invoiceDate",
    label: "التاريخ",
    render: (row) => (
      <StackedCell
        main={<span className="whitespace-nowrap">{formatDay(row.invoiceDate)}</span>}
        // Wraps on two lines instead of widening the column ("استحقاق" / "26 ديسمبر 2026").
        sub={row.dueDate ? <span className="block max-w-24 whitespace-normal">استحقاق {formatDay(row.dueDate)}</span> : null}
      />
    ),
  },
  {
    key: "supplier",
    label: "المورد",
    render: (row) => (
      <StackedCell
        main={<span className="block max-w-32 whitespace-normal">{row.supplier?.name ?? "-"}</span>}
        sub={row.supplier?.code}
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
            {formatMoney(row.netTotal)} {row.currency?.code}
          </span>
        }
        sub={<span className="block max-w-28 whitespace-normal">{paymentLine(row)}</span>}
      />
    ),
  },
  { key: "status", label: "الحالة", render: (row) => <StatusBadge status={row.status} /> },
];

// The lists of the supplier / branch / warehouse filters, loaded together.
async function loadFilterLists() {
  const [suppliers, branches, inventories] = await Promise.all([getSuppliers(), getBranches(), getInventories()]);
  return { suppliers, branches, inventories };
}

function PurchaseInvoices() {
  const [successMessage, , hideSuccessMessage] = useRouteMessage();

  const { data: lists, loading: listsLoading, error: listsError, reload: reloadLists } = useLoadData(loadFilterLists);
  const suppliers = lists?.suppliers ?? [];
  const branches = lists?.branches ?? [];
  const inventories = lists?.inventories ?? [];

  const { items, meta, filters, loading, error, refreshError, reload, setPage, setPageSize, setFilters } =
    usePaginatedData(getPurchaseInvoices, NO_FILTERS);

  // The search box shows what is typed at once; the filter follows 400 ms after the last key.
  const [searchText, setSearchText] = useState("");
  const applySearch = useDebouncedCallback((text) => setFilters({ search: text.trim() }), 400);

  // Date range (like the quotations): kept here with DateInput's invalid flags, sent only when valid and من ≤ إلى.
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
  // Every warehouse, with its branch: "مخزن — فرع".
  const branchNames = new Map(branches.map((branch) => [branch.id, branch.name]));
  const warehouseOptions = inventories.map((inventory) => ({
    value: inventory.id,
    label: branchNames.has(inventory.branchId)
      ? `${inventory.name} — ${branchNames.get(inventory.branchId)}`
      : inventory.name,
  }));

  function renderNewButton() {
    return (
      <Button to="/purchase-invoices/new">
        <Plus size={18} />
        فاتورة شراء جديدة
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
          to={`/purchase-invoices/${row.id}`}
          title="عرض"
          aria-label={`عرض ${row.code}`}
        >
          <Eye size={16} />
        </Button>
        {canEdit ? (
          <Button
            variant="ghost"
            className="px-2"
            to={`/purchase-invoices/${row.id}/edit`}
            title="تعديل"
            aria-label={`تعديل ${row.code}`}
          >
            <Pencil size={16} />
          </Button>
        ) : (
          // A disabled button shows no tooltip in every browser: the title sits on a wrapper.
          <span title={`لا يمكن تعديل فاتورة حالتها «${getLabel(DOCUMENT_STATUSES, row.status)}»`}>
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
          {/* Two columns wide: the long placeholder stays readable. */}
          <div className="sm:col-span-2">
            <span className="mb-1 block text-sm font-medium text-slate-700">بحث</span>
            <SearchInput
              value={searchText}
              onChange={changeSearch}
              placeholder="بحث برقم الفاتورة أو رقم فاتورة المورد أو اسم المورد أو الملاحظات"
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
            label="المخزن"
            value={filters.warehouseId}
            onChange={(event) => setFilters({ warehouseId: event.target.value })}
            options={warehouseOptions}
            placeholder="كل المخازن"
          />
          <Select
            label="الحالة"
            value={filters.status}
            onChange={(event) => setFilters({ status: event.target.value })}
            options={DOCUMENT_STATUSES}
            placeholder="كل الحالات"
          />
          <Select
            label="طريقة الدفع"
            value={filters.paymentType}
            onChange={(event) => setFilters({ paymentType: event.target.value })}
            options={PAYMENT_TYPES}
            placeholder="الكل"
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

  function renderInvoices() {
    if (loading) return <LoadingState message="جارٍ تحميل فواتير الشراء..." />;
    // A bad filter (400) lands here too, with its Arabic message; the filters stay above.
    if (error) return <ErrorState message={error} onRetry={reload} />;
    if (items.length === 0) {
      return filtersApplied ? (
        <EmptyState message="لا توجد فواتير شراء تطابق الفلاتر" action={renderClearButton()} />
      ) : (
        <EmptyState message="لا توجد فواتير شراء بعد" action={renderNewButton()} />
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
        {renderInvoices()}
      </>
    );
  }

  return (
    <div>
      <PageHeader
        title="فواتير الشراء"
        subtitle="البضاعة الواردة من الموردين — الترحيل يضيف الكميات إلى المخزن"
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

export default PurchaseInvoices;
