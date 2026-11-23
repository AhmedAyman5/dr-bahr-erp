// Usage:
//   if (error) return <ErrorState message={error} onRetry={loadBranches} />;
import { AlertCircle, RotateCw } from "lucide-react";
import Button from "./Button";

function ErrorState({ message = "حدث خطأ غير متوقع، حاول مرة أخرى لاحقاً", onRetry }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-12 text-center">
      <AlertCircle size={32} className="text-red-600" />
      <p className="text-sm text-red-700">{message}</p>
      {onRetry && (
        <Button variant="secondary" onClick={onRetry}>
          <RotateCw size={16} />
          إعادة المحاولة
        </Button>
      )}
    </div>
  );
}

export default ErrorState;
