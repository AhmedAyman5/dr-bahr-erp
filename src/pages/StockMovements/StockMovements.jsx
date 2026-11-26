// Stock Movements (حركات المخزون) — every stock in / out of every product and warehouse, NEWEST first.
// Read only: movements come from documents and from أرصدة المخزون (opening balance, تسوية); they are never
// edited or deleted. Quantities are in the product's PRIMARY unit; quantity 0 = a cost-only change.
//
// The first page built on usePaginatedData + Pagination: the pattern for the Week 2 document lists.
// Starting filters can come from a link: /stock-movements?product=<id>&inventory=<id>. The URL is read once;
// the first filter change clears it, so the address bar never shows a filter that is no longer applied.
import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ClipboardList, X } from "lucide-react";
import PageHeader from "../../components/layout/PageHeader";
import Button from "../../components/ui/Button";
import DataTable from "../../components/ui/DataTable";
import EmptyState from "../../components/ui/EmptyState";
import ErrorState from "../../components/ui/ErrorState";
import DateInput from "../../components/ui/DateInput";
import LoadingState from "../../components/ui/LoadingState";
import MovementTypeBadge from "../../components/ui/MovementTypeBadge";
import Pagination from "../../components/ui/Pagination";
import Select from "../../components/ui/Select";
import StackedCell from "../../components/ui/StackedCell";
import useLoadData from "../../hooks/useLoadData";
import usePaginatedData from "../../hooks/usePaginatedData";
import { formatDate, formatMoney, formatQuantity, formatSourceCode, formatTime } from "../../utils/format";
import { MOVEMENT_TYPES, formatReason } from "../../utils/labels";
import { getBranches, getInventories, getProducts, getStockMovements } from "./stockMovementsApi";

const NO_FILTERS = { productId: "", warehouseId: "", type: "", dateFrom: "", dateTo: "" };
const DATE_RANGE_ERROR = "تاريخ البداية بعد تاريخ النهاية";

// Signed quantity: +120 green (in), -24 red (out), with "× unit cost = total cost" under it.
// 0 = only the cost changed: "تعديل تكلفة" with the new cost under it.
// Costs per piece have up to 4 decimals; totals are money (2 decimals).
function renderQuantity(movement) {
  const quantity = Number(movement.quantity);
  const unitCost = formatMoney(movement.unitCost, { maxDecimals: 4 });
  if (quantity === 0) {
    return (
      <StackedCell
        main={<span className="text-slate-500">تعديل تكلفة</span>}
        sub={
          <>
            التكلفة الجديدة: <span dir="ltr">{unitCost}</span>
          </>
        }
      />
    );
  }
  const color = quantity > 0 ? "text-green-700" : "text-red-700";
  return (
    <StackedCell
      main={
        <span dir="ltr" className={`font-semibold ${color}`}>
          {formatQuantity(movement.quantity, { signed: true })}
        </span>
      }
      sub={<span dir="ltr">{`× ${unitCost} = ${formatMoney(movement.totalCost)}`}</span>}
    />
  );
}

// Under the type badge: the document number (documents) and / or the reason (تسوية), when there is one.
// They describe the same thing (what caused the movement) and a movement has one or the other.
function renderType(movement) {
  const notes = [movement.sourceCode ? formatSourceCode(movement) : "", formatReason(movement.reason)];
  const sub = notes.filter((note) => note && note !== "-").join(" · ");
  return (
    <StackedCell
      main={<MovementTypeBadge type={movement.type} />}
      sub={sub && <span className="block max-w-28 whitespace-normal">{sub}</span>}
    />
  );
}

// 6 columns (+ the row action) that fit the screen: secondary info is stacked under the main value
// (StackedCell). Long names / reasons wrap instead of widening the table.
const COLUMNS = [
  {
    key: "movementDate",
    label: "التاريخ",
    // The day, then the time + the user under it.
    render: (row) => (
      <StackedCell
        main={<span className="whitespace-nowrap">{formatDate(row.movementDate)}</span>}
        sub={`${formatTime(row.movementDate)} · بواسطة ${row.createdByUser?.username ?? "-"}`}
      />
    ),
  },
  {
    key: "product",
    label: "الصنف",
    render: (row) => (
      <StackedCell
        main={<span className="block max-w-40 whitespace-normal">{row.product?.name ?? "-"}</span>}
        sub={row.product?.code}
      />
    ),
  },
  {
    key: "warehouse",
    label: "المخزن",
    render: (row) => <span className="block max-w-28 whitespace-normal">{row.warehouse?.name ?? "-"}</span>,
  },
  { key: "type", label: "نوع الحركة", render: renderType },
  { key: "quantity", label: "الكمية", render: renderQuantity },
  {
    key: "balanceAfter",
    // The numbers are short: the long header wraps on two lines instead of widening the column.
    label: <span className="inline-block max-w-20 whitespace-normal">الرصيد بعد الحركة</span>,
    render: (row) => <span dir="ltr">{formatQuantity(row.balanceAfter)}</span>,
  },
];

function productLabel(product) {
  return `${product.name} (${product.code})`;
}

// The lists of the filter Selects, loaded together.
async function loadFilterLists() {
  const [products, inventories, branches] = await Promise.all([getProducts(), getInventories(), getBranches()]);
  return { products, inventories, branches };
}

function StockMovements() {
  const [searchParams, setSearchParams] = useSearchParams();

  const { data: lists, loading: listsLoading, error: listsError, reload: reloadLists } = useLoadData(loadFilterLists);
  const products = lists?.products ?? [];
  const inventories = lists?.inventories ?? [];
  const branches = lists?.branches ?? [];

  // Starting filters: from the link when there is one (used only on the first render).
  const { items, meta, filters, loading, error, reload, setPage, setPageSize, setFilters } = usePaginatedData(
    getStockMovements,
    { ...NO_FILTERS, productId: searchParams.get("product") || "", warehouseId: searchParams.get("inventory") || "" },
  );

  // The date inputs keep what the user picked ("YYYY-MM-DD") + DateInput's invalid flags. Nothing is sent while
  // a date is half typed / impossible or the range ends before it starts (the filters keep the last valid range).
  const [dates, setDates] = useState({ dateFrom: filters.dateFrom, dateTo: filters.dateTo });
  const [invalidDates, setInvalidDates] = useState({ dateFrom: false, dateTo: false });
  // "مسح الفلاتر" also clears a half-typed date: a new key gives fresh DateInputs.
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

  // "<warehouse> — <branch>", like أرصدة المخزون.
  function inventoryLabel(inventory) {
    const branchName = branches.find((branch) => branch.id === inventory.branchId)?.name ?? "فرع محذوف";
    return `${inventory.name} — ${branchName}`;
  }

  // Only STOCK products have movements (SERVICE has no stock).
  const productOptions = products
    .filter((product) => product.itemType === "STOCK")
    .map((product) => ({ value: product.id, label: productLabel(product) }));
  const inventoryOptions = inventories.map((inventory) => ({ value: inventory.id, label: inventoryLabel(inventory) }));

  // A product / warehouse from a link that is not in the lists (deleted): keep it visible as the chosen filter,
  // with its name from the loaded movements when there are some.
  const productDeleted = Boolean(filters.productId) && !productOptions.some((o) => o.value === filters.productId);
  if (productDeleted) {
    const product = items.find((movement) => movement.productId === filters.productId)?.product;
    productOptions.push({ value: filters.productId, label: product ? `${productLabel(product)} (محذوف)` : "صنف محذوف" });
  }
  const inventoryDeleted =
    Boolean(filters.warehouseId) && !inventoryOptions.some((o) => o.value === filters.warehouseId);
  if (inventoryDeleted) {
    const warehouse = items.find((movement) => movement.warehouseId === filters.warehouseId)?.warehouse;
    inventoryOptions.push({ value: filters.warehouseId, label: warehouse ? `${warehouse.name} (محذوف)` : "مخزن محذوف" });
  }

  function renderClearButton() {
    return (
      <Button variant="secondary" onClick={clearFilters}>
        <X size={16} />
        مسح الفلاتر
      </Button>
    );
  }

  function renderFilters() {
    return (
      <div className="mb-4 rounded-lg border border-slate-200 bg-white p-4">
        <div className="grid grid-cols-1 items-start gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <Select
            label="الصنف"
            value={filters.productId}
            onChange={(event) => changeFilters({ productId: event.target.value })}
            options={productOptions}
            placeholder="كل الأصناف"
            selectClassName={productDeleted ? "text-slate-400" : ""}
          />
          <Select
            label="المخزن"
            value={filters.warehouseId}
            onChange={(event) => changeFilters({ warehouseId: event.target.value })}
            options={inventoryOptions}
            placeholder="كل المخازن"
            selectClassName={inventoryDeleted ? "text-slate-400" : ""}
          />
          <Select
            label="نوع الحركة"
            value={filters.type}
            onChange={(event) => changeFilters({ type: event.target.value })}
            options={MOVEMENT_TYPES}
            placeholder="كل الأنواع"
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

  function renderMovements() {
    if (loading) return <LoadingState message="جارٍ تحميل الحركات..." />;
    // A bad filter (400 VALIDATION_FAILED) lands here too, with its Arabic message; the filters stay above.
    if (error) return <ErrorState message={error} onRetry={reload} />;
    if (items.length === 0) {
      return filtersApplied ? (
        <EmptyState message="لا توجد حركات تطابق الفلاتر" action={renderClearButton()} />
      ) : (
        <EmptyState message="لا توجد حركات" />
      );
    }

    return (
      <>
        <DataTable
          columns={COLUMNS}
          rows={items}
          renderActions={(movement) => (
            <Button
              variant="ghost"
              className="px-2"
              to={`/item-card?product=${movement.productId}&inventory=${movement.warehouseId}`}
              title="كارت الصنف"
              aria-label={`كارت الصنف: ${movement.product?.name ?? ""}`}
            >
              <ClipboardList size={16} />
            </Button>
          )}
        />
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
        {renderMovements()}
      </>
    );
  }

  return (
    <div>
      <PageHeader
        title="حركات المخزون"
        subtitle="كل حركات الوارد والمنصرف في المخازن، الأحدث أولاً — الكميات بالوحدة الأساسية للصنف"
      />
      {renderContent()}
    </div>
  );
}

export default StockMovements;
