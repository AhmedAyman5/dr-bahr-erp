// All routes of the app in one place.
// New pages go inside the MainLayout group (and get a link in Sidebar NAV_ITEMS).
import { Navigate, Route, Routes } from "react-router-dom";
import MainLayout from "../components/layout/MainLayout";
import Home from "../pages/Home/Home";
import Login from "../pages/Login/Login";
import NotFound from "../pages/NotFound/NotFound";
import { isLoggedIn } from "../services/session";
import ProtectedRoute from "./ProtectedRoute";

function AppRoutes() {
  return (
    <Routes>
      {/* Public: already logged in → go home */}
      <Route path="/login" element={isLoggedIn() ? <Navigate to="/" replace /> : <Login />} />

      {/* Protected pages inside the main layout */}
      <Route
        element={
          <ProtectedRoute>
            <MainLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Home />} />
      </Route>

      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

export default AppRoutes;
