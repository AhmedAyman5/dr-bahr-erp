// The shell of every protected page: Sidebar (right, RTL) + Header (top) + page content.
// The layout fills the screen (h-screen). Only <main> scrolls, so the Sidebar and
// Header stay fixed and mounted while the routes change inside <Outlet />.
import { Outlet } from "react-router-dom";
import Header from "./Header";
import Sidebar from "./Sidebar";

function MainLayout() {
  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      <Sidebar />

      <div className="flex min-w-0 flex-1 flex-col">
        <Header />

        <main className="flex-1 overflow-y-auto p-4 lg:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

export default MainLayout;
