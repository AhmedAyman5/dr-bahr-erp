// The gray line under a product of a return line: what the warehouse has NOW.
//   STOCK:   "المتاح في المخزن: 196 قطعة · متوسط التكلفة 10.6818"
//            + amber "الكمية أكبر من المتاح في المخزن" when this return needs more pieces of the product than that
//            (all its lines added up). A warning only: the stock may change before posting (the post decides).
//   SERVICE: "خدمة — لا تخرج من المخزن".
// stock = the product's entry of returnForm.toStockMap ({ quantity, costPrice }) or undefined (not in the warehouse =
// 0). stockReady false (loading / failed / deleted warehouse) → nothing for STOCK products.
import { AlertTriangle } from "lucide-react";
import { formatMoney, formatQuantity } from "../../../utils/format";

function StockHint({ itemType, stock, stockReady, unitName, short }) {
  if (itemType === "SERVICE") return <p className="mt-1 text-xs text-slate-500">خدمة — لا تخرج من المخزن</p>;
  if (itemType !== "STOCK" || !stockReady) return null;
  return (
    <>
      <p className="mt-1 whitespace-normal text-xs text-slate-500">
        المتاح في المخزن: <span dir="ltr">{formatQuantity(stock?.quantity ?? 0)}</span> {unitName}
        {stock && (
          <>
            {" "}
            · متوسط التكلفة <span dir="ltr">{formatMoney(stock.costPrice, { maxDecimals: 4 })}</span>
          </>
        )}
      </p>
      {short && (
        <p role="status" className="mt-0.5 flex items-start gap-1 whitespace-normal text-xs font-medium text-amber-700">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          الكمية أكبر من المتاح في المخزن
        </p>
      )}
    </>
  );
}

export default StockHint;
