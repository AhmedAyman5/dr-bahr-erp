// The header fields of the invoice form (card "بيانات الفاتورة"). Only the fields: the state, validation and
// saving live in InvoiceEditor.
// - طريقة الدفع: two radio cards (no default: the user must choose). تاريخ الاستحقاق only for آجل.
// - المخزن: the chosen branch's warehouses (a branch change clears it; a branch with ONE warehouse picks it).
// - العملة: the default one is marked "(الأساسية)"; another currency needs سعر الصرف ("1 دولار = [ ] جنيه").
// - رقم فاتورة المورد: an amber warning when the same supplier already has an invoice with this number.
// A saved supplier / branch / warehouse that is no longer active (deleted) stays visible as "<name> (محذوف)"
// in gray (names from the invoice); saving then explains it (DOES_NOT_EXIST).
import { useId } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle } from "lucide-react";
import DateInput from "../../../components/ui/DateInput";
import Input from "../../../components/ui/Input";
import SearchSelect from "../../../components/ui/SearchSelect";
import Select from "../../../components/ui/Select";
import Textarea from "../../../components/ui/Textarea";
import { PAYMENT_TYPES } from "../../../utils/labels";
import { NOTES_MAX, getBranchWarehouses, getDefaultCurrency } from "../invoiceForm";

const PAYMENT_HINTS = {
  CASH: "المدفوع = صافي الفاتورة",
  CREDIT: "يُدفع جزء أو لا شيء الآن، والباقي لاحقًا",
};

// options + the saved choice when it is not in them (deleted) → { options, missing }.
function withMissing(options, value, savedName) {
  if (!value || options.some((option) => option.value === value)) return { options, missing: false };
  return { options: [...options, { value, label: `${savedName || "محذوف"} (محذوف)` }], missing: true };
}

function currencyLabel(currency) {
  const label = `${currency.name} — ${currency.code}`;
  return currency.isDefault ? `${label} (الأساسية)` : label;
}

// The amber "this bill number is already used" line under رقم فاتورة المورد (a warning only).
function DuplicateBillWarning({ invoice }) {
  return (
    <p role="status" className="mt-1 flex items-start gap-1 text-xs text-amber-700">
      <AlertTriangle size={14} className="mt-0.5 shrink-0" />
      <span>
        هذا الرقم مسجل بالفعل في الفاتورة <span dir="ltr">{invoice.code}</span> لنفس المورد
      </span>
    </p>
  );
}

function PaymentTypeCards({ value, onChange, error, disabled }) {
  return (
    <fieldset className="lg:col-span-2">
      <legend className="mb-1 block text-sm font-medium text-slate-700">
        طريقة الدفع
        <span className="ms-1 text-red-600">*</span>
      </legend>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {PAYMENT_TYPES.map((type) => {
          const checked = value === type.value;
          return (
            <label
              key={type.value}
              className={`flex cursor-pointer items-start gap-2 rounded-lg border p-3 transition-colors ${
                checked ? "border-primary bg-primary-soft" : "border-slate-300 hover:bg-slate-50"
              }`}
            >
              <input
                type="radio"
                name="paymentType"
                value={type.value}
                checked={checked}
                onChange={() => onChange(type.value)}
                disabled={disabled}
                className="mt-1 accent-primary"
              />
              <span>
                <span className="block text-sm font-semibold text-slate-900">{type.label}</span>
                <span className="block text-xs text-slate-500">{PAYMENT_HINTS[type.value]}</span>
              </span>
            </label>
          );
        })}
      </div>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </fieldset>
  );
}

// سعر الصرف: "1 دولار أمريكي = [ 50.5 ] جنيه مصري".
function ExchangeRateField({ currency, defaultCurrency, value, onChange, error, disabled }) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-slate-700">
        سعر الصرف
        <span className="ms-1 text-red-600">*</span>
      </label>
      <div className="flex items-center gap-2 text-sm text-slate-700">
        <span className="whitespace-nowrap">1 {currency.name} =</span>
        <input
          id={id}
          inputMode="decimal"
          dir="ltr"
          autoComplete="off"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          disabled={disabled}
          aria-invalid={Boolean(error)}
          className={`w-28 rounded-lg border bg-white px-3 py-2 text-sm outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20 ${
            error ? "border-red-600" : "border-slate-300"
          }`}
        />
        <span>{defaultCurrency?.name ?? "العملة الأساسية"}</span>
      </div>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}

function InvoiceHeaderFields({
  form,
  errors,
  lists,
  invoice,
  disabled,
  duplicate,
  onChange,
  onDateChange,
  onSupplierChange,
  onBranchChange,
  onCurrencyChange,
  onBillNumberBlur,
}) {
  const supplierOptions = lists.suppliers.map((supplier) => ({
    value: supplier.id,
    label: supplier.name,
    sub: supplier.code,
    keywords: supplier.code,
  }));
  const branches = withMissing(
    lists.branches.map((branch) => ({ value: branch.id, label: branch.name })),
    form.branchId,
    invoice?.branch?.name,
  );
  const branchWarehouses = getBranchWarehouses(lists.inventories, form.branchId);
  const warehouses = withMissing(
    branchWarehouses.map((inventory) => ({ value: inventory.id, label: inventory.name })),
    form.warehouseId,
    invoice?.warehouse?.name,
  );
  const currencies = withMissing(
    lists.currencies.map((currency) => ({ value: currency.id, label: currencyLabel(currency) })),
    form.currencyId,
    invoice?.currency?.name,
  );
  const defaultCurrency = getDefaultCurrency(lists.currencies);
  const currency = lists.currencies.find((item) => item.id === form.currencyId) ?? invoice?.currency;
  const showRate = Boolean(form.currencyId) && form.currencyId !== defaultCurrency?.id;

  return (
    <section className="mb-4 rounded-lg border border-slate-200 bg-white p-4">
      <h2 className="mb-3 text-base font-semibold text-slate-900">بيانات الفاتورة</h2>
      <div className="grid grid-cols-1 items-start gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <SearchSelect
          label="المورد"
          required
          value={form.supplierId}
          onChange={onSupplierChange}
          options={supplierOptions}
          placeholder="ابحث بالاسم أو الكود"
          missingLabel={`${invoice?.supplier?.name ?? "مورد"} (محذوف)`}
          error={errors.supplierId}
          disabled={disabled}
        />
        <div>
          <Input
            label="رقم فاتورة المورد"
            dir="ltr"
            autoComplete="off"
            value={form.supplierInvoiceNumber}
            onChange={(event) => onChange({ supplierInvoiceNumber: event.target.value })}
            onBlur={onBillNumberBlur}
            error={errors.supplierInvoiceNumber}
            disabled={disabled}
          />
          {duplicate && <DuplicateBillWarning invoice={duplicate} />}
        </div>
        <DateInput
          label="تاريخ الفاتورة"
          required
          value={form.invoiceDate}
          onChange={(value, flags) => onDateChange("invoiceDate", value, flags)}
          error={errors.invoiceDate}
          disabled={disabled}
        />

        {/* One full row: the cards take two columns, the due date (آجل only) the third — nothing jumps. */}
        <div className="grid grid-cols-1 items-start gap-4 sm:col-span-2 lg:col-span-3 lg:grid-cols-3">
          <PaymentTypeCards
            value={form.paymentType}
            onChange={(paymentType) => onChange({ paymentType })}
            error={errors.paymentType}
            disabled={disabled}
          />
          {form.paymentType === "CREDIT" && (
            <DateInput
              label="تاريخ الاستحقاق"
              value={form.dueDate}
              onChange={(value, flags) => onDateChange("dueDate", value, flags)}
              error={errors.dueDate}
              disabled={disabled}
            />
          )}
        </div>

        <Select
          label="الفرع"
          required
          value={form.branchId}
          onChange={(event) => onBranchChange(event.target.value)}
          options={branches.options}
          placeholder="اختر الفرع"
          error={errors.branchId}
          readOnly={disabled}
          selectClassName={branches.missing ? "text-slate-400" : ""}
        />
        <div>
          <Select
            label="المخزن"
            required
            value={form.warehouseId}
            onChange={(event) => onChange({ warehouseId: event.target.value })}
            options={warehouses.options}
            placeholder="اختر المخزن"
            error={errors.warehouseId}
            readOnly={!form.branchId || disabled}
            selectClassName={warehouses.missing ? "text-slate-400" : ""}
          />
          {form.branchId && branchWarehouses.length === 0 && (
            <p className="mt-1 text-xs text-amber-700">
              لا توجد مخازن في هذا الفرع.{" "}
              <Link to="/inventories" className="font-medium underline">
                صفحة المخازن
              </Link>
            </p>
          )}
        </div>
        <div>
          <Select
            label="العملة"
            required
            value={form.currencyId}
            onChange={(event) => onCurrencyChange(event.target.value)}
            options={currencies.options}
            placeholder="اختر العملة"
            error={errors.currencyId}
            readOnly={disabled}
            selectClassName={currencies.missing ? "text-slate-400" : ""}
          />
          {lists.currencies.length === 0 && (
            <p className="mt-1 text-xs text-amber-700">
              لا توجد عملات.{" "}
              <Link to="/currencies" className="font-medium underline">
                صفحة العملات
              </Link>
            </p>
          )}
        </div>
        {showRate && currency && (
          <ExchangeRateField
            currency={currency}
            defaultCurrency={defaultCurrency}
            value={form.exchangeRate}
            onChange={(exchangeRate) => onChange({ exchangeRate })}
            error={errors.exchangeRate}
            disabled={disabled}
          />
        )}
        <Textarea
          label="ملاحظات"
          className="sm:col-span-2 lg:col-span-3"
          rows={2}
          maxLength={NOTES_MAX}
          value={form.notes}
          onChange={(event) => onChange({ notes: event.target.value })}
          error={errors.notes}
          disabled={disabled}
        />
      </div>
    </section>
  );
}

export default InvoiceHeaderFields;
