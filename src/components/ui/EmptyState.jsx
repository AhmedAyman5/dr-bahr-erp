// Usage:
//   if (branches.length === 0) return <EmptyState message="لا توجد فروع بعد" action={<Button onClick={openAdd}>إضافة فرع</Button>} />;
import { Inbox } from "lucide-react";

function EmptyState({ message = "لا توجد بيانات لعرضها", action }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-slate-300 bg-white px-4 py-12 text-center">
      <Inbox size={32} className="text-slate-400" />
      <p className="text-sm text-slate-500">{message}</p>
      {action}
    </div>
  );
}

export default EmptyState;
