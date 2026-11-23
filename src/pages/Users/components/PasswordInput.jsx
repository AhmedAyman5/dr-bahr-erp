// A password field with a show / hide (eye) button. Same look as components/ui/Input.
// Usage:
//   <PasswordInput label="كلمة المرور" name="password" value={form.password} onChange={handleChange}
//     required error={errors.password} />
// autoComplete="new-password" stops the browser from filling in the saved password of the
// logged-in admin.
import { useId, useState } from "react";
import { Eye, EyeOff } from "lucide-react";

function PasswordInput({ label, required = false, error, className = "", ...rest }) {
  const id = useId();
  const [visible, setVisible] = useState(false);
  const toggleLabel = visible ? "إخفاء" : "إظهار";

  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-slate-700">
        {label}
        {required && <span className="ms-1 text-red-600">*</span>}
      </label>
      <div className="relative">
        {/* The input is LTR, so its "ps-10" is space on the LEFT, where the eye button sits
            (end-0 of the RTL wrapper = left). */}
        <input
          id={id}
          type={visible ? "text" : "password"}
          dir="ltr"
          autoComplete="new-password"
          className={`w-full rounded-lg border bg-white py-2 ps-10 pe-3 text-sm outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20 ${
            error ? "border-red-600" : "border-slate-300"
          }`}
          {...rest}
        />
        <button
          type="button"
          title={toggleLabel}
          aria-label={`${toggleLabel} ${label}`}
          onClick={() => setVisible(!visible)}
          className="absolute inset-y-0 end-0 flex items-center rounded-lg px-3 text-slate-400 outline-none hover:text-slate-700 focus-visible:ring-2 focus-visible:ring-primary/40"
        >
          {visible ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      </div>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}

export default PasswordInput;
