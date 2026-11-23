// Usage:
//   <Alert type="error">{error}</Alert>
//   <Alert type="success" onClose={() => setSuccess("")}>تم الحفظ بنجاح</Alert>
// types: error | success | warning
import { AlertCircle, AlertTriangle, CheckCircle2, X } from "lucide-react";

const TYPE_STYLES = {
  error: { classes: "border-red-200 bg-red-50 text-red-700", Icon: AlertCircle },
  success: { classes: "border-green-200 bg-green-50 text-green-700", Icon: CheckCircle2 },
  warning: { classes: "border-amber-200 bg-amber-50 text-amber-700", Icon: AlertTriangle },
};

function Alert({ type = "error", children, onClose, className = "" }) {
  const { classes, Icon } = TYPE_STYLES[type];

  return (
    <div role="alert" className={`flex items-start gap-2 rounded-lg border px-4 py-3 text-sm ${classes} ${className}`}>
      <Icon size={18} className="mt-0.5 shrink-0" />
      <div className="flex-1">{children}</div>
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 rounded-lg opacity-70 outline-none hover:opacity-100 focus-visible:ring-2 focus-visible:ring-primary/40"
          title="إغلاق"
          aria-label="إغلاق"
        >
          <X size={16} />
        </button>
      )}
    </div>
  );
}

export default Alert;
