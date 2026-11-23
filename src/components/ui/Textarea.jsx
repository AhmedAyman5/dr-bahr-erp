// Usage:
//   <Textarea label="العنوان" name="address" value={form.address} onChange={handleChange} rows={3} />
import { useId } from "react";

function Textarea({ label, required = false, error, readOnly = false, rows = 3, className = "", ...rest }) {
  const id = useId();

  return (
    <div className={className}>
      {label && (
        <label htmlFor={id} className="mb-1 block text-sm font-medium text-slate-700">
          {label}
          {required && <span className="ms-1 text-red-600">*</span>}
        </label>
      )}
      <textarea
        id={id}
        rows={rows}
        readOnly={readOnly}
        className={`w-full resize-y rounded-lg border px-3 py-2 text-sm outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20 ${
          error ? "border-red-600" : "border-slate-300"
        } ${readOnly ? "cursor-default bg-slate-100 text-slate-500" : "bg-white"}`}
        {...rest}
      />
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}

export default Textarea;
