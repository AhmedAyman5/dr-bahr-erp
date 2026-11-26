// Side navigation. Links are grouped in NAV_GROUPS.
// To add a page link, add one item to the right group.
// Only the links the user's role may open are shown (routes/rolePages.js); empty groups are hidden.
// On tablets (below lg) only the icons are shown: group titles are hidden and a thin
// divider separates the groups instead.
import { NavLink } from "react-router-dom";
import {
  ArrowLeftRight,
  Boxes,
  Building2,
  ClipboardList,
  Coins,
  House,
  IdCard,
  Package,
  Ruler,
  Tags,
  Truck,
  UserCog,
  UserRound,
  Warehouse,
} from "lucide-react";
import logo from "../../assets/logo.png";
import { canAccess } from "../../routes/rolePages";
import { getUser } from "../../services/session";

const NAV_GROUPS = [
  {
    title: "",
    items: [{ label: "الرئيسية", path: "/", icon: House }],
  },
  {
    title: "البيانات الأساسية",
    items: [
      { label: "الفروع", path: "/branches", icon: Building2 },
      { label: "المخازن", path: "/inventories", icon: Warehouse },
      { label: "التصنيفات", path: "/categories", icon: Tags },
      { label: "الوحدات", path: "/units", icon: Ruler },
      { label: "العملات", path: "/currencies", icon: Coins },
    ],
  },
  {
    title: "الأصناف والمخزون",
    items: [
      { label: "الأصناف", path: "/products", icon: Package },
      { label: "أرصدة المخزون", path: "/stock", icon: Boxes },
      { label: "حركات المخزون", path: "/stock-movements", icon: ArrowLeftRight },
      { label: "كارت الصنف", path: "/item-card", icon: ClipboardList },
    ],
  },
  {
    title: "العملاء والموردين",
    items: [
      { label: "العملاء", path: "/customers", icon: UserRound },
      { label: "الموردين", path: "/suppliers", icon: Truck },
    ],
  },
  {
    title: "الموظفين والمستخدمين",
    items: [
      { label: "الموظفين", path: "/employees", icon: IdCard },
      { label: "المستخدمين", path: "/users", icon: UserCog },
    ],
  },
];

function Sidebar() {
  const role = getUser()?.role;
  const visibleGroups = NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => canAccess(role, item.path)),
  })).filter((group) => group.items.length > 0);

  return (
    <aside className="flex h-full w-20 shrink-0 flex-col border-e border-slate-200 bg-white lg:w-64">
      <div className="flex h-16 shrink-0 items-center justify-center gap-3 border-b border-slate-200 px-4 lg:justify-start">
        <img src={logo} alt="د. بحر" className="h-10 w-10 object-contain" />
        <span className="hidden text-lg font-bold text-slate-900 lg:inline">د. بحر</span>
      </div>

      <nav className="flex-1 overflow-y-auto p-3">
        {visibleGroups.map((group, index) => (
          <div key={group.title || "main"} className={index > 0 ? "mt-3" : ""}>
            {/* Tablet: thin divider between groups. Desktop: the group title. */}
            {index > 0 && <hr className="mb-3 border-slate-200 lg:hidden" />}
            {group.title && (
              <p className="mb-1 hidden px-3 text-xs font-semibold text-slate-400 lg:block">{group.title}</p>
            )}

            <div className="space-y-1">
              {group.items.map((item) => {
                const Icon = item.icon;
                return (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    end={item.path === "/"}
                    title={item.label}
                    className={({ isActive }) =>
                      `flex items-center justify-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-primary/40 lg:justify-start ${
                        isActive
                          ? "bg-primary-soft text-primary"
                          : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                      }`
                    }
                  >
                    <Icon size={20} className="shrink-0" />
                    <span className="hidden lg:inline">{item.label}</span>
                  </NavLink>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
    </aside>
  );
}

export default Sidebar;
