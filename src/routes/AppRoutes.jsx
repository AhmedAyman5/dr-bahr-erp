// All routes of the app in one place.
// New pages go inside the MainLayout group (and get a link in the right group of Sidebar NAV_GROUPS).
import { Route, Routes } from "react-router-dom";
import MainLayout from "../components/layout/MainLayout";
import Branches from "../pages/Branches/Branches";
import Home from "../pages/Home/Home";
import Login from "../pages/Login/Login";
import NotFound from "../pages/NotFound/NotFound";
import ProtectedRoute from "./ProtectedRoute";
import PublicOnlyRoute from "./PublicOnlyRoute";

function AppRoutes() {
  return (
    <Routes>
      {/* Public: already logged in → go home */}
      <Route
        path="/login"
        element={
          <PublicOnlyRoute>
            <Login />
          </PublicOnlyRoute>
        }
      />

      {/* Protected pages inside the main layout */}
      <Route
        element={
          <ProtectedRoute>
            <MainLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Home />} />
        <Route path="branches" element={<Branches />} />
      </Route>

      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

export default AppRoutes;
