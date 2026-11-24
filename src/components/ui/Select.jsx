// Usage:
//   <Select
//     label="نوع الصنف"
//     name="itemType"
//     value={form.itemType}
//     onChange={handleChange}
//     options={[{ value: "STOCK", label: "مخزني" }, { value: "SERVICE", label: "خدمي" }]}
//     placeholder="اختر النوع"
//     required
//   />
// selectClassName: extra classes for the <select> itself (e.g. "text-slate-400" for a deleted choice).
import { useId } from "react";

function Select({
  label,
  options = [],
  placeholder,
  required = false,
  error,
  readOnly = false,
  className = "",
  selectClassName = "",
  ...rest
}) {
  const id = useId();

  return (
    <div className={className}>
      {label && (
        <label htmlFor={id} className="mb-1 block text-sm font-medium text-slate-700">
          {label}
          {required && <span className="ms-1 text-red-600">*</span>}
        </label>
      )}
      <select
        id={id}
        disabled={readOnly}
        className={`w-full rounded-lg border px-3 py-2 text-sm outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20 ${
          error ? "border-red-600" : "border-slate-300"
        } ${readOnly ? "cursor-default bg-slate-100 text-slate-500" : "bg-white"} ${selectClassName}`}
        {...rest}
      >
        {placeholder && <option value="">{placeholder}</option>}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}

export default Select;
