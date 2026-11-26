// The editable lines (البنود) of a document form: one row per product.
// Presentational: the page keeps the lines (useState) and loads the units; this table never calls the API.
// The line objects and their helpers (newLine, validateLines, ...): utils/documentLines.js.
//
// Usage:
//   <LinesTable
//     lines={lines}                       // the line objects (utils/documentLines.js)
//     onChange={setLines}                 // receives the whole new array
//     products={products}                 // GET /products (all of them: SERVICE is allowed on documents)
//     unitsByProduct={unitsByProduct}     // { [productId]: { status: "loading" | "ready" | "missing" | "error", units } }
//     onLoadUnits={loadUnits}             // (productId) → the page loads GET /products/:id/units (if not cached)
//     errors={lineErrors}                 // per row: { productId, itemUnitId, quantity, price, discount, notes }
//     highlightIndex={rowWithServerError} // red row + scrolled into view (a server "lines.N" error), or null
//     priceLabel="سعر الوحدة"             // the price column (decided per document)
//     showDiscount                        // false → no line discount column (returns)
//     extraColumns={[]}                   // more inputs before الإجمالي: { key, label, render(line, index, update) }
//     disabled={saving}
//   />
//
// Behaviour:
// - الصنف: searchable (name, code, barcode). Choosing a product selects its primary unit; another product resets
//   the unit (quantity / price stay). الوحدة is disabled until a product is chosen: "قطعة", "كرتونة (12 قطعة)".
// - خصم البند: one input + a "%" / "مبلغ" toggle; empty = no discount.
// - "+ ملاحظة للبند" opens a notes input under the product (max 250); a row with notes shows it open.
// - "إضافة بند" adds an empty row and focuses its product. There is always at least one row. Removing a row with
//   data asks first; an empty row is removed directly. Completely empty rows are ignored on save.
// - الإجمالي: live preview (utils/documentTotals). The server computes the real totals.
// - Fits 1280×720 at font size متوسط; when it overflows (كبير) DataTable's fade + sticky delete column work.
import { useEffect, useRef, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import Button from "../ui/Button";
import ConfirmDialog from "../ui/ConfirmDialog";
import DataTable from "../ui/DataTable";
import Input from "../ui/Input";
import SearchSelect from "../ui/SearchSelect";
import Select from "../ui/Select";
import { calcLineTotal } from "../../utils/documentTotals";
import { LINE_NOTES_MAX, isEmptyLine, newLine } from "../../utils/documentLines";
import { formatMoney, formatNumber } from "../../utils/format";

const DECIMAL_INPUT = { inputMode: "decimal", dir: "ltr", autoComplete: "off" };

function RequiredLabel({ children }) {
  return (
    <>
      {children}
      <span className="ms-0.5 text-red-600">*</span>
    </>
  );
}

function productOption(product) {
  const sub = product.itemType === "SERVICE" ? `${product.code} · خدمي` : product.code;
  return { value: product.id, label: product.name, sub, keywords: `${product.code} ${product.barcode ?? ""}` };
}

// The "%" / "مبلغ" toggle of a line discount.
function LineDiscountToggle({ value, onChange, disabled, rowNumber }) {
  const options = [
    { value: "percent", label: "%" },
    { value: "amount", label: "مبلغ" },
  ];
  return (
    <div role="radiogroup" aria-label={`نوع خصم البند ${rowNumber}`} className="inline-flex shrink-0 rounded-lg border border-slate-300 p-0.5">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          disabled={disabled}
          onClick={() => onChange(option.value)}
          className={`rounded-md px-1.5 py-1 text-xs font-medium outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${
            value === option.value ? "bg-primary text-white" : "text-slate-600 hover:bg-slate-100"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function LinesTable({
  lines,
  onChange,
  products = [],
  unitsByProduct = {},
  onLoadUnits,
  errors = [],
  highlightIndex = null,
  priceLabel = "سعر الوحدة",
  showDiscount = true,
  extraColumns = [],
  disabled = false,
}) {
  const containerRef = useRef(null);
  // The row just added by "إضافة بند": its product search gets the focus.
  const [focusKey, setFocusKey] = useState(null);
  const [indexToDelete, setIndexToDelete] = useState(null);

  const productOptions = products.map(productOption);
  const productById = new Map(products.map((product) => [product.id, product]));

  // A server error on a line: bring that row into view.
  useEffect(() => {
    if (highlightIndex === null || highlightIndex === undefined) return;
    const row = containerRef.current?.querySelectorAll("tbody tr")[highlightIndex];
    row?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [highlightIndex]);

  function updateLine(index, changes) {
    onChange(lines.map((line, lineIndex) => (lineIndex === index ? { ...line, ...changes } : line)));
  }

  function chooseProduct(index, productId) {
    const product = productById.get(productId);
    // The primary unit is known from the product list right away; the other units come from onLoadUnits.
    updateLine(index, {
      productId,
      itemUnitId: product?.primaryItemUnitId ?? "",
      savedProductName: "",
      savedProductCode: "",
      savedUnitName: "",
    });
    onLoadUnits?.(productId);
  }

  function addLine() {
    const line = newLine();
    setFocusKey(line.key);
    onChange([...lines, line]);
  }

  function removeLine(index) {
    const rest = lines.filter((_, lineIndex) => lineIndex !== index);
    onChange(rest.length > 0 ? rest : [newLine()]);
  }

  function askRemove(index) {
    if (isEmptyLine(lines[index])) removeLine(index);
    else setIndexToDelete(index);
  }

  // The unit dropdown of a line: primary unit first ("قطعة"), then "كرتونة (12 قطعة)".
  function getUnitOptions(line) {
    const entry = unitsByProduct[line.productId];
    const product = productById.get(line.productId);
    let options = [];
    if (entry?.status === "ready") {
      const primaryName = entry.units.find((unit) => unit.isPrimary)?.itemUnit?.name ?? "";
      options = entry.units.map((unit) => ({
        value: unit.itemUnitId,
        label: unit.isPrimary
          ? (unit.itemUnit?.name ?? "")
          : `${unit.itemUnit?.name ?? ""} (${formatNumber(unit.factor)} ${primaryName})`,
      }));
    } else if (product) {
      options = [{ value: product.primaryItemUnitId, label: product.primaryItemUnit?.name ?? "الوحدة الأساسية" }];
    }
    let unitMissing = false;
    if (line.itemUnitId && !options.some((option) => option.value === line.itemUnitId)) {
      // Still loading → the saved name; loaded (or the product is gone) and not there → it was removed.
      const known = entry?.status === "ready" || entry?.status === "missing";
      unitMissing = known;
      const name = line.savedUnitName || "وحدة";
      options.push({ value: line.itemUnitId, label: known ? `${name} (محذوف)` : name });
    }
    return { options, unitMissing };
  }

  const columns = [
    {
      key: "number",
      label: "#",
      render: (_, index) => <span className="block w-5 pt-2 text-slate-500">{index + 1}</span>,
    },
    {
      key: "product",
      label: <RequiredLabel>الصنف</RequiredLabel>,
      render: (line, index) => (
        <div className="w-48">
          <SearchSelect
            aria-label={`الصنف — البند ${index + 1}`}
            value={line.productId}
            onChange={(value) => chooseProduct(index, value)}
            options={productOptions}
            placeholder="ابحث بالاسم أو الكود"
            missingLabel={`${line.savedProductName || "صنف"} (محذوف)`}
            error={errors[index]?.productId}
            autoFocus={line.key === focusKey}
            disabled={disabled}
          />
          {line.notesOpen ? (
            <div className="mt-1">
              <input
                aria-label={`ملاحظة البند ${index + 1}`}
                placeholder="ملاحظة للبند"
                maxLength={LINE_NOTES_MAX}
                value={line.notes}
                onChange={(event) => updateLine(index, { notes: event.target.value })}
                disabled={disabled}
                className={`w-full rounded-lg border px-2 py-1 text-xs outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 ${
                  errors[index]?.notes ? "border-red-600" : "border-slate-300"
                }`}
              />
              {errors[index]?.notes && <p className="mt-1 text-xs text-red-600">{errors[index].notes}</p>}
            </div>
          ) : (
            <button
              type="button"
              onClick={() => updateLine(index, { notesOpen: true })}
              disabled={disabled}
              className="mt-1 rounded text-xs text-primary outline-none hover:underline focus-visible:ring-2 focus-visible:ring-primary/40"
            >
              + ملاحظة للبند
            </button>
          )}
        </div>
      ),
    },
    {
      key: "unit",
      label: <RequiredLabel>الوحدة</RequiredLabel>,
      render: (line, index) => {
        const { options, unitMissing } = getUnitOptions(line);
        const entry = unitsByProduct[line.productId];
        return (
          <div className="w-36">
            <Select
              aria-label={`الوحدة — البند ${index + 1}`}
              value={line.itemUnitId}
              onChange={(event) => updateLine(index, { itemUnitId: event.target.value, savedUnitName: "" })}
              options={options}
              // Only while nothing is chosen: then the list is exactly the product's units.
              placeholder={line.itemUnitId ? undefined : "اختر الوحدة"}
              readOnly={!line.productId || disabled}
              error={errors[index]?.itemUnitId}
              selectClassName={unitMissing ? "text-slate-400" : ""}
            />
            {entry?.status === "error" && (
              <button
                type="button"
                onClick={() => onLoadUnits?.(line.productId, { retry: true })}
                className="mt-1 text-start text-xs text-red-600 underline"
              >
                تعذر تحميل الوحدات، إعادة المحاولة
              </button>
            )}
          </div>
        );
      },
    },
    {
      key: "quantity",
      label: <RequiredLabel>الكمية</RequiredLabel>,
      render: (line, index) => (
        <Input
          className="w-20"
          aria-label={`الكمية — البند ${index + 1}`}
          {...DECIMAL_INPUT}
          value={line.quantity}
          onChange={(event) => updateLine(index, { quantity: event.target.value })}
          error={errors[index]?.quantity}
          disabled={disabled}
        />
      ),
    },
    {
      key: "price",
      label: <RequiredLabel>{priceLabel}</RequiredLabel>,
      render: (line, index) => (
        <Input
          className="w-24"
          aria-label={`${priceLabel} — البند ${index + 1}`}
          {...DECIMAL_INPUT}
          value={line.price}
          onChange={(event) => updateLine(index, { price: event.target.value })}
          error={errors[index]?.price}
          disabled={disabled}
        />
      ),
    },
    ...(showDiscount
      ? [
          {
            key: "discount",
            label: "خصم البند",
            render: (line, index) => {
              const error = errors[index]?.discount;
              return (
                <div className="w-32">
                  <div className="flex items-center gap-1">
                    <input
                      aria-label={`${line.discountType === "percent" ? "نسبة خصم" : "قيمة خصم"} البند ${index + 1}`}
                      {...DECIMAL_INPUT}
                      value={line.discount}
                      onChange={(event) => updateLine(index, { discount: event.target.value })}
                      disabled={disabled}
                      aria-invalid={Boolean(error)}
                      className={`w-full min-w-0 rounded-lg border bg-white px-2 py-2 text-sm outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20 ${
                        error ? "border-red-600" : "border-slate-300"
                      }`}
                    />
                    <LineDiscountToggle
                      value={line.discountType}
                      onChange={(discountType) => updateLine(index, { discountType })}
                      disabled={disabled}
                      rowNumber={index + 1}
                    />
                  </div>
                  {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
                </div>
              );
            },
          },
        ]
      : []),
    ...extraColumns.map((column) => ({
      key: column.key,
      label: column.label,
      render: (line, index) => column.render(line, index, (changes) => updateLine(index, changes)),
    })),
    {
      key: "total",
      label: "الإجمالي",
      render: (line) => {
        const total = isEmptyLine(line) ? null : calcLineTotal(line);
        return (
          <span dir="ltr" className="block w-24 pt-2 text-end font-medium">
            {total === null ? "—" : formatMoney(total, { maxDecimals: 4 })}
          </span>
        );
      },
    },
  ];

  return (
    <div ref={containerRef}>
      <DataTable
        dense
        columns={columns}
        rows={lines}
        rowKey="key"
        rowClassName={(_, index) => `align-top ${index === highlightIndex ? "bg-red-50" : ""}`}
        actionsLabel={<span className="sr-only">حذف البند</span>}
        renderActions={(line, index) => (
          <Button
            variant="danger-ghost"
            className="mt-0.5 px-2"
            title="حذف البند"
            aria-label={`حذف البند رقم ${index + 1}`}
            onClick={() => askRemove(index)}
            disabled={disabled}
          >
            <Trash2 size={16} />
          </Button>
        )}
      />
      <div className="mt-3">
        <Button variant="secondary" onClick={addLine} disabled={disabled}>
          <Plus size={16} />
          إضافة بند
        </Button>
      </div>

      <ConfirmDialog
        open={indexToDelete !== null}
        title="حذف البند"
        message={`حذف البند رقم ${(indexToDelete ?? 0) + 1}؟`}
        confirmLabel="حذف البند"
        onConfirm={() => {
          removeLine(indexToDelete);
          setIndexToDelete(null);
        }}
        onCancel={() => setIndexToDelete(null)}
      />
    </div>
  );
}

export default LinesTable;
