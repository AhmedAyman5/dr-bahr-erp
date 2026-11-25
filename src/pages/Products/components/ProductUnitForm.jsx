// The add / edit fields of one product unit ("1 كرتونة = 24 قطعة"), shown INSIDE ProductUnitsModal
// (form view). Only the fields: the form state, validation and saving live in ProductUnitsModal,
// because the modal needs them for its footer buttons and its unsaved-changes check.
import { Link } from "react-router-dom";
import Alert from "../../../components/ui/Alert";
import Input from "../../../components/ui/Input";
import Select from "../../../components/ui/Select";
import { formatMoney, formatNumber } from "../../../utils/format";

// Shared props of the 3 inputs typed left-to-right.
const LTR = { dir: "ltr" };

function ProductUnitForm({
  formId,
  form,
  fieldErrors,
  onChange,
  onSubmit,
  isEdit,
  unitOptions, // add mode: the units that can still be added
  unitName, // the chosen unit's name ("" while none is chosen)
  primaryName, // e.g. "قطعة"
  primaryRetailPrice, // the product's retail price (string from the API)
  factorValid, // true when the typed factor is a valid number > 0
}) {
  const factor = Number(form.factor);
  const productPrice = Number(primaryRetailPrice);
  const showPriceHint = factorValid && productPrice > 0;
  const noUnitsLeft = !isEdit && unitOptions.length === 0;

  return (
    <form id={formId} onSubmit={onSubmit} noValidate className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {isEdit ? (
        <div>
          <Input label="الوحدة" value={unitName} readOnly required error={fieldErrors.itemUnitId} />
          <p className="mt-1 text-xs text-slate-500">لتغيير الوحدة احذفها وأضف الوحدة الجديدة</p>
        </div>
      ) : noUnitsLeft ? (
        <Alert type="warning" className="sm:col-span-2">
          كل الوحدات مضافة لهذا الصنف. أضف وحدة جديدة من صفحة الوحدات أولاً.{" "}
          <Link to="/units" className="font-medium text-primary underline hover:text-primary-hover">
            صفحة الوحدات
          </Link>
        </Alert>
      ) : (
        <Select
          label="الوحدة"
          name="itemUnitId"
          value={form.itemUnitId}
          onChange={onChange}
          options={unitOptions}
          placeholder="اختر الوحدة"
          error={fieldErrors.itemUnitId}
          required
          autoFocus
        />
      )}

      <div>
        <Input
          label={`عدد ${primaryName} في الوحدة`}
          name="factor"
          inputMode="decimal"
          {...LTR}
          value={form.factor}
          onChange={onChange}
          error={fieldErrors.factor}
          required
          autoFocus={isEdit}
        />
        {/* Live preview (same look as BalancePreview): only for a valid factor. */}
        {factorValid && (
          <div className="mt-1 space-y-0.5 text-xs" aria-live="polite">
            <p className="font-medium text-slate-700">
              سيتم تسجيله: 1 {unitName || "وحدة"} = {formatNumber(factor)} {primaryName}
            </p>
            {factor === 1 && <p className="text-slate-500">الوحدة بنفس حجم الوحدة الأساسية، تأكد من العدد</p>}
          </div>
        )}
      </div>

      <Input label="باركود الوحدة" name="barcode" {...LTR} value={form.barcode} onChange={onChange} error={fieldErrors.barcode} />

      <div>
        <Input
          label="سعر بيع الوحدة"
          name="retailPrice"
          inputMode="decimal"
          {...LTR}
          value={form.retailPrice}
          onChange={onChange}
          error={fieldErrors.retailPrice}
        />
        {/* A hint only: the price is never filled in automatically. */}
        {showPriceHint && (
          <p className="mt-1 text-xs text-slate-500">
            للمقارنة: سعر الـ{primaryName} × العدد ={" "}
            <span dir="ltr">{formatMoney(productPrice * factor, { maxDecimals: 4 })}</span>
          </p>
        )}
      </div>
    </form>
  );
}

export default ProductUnitForm;
