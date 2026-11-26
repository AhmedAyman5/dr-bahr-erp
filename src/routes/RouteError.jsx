// Shown by the router when a page crashes while rendering (the route's errorElement, see AppRoutes.jsx).
// Without it the data router shows its own English "Unexpected Application Error!" screen.
// Arabic only: no stack trace, no English text. (Unknown URLs are NOT errors: they show pages/NotFound.)
import { AlertCircle, RotateCw } from "lucide-react";
import Button from "../components/ui/Button";

function RouteError() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-4 py-16 text-center">
      <AlertCircle size={40} className="text-red-600" />
      <h1 className="text-xl font-bold text-slate-900">حدث خطأ غير متوقع</h1>
      <Button variant="secondary" onClick={() => window.location.reload()}>
        <RotateCw size={16} />
        إعادة تحميل الصفحة
      </Button>
    </div>
  );
}

export default RouteError;
