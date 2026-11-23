// Usage:
//   <Button onClick={save}>حفظ</Button>
//   <Button variant="danger" loading={deleting}>حذف</Button>
//   <Button type="submit" variant="primary"><Plus size={18} /> إضافة</Button>
// variants: primary | secondary | danger | ghost
import { Loader2 } from "lucide-react";

const VARIANT_CLASSES = {
  primary: "bg-primary text-white hover:bg-primary-hover",
  secondary: "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50",
  danger: "bg-red-600 text-white hover:bg-red-700",
  ghost: "text-slate-600 hover:bg-slate-100",
};

function Button({
  children,
  variant = "primary",
  type = "button",
  loading = false,
  disabled = false,
  className = "",
  ...rest
}) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${VARIANT_CLASSES[variant]} ${className}`}
      {...rest}
    >
      {loading && <Loader2 size={16} className="animate-spin" />}
      {children}
    </button>
  );
}

export default Button;
