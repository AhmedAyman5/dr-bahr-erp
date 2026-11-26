// The header fields of the quotation form (card "بيانات العرض"). Only the fields: the state, validation and
// saving live in QuotationEditor.
// A saved supplier / branch / warehouse that is no longer active (deleted) stays visible as "<name> (محذوف)"
// in gray (names from the quotation); saving then explains it (DOES_NOT_EXIST).
import DateInput from "../../../components/ui/DateInput";
import SearchSelect from "../../../components/ui/SearchSelect";
import Select from "../../../components/ui/Select";
import Textarea from "../../../components/ui/Textarea";
import { NOTES_MAX } from "../quotationForm";

// options + the saved choice when it is not in them (deleted) → { options, missing }.
function withMissing(options, value, savedName) {
  if (!value || options.some((option) => option.value === value)) return { options, missing: false };
  return { options: [...options, { value, label: `${savedName || "محذوف"} (محذوف)` }], missing: true };
}

function QuotationHeaderFields({ form, errors, lists, quotation, disabled, onChange, onDateChange }) {
  const supplierOptions = lists.suppliers.map((supplier) => ({
    value: supplier.id,
    label: supplier.name,
    sub: supplier.code,
    keywords: supplier.code,
  }));
  const branches = withMissing(
    lists.branches.map((branch) => ({ value: branch.id, label: branch.name })),
    form.branchId,
    quotation?.branch?.name,
  );
  const warehouses = withMissing(
    lists.inventories
      .filter((inventory) => inventory.branchId === form.branchId)
      .map((inventory) => ({ value: inventory.id, label: inventory.name })),
    form.warehouseId,
    quotation?.warehouse?.name,
  );

  return (
    <section className="mb-4 rounded-lg border border-slate-200 bg-white p-4">
      <h2 className="mb-3 text-base font-semibold text-slate-900">بيانات العرض</h2>
      <div className="grid grid-cols-1 items-start gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <SearchSelect
          label="المورد"
          required
          value={form.supplierId}
          onChange={(supplierId) => onChange({ supplierId })}
          options={supplierOptions}
          placeholder="ابحث بالاسم أو الكود"
          missingLabel={`${quotation?.supplier?.name ?? "مورد"} (محذوف)`}
          error={errors.supplierId}
          disabled={disabled}
        />
        <DateInput
          label="تاريخ العرض"
          required
          value={form.quotationDate}
          onChange={(value, flags) => onDateChange("quotationDate", value, flags)}
          error={errors.quotationDate}
          disabled={disabled}
        />
        <DateInput
          label="صالح حتى"
          value={form.validUntil}
          onChange={(value, flags) => onDateChange("validUntil", value, flags)}
          error={errors.validUntil}
          disabled={disabled}
        />
        <Select
          label="الفرع"
          required
          value={form.branchId}
          // Another branch → its warehouses: the chosen warehouse is cleared.
          onChange={(event) => onChange({ branchId: event.target.value, warehouseId: "" })}
          options={branches.options}
          placeholder="اختر الفرع"
          error={errors.branchId}
          readOnly={disabled}
          selectClassName={branches.missing ? "text-slate-400" : ""}
        />
        <div>
          <Select
            label="المخزن"
            value={form.warehouseId}
            onChange={(event) => onChange({ warehouseId: event.target.value })}
            options={warehouses.options}
            placeholder="بدون مخزن"
            error={errors.warehouseId}
            readOnly={!form.branchId || disabled}
            selectClassName={warehouses.missing ? "text-slate-400" : ""}
          />
          <p className="mt-1 text-xs text-slate-500">اختياري — يُطلب عند التحويل لفاتورة إن لم يُحدَّد</p>
        </div>
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

export default QuotationHeaderFields;
