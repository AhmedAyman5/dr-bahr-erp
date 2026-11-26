// The numbers on top of the item card (كارت الصنف).
// الرصيد الحالي and متوسط التكلفة come from the server. قيمة المخزون (quantity × average cost) and the
// in / out totals (sums of the + / − movements) are worked out here for DISPLAY only: never sent anywhere.
// unitName: the product's primary unit ("قطعة"), "" when unknown (deleted product).
import { formatMoney, formatQuantity } from "../../../utils/format";

function SummaryCard({ label, value, unit }) {
  return (
    <div role="group" aria-label={label} className="rounded-lg border border-slate-200 bg-white p-4">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-1 text-xl font-bold text-slate-900">
        <span dir="ltr">{value}</span>
        {unit && <span className="text-sm font-medium text-slate-500"> {unit}</span>}
      </p>
    </div>
  );
}

function ItemCardSummary({ card, unitName }) {
  const quantities = card.movements.map((movement) => Number(movement.quantity));
  const totalIn = quantities.filter((quantity) => quantity > 0).reduce((sum, quantity) => sum + quantity, 0);
  const totalOut = quantities.filter((quantity) => quantity < 0).reduce((sum, quantity) => sum - quantity, 0);
  const stockValue = Number(card.quantity) * Number(card.avgCost);

  return (
    <div className="mb-4 grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
      <SummaryCard label="الرصيد الحالي" value={formatQuantity(card.quantity)} unit={unitName} />
      <SummaryCard label="متوسط التكلفة" value={formatMoney(card.avgCost, { maxDecimals: 4 })} />
      <SummaryCard label="قيمة المخزون" value={formatMoney(stockValue)} />
      <SummaryCard label="إجمالي الوارد" value={formatQuantity(totalIn)} unit={unitName} />
      <SummaryCard label="إجمالي المنصرف" value={formatQuantity(totalOut)} unit={unitName} />
    </div>
  );
}

export default ItemCardSummary;
