import PageHeader from "../../components/layout/PageHeader";
import { getUser } from "../../services/session";

function Home() {
  const user = getUser();

  return (
    <div>
      <PageHeader title="الرئيسية" subtitle="نظرة عامة على النظام" />

      <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">
          مرحباً{user?.username ? `، ${user.username}` : ""}
        </h2>
        <p className="mt-2 text-sm text-slate-500">
          أهلاً بك في نظام د. بحر لإدارة الموارد. استخدم القائمة الجانبية للتنقل بين أقسام النظام.
        </p>
      </div>
    </div>
  );
}

export default Home;
