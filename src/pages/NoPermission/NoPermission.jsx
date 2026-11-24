// Shown inside the layout when the user's role may not open the current page (see routes/RoleRoute.jsx).
import { Link } from "react-router-dom";
import { ArrowRight, ShieldX } from "lucide-react";

function NoPermission() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-slate-200 bg-white px-4 py-16 text-center">
      <ShieldX size={40} className="text-slate-400" />
      <h1 className="text-lg font-bold text-slate-900">ليس لديك صلاحية لعرض هذه الصفحة</h1>
      <p className="text-sm text-slate-500">إذا كنت تحتاج إلى هذه الصفحة تواصل مع مدير النظام.</p>
      <Link
        to="/"
        className="mt-2 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white transition-colors outline-none hover:bg-primary-hover focus-visible:ring-2 focus-visible:ring-primary/40"
      >
        {/* In RTL "back" points to the right */}
        <ArrowRight size={18} />
        العودة إلى الرئيسية
      </Link>
    </div>
  );
}

export default NoPermission;
