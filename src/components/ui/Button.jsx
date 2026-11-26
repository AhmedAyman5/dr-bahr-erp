// Usage:
//   <Button onClick={save}>حفظ</Button>
//   <Button variant="secondary" onClick={close}>إلغاء</Button>
//   <Button variant="danger" loading={deleting}>حذف الفرع</Button>
//   <Button variant="danger-ghost" title="حذف" aria-label="حذف"><Trash2 size={16} /></Button>
//   <Button type="submit"><Plus size={18} /> إضافة</Button>
//   <Button to="/item-card?product=p1&inventory=w1" variant="ghost" title="كارت الصنف" aria-label="كارت الصنف">
//     <ClipboardList size={16} />
//   </Button>
// to: opens another page → a real link (react-router Link) that looks like a button
//     (middle-click / new tab work). A link has no disabled / loading state.
// variants:
//   primary      → main / safe action (blue)
//   secondary    → neutral / cancel (white with border)
//   danger       → confirm a destructive action (solid red)
//   danger-ghost → destructive action that should not be a red block (logout, delete icons in tables)
//   ghost        → quiet neutral action
import { Link } from "react-router-dom";
import { Loader2 } from "lucide-react";

const VARIANT_CLASSES = {
  primary: "bg-primary text-white hover:bg-primary-hover focus-visible:ring-primary/40",
  secondary:
    "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 focus-visible:ring-primary/40",
  danger: "bg-red-600 text-white hover:bg-red-700 focus-visible:ring-red-600/40",
  "danger-ghost": "text-red-600 hover:bg-red-50 hover:text-red-700 focus-visible:ring-red-600/40",
  ghost: "text-slate-600 hover:bg-slate-100 focus-visible:ring-primary/40",
};

function Button({
  children,
  variant = "primary",
  type = "button",
  loading = false,
  disabled = false,
  className = "",
  to,
  ...rest
}) {
  const classes = `inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-offset-1 disabled:opacity-60 ${VARIANT_CLASSES[variant]} ${className}`;

  if (to) {
    return (
      <Link to={to} className={classes} {...rest}>
        {children}
      </Link>
    );
  }

  return (
    <button type={type} disabled={disabled || loading} className={classes} {...rest}>
      {loading && <Loader2 size={16} className="animate-spin" />}
      {children}
    </button>
  );
}

export default Button;
