// Shows the page only when the logged-in user's role may open it (see rolePages.js);
// otherwise the "no permission" state, inside the layout (Sidebar + Header stay).
// Used in AppRoutes.jsx as a layout route around every page of the MainLayout group.
// The check runs on every render, so it always uses the current URL and the stored role.
import { Outlet, useLocation } from "react-router-dom";
import NoPermission from "../pages/NoPermission/NoPermission";
import { getUser } from "../services/session";
import { canAccess } from "./rolePages";

function RoleRoute() {
  const { pathname } = useLocation();

  if (!canAccess(getUser()?.role, pathname)) {
    return <NoPermission />;
  }

  return <Outlet />;
}

export default RoleRoute;
