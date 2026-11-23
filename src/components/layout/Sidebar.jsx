// Side navigation. To add a page link, add one item to NAV_ITEMS.
// On tablets (below lg) only the icons are shown to save space.
import { NavLink } from "react-router-dom";
import { House } from "lucide-react";
import logo from "../../assets/logo.png";

const NAV_ITEMS = [{ label: "الرئيسية", path: "/", icon: House }];

function Sidebar() {
  return (
    <aside className="flex h-full w-20 shrink-0 flex-col border-e border-slate-200 bg-white lg:w-64">
      <div className="flex h-16 shrink-0 items-center justify-center gap-3 border-b border-slate-200 px-4 lg:justify-start">
        <img src={logo} alt="د. بحر" className="h-10 w-10 object-contain" />
        <span className="hidden text-lg font-bold text-slate-900 lg:inline">د. بحر</span>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto p-3">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === "/"}
              title={item.label}
              className={({ isActive }) =>
                `flex items-center justify-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors lg:justify-start ${
                  isActive ? "bg-primary-soft text-primary" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                }`
              }
            >
              <Icon size={20} className="shrink-0" />
              <span className="hidden lg:inline">{item.label}</span>
            </NavLink>
          );
        })}
      </nav>
    </aside>
  );
}

export default Sidebar;
