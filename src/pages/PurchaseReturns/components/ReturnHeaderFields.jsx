// The header of the return form (card "بيانات المرتجع"). Only the fields: the state, validation and saving live in
// ReturnEditor.
// - نوع المرتجع: two radio cards on a NEW return ("من فاتورة شراء" = the default, recommended / "بدون فاتورة").
//   Fixed (read only) on edit and when the invoice came from the link (?invoice=<id>).
// - LINKED: المورد (optional: only narrows the invoice picker) + فاتورة الشراء* (the newest 100 POSTED invoices), or
//   the fixed invoice; then a read-only box with what comes from the invoice (branch, warehouse, date, currency,
//   discount, tax).
// - NOT LINKED: المورد* · الفرع* · المخزن* (the branch's only warehouse is chosen by itself).
// - Both: تاريخ المرتجع* · سبب الإرجاع (quick chips fill it) · ملاحظات.
// A saved supplier / branch / warehouse that is no longer active shows as "<name> (محذوف)" in gray.
import { Link } from "react-router-dom";
import DateInput from "../../../components/ui/DateInput";
import Input from "../../../components/ui/Input";
import SearchSelect from "../../../components/ui/SearchSelect";
import Select from "../../../components/ui/Select";
import Textarea from "../../../components/ui/Textarea";
import { formatDay, formatMoney, formatNumber } from "../../../utils/format";
import { NOTES_MAX, REASON_CHIPS, REASON_MAX, getBranchWarehouses } from "../returnForm";

const KINDS = [
  { value: "linked", label: "من فاتورة شراء", hint: "الأسعار والخصم والضريبة من الفاتورة — موصى به" },
  { value: "free", label: "بدون فاتورة", hint: "لبضاعة لا توجد فاتورتها في النظام" },
];

// options + the saved choice when it is not in them (deleted) → { options, missing }.
function withMissing(options, value, savedName) {
  if (!value || options.some((option) => option.value === value)) return { options, missing: false };
  return { options: [...options, { value, label: `${savedName || "محذوف"} (محذوف)` }], missing: true };
}

function InfoItem({ label, children }) {
  return (
    <div>
      <dt className="text-xs font-medium text-slate-500">{label}</dt>
      <dd className="mt-0.5 text-sm text-slate-900">{children}</dd>
    </div>
  );
}

// A read-only header value (not in a <dl>): the fixed invoice of a linked return.
function ReadOnlyField({ label, children }) {
  return (
    <div>
      <span className="block text-sm font-medium text-slate-700">{label}</span>
      <p className="mt-1 text-sm text-slate-900">{children}</p>
    </div>
  );
}

function KindCards({ value, onChange, disabled }) {
  return (
    <fieldset className="sm:col-span-2 lg:col-span-3">
      <legend className="mb-1 block text-sm font-medium text-slate-700">نوع المرتجع</legend>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {KINDS.map((kind) => {
          const checked = value === kind.value;
          return (
            <label
              key={kind.value}
              className={`flex cursor-pointer items-start gap-2 rounded-lg border p-3 transition-colors ${
                checked ? "border-primary bg-primary-soft" : "border-slate-300 hover:bg-slate-50"
              }`}
            >
              <input
                type="radio"
                name="returnKind"
                value={kind.value}
                checked={checked}
                onChange={() => onChange(kind.value)}
                disabled={disabled}
                className="mt-1 accent-primary"
              />
              <span>
                <span className="block text-sm font-semibold text-slate-900">{kind.label}</span>
                <span className="block text-xs text-slate-500">{kind.hint}</span>
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

// سبب الإرجاع: free text (max 250) + quick picks that fill it (like the stock adjustment reason).
function ReasonField({ value, onChange, error, disabled }) {
  return (
    <div className="sm:col-span-2">
      <Input
        label="سبب الإرجاع"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        maxLength={REASON_MAX}
        placeholder="مثل: تالف"
        error={error}
        disabled={disabled}
      />
      <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label="أسباب شائعة">
        {REASON_CHIPS.map((chip) => {
          const selected = value === chip;
          return (
            <button
              key={chip}
              type="button"
              aria-pressed={selected}
              onClick={() => onChange(chip)}
              disabled={disabled}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${
                selected
                  ? "border-primary bg-primary-soft text-primary"
                  : "border-slate-300 bg-white text-slate-600 hover:bg-slate-100"
              }`}
            >
              {chip}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// What a linked return takes from its invoice (read only).
function InvoiceBox({ invoice }) {
  const percent = Number(invoice.discountPercent);
  const discount =
    percent > 0 ? `${formatNumber(invoice.discountPercent)}%` : Number(invoice.discountValue) > 0 ? null : "0%";
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 sm:col-span-2 lg:col-span-3">
      <p className="mb-2 text-xs font-medium text-slate-500">من الفاتورة</p>
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <InfoItem label="الفرع">{invoice.branch?.name ?? "-"}</InfoItem>
        <InfoItem label="المخزن">{invoice.warehouse?.name ?? "-"}</InfoItem>
        <InfoItem label="تاريخ الفاتورة">{formatDay(invoice.invoiceDate)}</InfoItem>
        <InfoItem label="العملة">{invoice.currency ? `${invoice.currency.name} (${invoice.currency.code})` : "-"}</InfoItem>
        <InfoItem label="الخصم">
          {discount ?? (
            <>
              مبلغ <span dir="ltr">{formatMoney(invoice.discountValue)}</span>
            </>
          )}
        </InfoItem>
        <InfoItem label="الضريبة">{`${formatNumber(invoice.taxPercent)}%`}</InfoItem>
      </dl>
    </div>
  );
}

function ReturnHeaderFields({
  form,
  errors,
  lists,
  ret,
  kindLocked,
  invoiceLocked,
  invoice,
  pickerInvoices,
  pickerLoading,
  disabled,
  onChange,
  onDateChange,
  onKindChange,
  onFilterSupplierChange,
  onInvoiceChange,
  onBranchChange,
}) {
  const supplierOptions = lists.suppliers.map((supplier) => ({
    value: supplier.id,
    label: supplier.name,
    sub: supplier.code,
    keywords: supplier.code,
  }));
  const isLinked = form.kind === "linked";

  function renderKind() {
    if (!kindLocked) return <KindCards value={form.kind} onChange={onKindChange} disabled={disabled} />;
    return (
      <div className="sm:col-span-2 lg:col-span-3">
        <span className="block text-sm font-medium text-slate-700">نوع المرتجع</span>
        <p className="mt-1 text-sm text-slate-900">{isLinked ? "من فاتورة شراء" : "بدون فاتورة"}</p>
        {ret && (
          <p className="mt-0.5 text-xs text-slate-500">
            النوع {isLinked ? "والفاتورة ثابتان" : "ثابت"} بعد الإنشاء: لتغييره احذف المسودة وأنشئ مرتجعًا جديدًا.
          </p>
        )}
      </div>
    );
  }

  function renderInvoicePicker() {
    if (invoiceLocked) {
      const code = invoice?.code ?? ret?.purchaseInvoice?.code;
      const supplierName = invoice?.supplier?.name ?? ret?.supplier?.name;
      return (
        <>
          <ReadOnlyField label="فاتورة الشراء">
            {code ? (
              <Link to={`/purchase-invoices/${form.purchaseInvoiceId}`} dir="ltr" className="font-medium text-primary hover:underline">
                {code}
              </Link>
            ) : (
              "—"
            )}
          </ReadOnlyField>
          <ReadOnlyField label="المورد">{supplierName ?? "—"}</ReadOnlyField>
        </>
      );
    }
    const invoiceOptions = pickerInvoices.map((item) => ({
      value: item.id,
      label: item.code,
      sub: `${item.supplier?.name ?? ""} · ${formatDay(item.invoiceDate)} · الصافي ${formatMoney(item.netTotal)} ${
        item.currency?.code ?? ""
      }${item.supplierInvoiceNumber ? ` · فاتورة المورد ${item.supplierInvoiceNumber}` : ""}`,
      keywords: `${item.supplier?.name ?? ""} ${item.supplierInvoiceNumber ?? ""}`,
    }));
    return (
      <>
        <SearchSelect
          label="المورد"
          value={form.filterSupplierId}
          onChange={onFilterSupplierChange}
          options={supplierOptions}
          emptyLabel="كل الموردين"
          placeholder="كل الموردين"
          disabled={disabled}
        />
        <div className="sm:col-span-1 lg:col-span-2">
          <SearchSelect
            label="فاتورة الشراء"
            required
            value={form.purchaseInvoiceId}
            onChange={onInvoiceChange}
            options={invoiceOptions}
            placeholder={pickerLoading ? "جارٍ التحميل..." : "ابحث برقم الفاتورة أو المورد"}
            missingLabel={invoice?.code ?? "فاتورة"}
            error={errors.purchaseInvoiceId}
            disabled={disabled}
          />
          <p className="mt-1 text-xs text-slate-500">تظهر أحدث 100 فاتورة مُرحّلة؛ اختر المورد لتضييق القائمة</p>
        </div>
      </>
    );
  }

  function renderFreeFields() {
    const branches = withMissing(
      lists.branches.map((branch) => ({ value: branch.id, label: branch.name })),
      form.branchId,
      ret?.branch?.name,
    );
    const branchWarehouses = getBranchWarehouses(lists.inventories, form.branchId);
    const warehouses = withMissing(
      branchWarehouses.map((inventory) => ({ value: inventory.id, label: inventory.name })),
      form.warehouseId,
      ret?.warehouse?.name,
    );
    return (
      <>
        <SearchSelect
          label="المورد"
          required
          value={form.supplierId}
          onChange={(supplierId) => onChange({ supplierId })}
          options={supplierOptions}
          placeholder="ابحث بالاسم أو الكود"
          missingLabel={`${ret?.supplier?.name ?? "مورد"} (محذوف)`}
          error={errors.supplierId}
          disabled={disabled}
        />
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
      </>
    );
  }

  return (
    <section className="mb-4 rounded-lg border border-slate-200 bg-white p-4">
      <h2 className="mb-3 text-base font-semibold text-slate-900">بيانات المرتجع</h2>
      <div className="grid grid-cols-1 items-start gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {renderKind()}
        {isLinked ? renderInvoicePicker() : renderFreeFields()}
        {isLinked && invoice && <InvoiceBox invoice={invoice} />}
        <DateInput
          label="تاريخ المرتجع"
          required
          value={form.returnDate}
          onChange={(value, flags) => onDateChange("returnDate", value, flags)}
          error={errors.returnDate}
          disabled={disabled}
        />
        <ReasonField
          value={form.reason}
          onChange={(reason) => onChange({ reason })}
          error={errors.reason}
          disabled={disabled}
        />
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

export default ReturnHeaderFields;
