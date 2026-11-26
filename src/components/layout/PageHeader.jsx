// Usage:
//   <PageHeader title="الفروع" subtitle="إدارة فروع الشركة" action={<Button>إضافة فرع</Button>} />
//   Sub-pages (document form / details): a small back link above the title.
//   <PageHeader title={...} back={{ to: "/purchase-quotations", label: "عروض أسعار الشراء" }} />
// title may be JSX (e.g. the document code + a StatusBadge).
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";

function PageHeader({ title, subtitle, action, back }) {
  return (
    <div className="mb-6">
      {back && (
        // RTL: "back" points to the right.
        <Link
          to={back.to}
          className="mb-2 inline-flex items-center gap-1 rounded text-sm text-primary outline-none hover:underline focus-visible:ring-2 focus-visible:ring-primary/40"
        >
          <ArrowRight size={16} />
          {back.label}
        </Link>
      )}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
        </div>
        {action && <div className="flex items-center gap-2">{action}</div>}
      </div>
    </div>
  );
}

export default PageHeader;
