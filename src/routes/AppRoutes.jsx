// All routes of the app in one place.
// New pages go inside the RoleRoute group (and get a link in the right group of Sidebar NAV_GROUPS).
// Which role may open which page: rolePages.js.
import { Route, Routes } from "react-router-dom";
import MainLayout from "../components/layout/MainLayout";
import Branches from "../pages/Branches/Branches";
import Categories from "../pages/Categories/Categories";
import Customers from "../pages/Customers/Customers";
import Employees from "../pages/Employees/Employees";
import Home from "../pages/Home/Home";
import Inventories from "../pages/Inventories/Inventories";
import ItemUnits from "../pages/ItemUnits/ItemUnits";
import Login from "../pages/Login/Login";
import NotFound from "../pages/NotFound/NotFound";
import ProductStock from "../pages/ProductStock/ProductStock";
import Products from "../pages/Products/Products";
import Suppliers from "../pages/Suppliers/Suppliers";
import Users from "../pages/Users/Users";
import ProtectedRoute from "./ProtectedRoute";
import PublicOnlyRoute from "./PublicOnlyRoute";
import RoleRoute from "./RoleRoute";

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
        {/* A page the role may not open shows "ليس لديك صلاحية" instead */}
        <Route element={<RoleRoute />}>
          <Route index element={<Home />} />
          <Route path="branches" element={<Branches />} />
          <Route path="inventories" element={<Inventories />} />
          <Route path="categories" element={<Categories />} />
          <Route path="units" element={<ItemUnits />} />
          <Route path="products" element={<Products />} />
          <Route path="stock" element={<ProductStock />} />
          <Route path="customers" element={<Customers />} />
          <Route path="suppliers" element={<Suppliers />} />
          <Route path="employees" element={<Employees />} />
          <Route path="users" element={<Users />} />
        </Route>
      </Route>

      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

export default AppRoutes;
