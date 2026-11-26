// Item Card (كارت الصنف) — every movement of ONE product in ONE warehouse, OLDEST first (read it top to
// bottom like the paper card), with the balance after each one. Read only.
// The chosen product + warehouse live in the URL (?product=<id>&inventory=<id>): refresh and shared links keep them.
// A deleted product / warehouse from a link still loads (the backend keeps the history) and is marked "(محذوف)".
// An id that does not exist at all (404 NOT_FOUND) clears that Select with "الصنف غير موجود" / "المخزن غير موجود".
import { useSearchParams } from "react-router-dom";
import PageHeader from "../../components/layout/PageHeader";
import Alert from "../../components/ui/Alert";
import DataTable from "../../components/ui/DataTable";
import EmptyState from "../../components/ui/EmptyState";
import ErrorState from "../../components/ui/ErrorState";
import LoadingState from "../../components/ui/LoadingState";
import MovementTypeBadge from "../../components/ui/MovementTypeBadge";
import Select from "../../components/ui/Select";
import StackedCell from "../../components/ui/StackedCell";
import useLoadData from "../../hooks/useLoadData";
import { formatDate, formatMoney, formatQuantity, formatSourceCode, formatTime } from "../../utils/format";
import { formatReason } from "../../utils/labels";
import { getBranches, getInventories, getItemCard, getProducts } from "./itemCardApi";
import ItemCardSummary from "./components/ItemCardSummary";

const NOTHING_MISSING = { product: false, inventory: false };

function renderCost(value) {
  return <span dir="ltr">{formatMoney(value, { maxDecimals: 4 })}</span>;
}

// وارد = a + quantity, منصرف = a − quantity (shown without its sign). The other cell stays empty.
function renderIn(movement) {
  const quantity = Number(movement.quantity);
  return quantity > 0 ? <span dir="ltr" className="text-green-700">{formatQuantity(quantity)}</span> : "";
}

function renderOut(movement) {
  const quantity = Number(movement.quantity);
  return quantity < 0 ? <span dir="ltr" className="text-red-700">{formatQuantity(-quantity)}</span> : "";
}

// 7 columns that fit the screen: secondary info is stacked under the main value (StackedCell).
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
    key: "type",
    label: "نوع الحركة",
    // Under the badge: "تعديل تكلفة" for quantity 0 (only the cost changed) and the reason, when there is one.
    render: (row) => {
      const notes = [Number(row.quantity) === 0 ? "تعديل تكلفة" : "", row.reason ? formatReason(row.reason) : ""];
      const sub = notes.filter(Boolean).join(" · ");
      return (
        <StackedCell
          main={<MovementTypeBadge type={row.type} />}
          sub={sub && <span className="block max-w-40 whitespace-normal">{sub}</span>}
        />
      );
    },
  },
  { key: "sourceCode", label: "رقم المستند", render: (row) => formatSourceCode(row) },
  { key: "in", label: "وارد", render: renderIn },
  { key: "out", label: "منصرف", render: renderOut },
  {
    key: "balanceAfter",
    label: "الرصيد بعد الحركة",
    render: (row) => (
      <span dir="ltr" className="font-semibold">
        {formatQuantity(row.balanceAfter)}
      </span>
    ),
  },
  {
    key: "unitCost",
    label: "تكلفة القطعة",
    // The average cost AFTER this movement, under the cost of this movement.
    render: (row) => (
      <StackedCell
        main={renderCost(row.unitCost)}
        sub={
          <>
            المتوسط بعدها: {renderCost(row.avgCostAfter)}
          </>
        }
      />
    ),
  },
];

function productLabel(product) {
  return `${product.name} (${product.code})`;
}

// The lists of the two Selects, loaded together.
async function loadLists() {
  const [products, inventories, branches] = await Promise.all([getProducts(), getInventories(), getBranches()]);
  return { products, inventories, branches };
}

// The card, or { notFound: true } when an id from the URL does not exist at all (404 NOT_FOUND).
// That is not a page error: the page clears that choice instead (see findMissing).
async function loadItemCard(productId, warehouseId) {
  if (!productId || !warehouseId) return null;
  try {
    return { card: await getItemCard(productId, warehouseId) };
  } catch (err) {
    if (err.response?.data?.code === "NOT_FOUND") return { notFound: true };
    throw err;
  }
}

// Which choice does not exist? The 404 has field null, so it is worked out from the lists. The backend checks
// the product first: a product that is in the list means the warehouse is the wrong one, and the other way round.
// Neither in the lists (deleted or wrong) → both are cleared.
function findMissing(productId, warehouseId, products, inventories) {
  if (products.some((product) => product.id === productId)) return { product: false, inventory: true };
  if (inventories.some((inventory) => inventory.id === warehouseId)) return { product: true, inventory: false };
  return { product: true, inventory: true };
}

function ItemCard() {
  const [searchParams, setSearchParams] = useSearchParams();
  const productId = searchParams.get("product") || "";
  const warehouseId = searchParams.get("inventory") || "";

  const { data: lists, loading: listsLoading, error: listsError, reload: reloadLists } = useLoadData(loadLists);
  const products = lists?.products ?? [];
  const inventories = lists?.inventories ?? [];
  const branches = lists?.branches ?? [];

  // Loaded again whenever the URL names another product / warehouse.
  const {
    data: result,
    loading: cardLoading,
    error: cardError,
    reload: reloadCard,
  } = useLoadData(() => loadItemCard(productId, warehouseId), [productId, warehouseId]);
  // While a new card loads (or after an error) `result` still holds the previous answer: use it only when ready.
  const ready = !cardLoading && !cardError;
  const card = ready ? (result?.card ?? null) : null;
  const missing = ready && result?.notFound ? findMissing(productId, warehouseId, products, inventories) : NOTHING_MISSING;

  // A choice that does not exist is shown cleared: it also leaves the URL with the next change.
  function choose(key, value) {
    const next = {
      product: missing.product ? "" : productId,
      inventory: missing.inventory ? "" : warehouseId,
      [key]: value,
    };
    setSearchParams(Object.fromEntries(Object.entries(next).filter(([, id]) => id)));
  }

  // "<warehouse> — <branch>", like أرصدة المخزون.
  function inventoryLabel(inventory) {
    const branchName = branches.find((branch) => branch.id === inventory.branchId)?.name ?? "فرع محذوف";
    return `${inventory.name} — ${branchName}`;
  }

  // Only STOCK products have an item card (SERVICE has no stock).
  const productOptions = products
    .filter((product) => product.itemType === "STOCK")
    .map((product) => ({ value: product.id, label: productLabel(product) }));
  const inventoryOptions = inventories.map((inventory) => ({ value: inventory.id, label: inventoryLabel(inventory) }));

  // A product / warehouse from a link that is not in the lists (deleted): shown from the card, marked "(محذوف)".
  const productDeleted = Boolean(card) && !products.some((product) => product.id === card.product.id);
  const inventoryDeleted = Boolean(card) && !inventories.some((inventory) => inventory.id === card.warehouse.id);
  if (card && !productOptions.some((option) => option.value === card.product.id)) {
    const note = productDeleted ? " (محذوف)" : "";
    productOptions.push({ value: card.product.id, label: `${productLabel(card.product)}${note}` });
  }
  if (inventoryDeleted) {
    inventoryOptions.push({ value: card.warehouse.id, label: `${card.warehouse.name} (محذوف)` });
  }

  // Every quantity on the card is in the product's primary unit (unknown for a deleted product).
  const unitName = products.find((product) => product.id === productId)?.primaryItemUnit?.name ?? "";

  function renderTitle() {
    const unitText = unitName ? `بالـ${unitName}` : "بالوحدة الأساسية للصنف";
    return (
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-slate-900">
          {card.product.name} <span className="text-sm font-normal text-slate-500">({card.product.code})</span>
          {productDeleted && <span className="ms-1 text-sm font-normal text-slate-400">(محذوف)</span>}
          <span className="mx-2 text-slate-400">—</span>
          {card.warehouse.name}
          {inventoryDeleted && <span className="ms-1 text-sm font-normal text-slate-400">(محذوف)</span>}
        </h2>
        <p className="mt-1 text-sm text-slate-500">الكميات {unitText}، وكل حركة مسجلة ولا تُعدَّل أو تُحذف</p>
      </div>
    );
  }

  function renderCard() {
    if (!productId || !warehouseId || missing.product || missing.inventory) {
      return <EmptyState message="اختر صنفاً ومخزناً لعرض كارت الصنف" />;
    }
    if (cardLoading) return <LoadingState message="جارٍ تحميل كارت الصنف..." />;
    if (cardError) return <ErrorState message={cardError} onRetry={reloadCard} />;

    const movements = card.movements;
    // Guard (should never happen): the current quantity is the balance after the last movement (0 without any).
    const lastBalance = movements.length > 0 ? Number(movements[movements.length - 1].balanceAfter) : 0;
    const balanceMismatch = lastBalance !== Number(card.quantity);

    return (
      <>
        {renderTitle()}
        {balanceMismatch && (
          <Alert type="warning" className="mb-4">
            الرصيد لا يطابق آخر حركة، أبلغ الدعم الفني
          </Alert>
        )}
        <ItemCardSummary card={card} unitName={unitName} />
        {movements.length === 0 ? (
          <EmptyState message="لا توجد حركات لهذا الصنف في هذا المخزن" />
        ) : (
          <DataTable columns={COLUMNS} rows={movements} />
        )}
      </>
    );
  }

  function renderContent() {
    if (listsLoading) return <LoadingState />;
    if (listsError) return <ErrorState message={listsError} onRetry={reloadLists} />;

    return (
      <>
        <div className="mb-4 grid grid-cols-1 items-start gap-4 sm:grid-cols-2 lg:max-w-3xl">
          <Select
            label="الصنف"
            value={missing.product ? "" : productId}
            onChange={(event) => choose("product", event.target.value)}
            options={productOptions}
            placeholder="اختر الصنف"
            error={missing.product ? "الصنف غير موجود" : ""}
            selectClassName={productDeleted ? "text-slate-400" : ""}
          />
          <Select
            label="المخزن"
            value={missing.inventory ? "" : warehouseId}
            onChange={(event) => choose("inventory", event.target.value)}
            options={inventoryOptions}
            placeholder="اختر المخزن"
            error={missing.inventory ? "المخزن غير موجود" : ""}
            selectClassName={inventoryDeleted ? "text-slate-400" : ""}
          />
        </div>
        {renderCard()}
      </>
    );
  }

  return (
    <div>
      <PageHeader title="كارت الصنف" subtitle="كل حركات صنف واحد في مخزن واحد، من الأقدم للأحدث، مع الرصيد بعد كل حركة" />
      {renderContent()}
    </div>
  );
}

export default ItemCard;
