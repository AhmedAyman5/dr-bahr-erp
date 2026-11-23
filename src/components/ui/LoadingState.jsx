// Usage:
//   if (loading) return <LoadingState />;
//   <LoadingState message="جارٍ تحميل الفروع..." />
import { Loader2 } from "lucide-react";

function LoadingState({ message = "جارٍ التحميل..." }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-slate-500">
      <Loader2 size={32} className="animate-spin text-primary" />
      <p className="text-sm">{message}</p>
    </div>
  );
}

export default LoadingState;
