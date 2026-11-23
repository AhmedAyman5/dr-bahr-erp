import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";

function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-50 p-4 text-center">
      <p className="text-6xl font-bold text-primary">404</p>
      <h1 className="text-xl font-bold text-slate-900">الصفحة غير موجودة</h1>
      <p className="text-sm text-slate-500">الصفحة التي تبحث عنها غير موجودة أو تم نقلها.</p>
      <Link
        to="/"
        className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-hover"
      >
        {/* In RTL "back" points to the right */}
        <ArrowRight size={18} />
        العودة إلى الرئيسية
      </Link>
    </div>
  );
}

export default NotFound;
