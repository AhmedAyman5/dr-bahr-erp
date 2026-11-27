// All routes of the app in one place.
// New pages go inside the RoleRoute group (and get a link in the right group of Sidebar NAV_GROUPS).
// Which role may open which page: rolePages.js.
//
// A DATA router (createBrowserRouter + RouterProvider): needed by useBlocker (hooks/useUnsavedChanges), which
// protects full-page forms from losing typed data. The route tree is written with <Route> elements as before
// (createRoutesFromElements); the guards still check on every render (ProtectedRoute, PublicOnlyRoute,
// RoleRoute). A page that crashes while rendering shows RouteError (Arabic) instead of the router's own screen.
import { Route, RouterProvider, createBrowserRouter, createRoutesFromElements } from "react-router-dom";
import MainLayout from "../components/layout/MainLayout";
import Branches from "../pages/Branches/Branches";
import Categories from "../pages/Categories/Categories";
import Currencies from "../pages/Currencies/Currencies";
import Customers from "../pages/Customers/Customers";
import Employees from "../pages/Employees/Employees";
import Home from "../pages/Home/Home";
import Inventories from "../pages/Inventories/Inventories";
import ItemCard from "../pages/ItemCard/ItemCard";
import ItemUnits from "../pages/ItemUnits/ItemUnits";
import Login from "../pages/Login/Login";
import NotFound from "../pages/NotFound/NotFound";
import ProductStock from "../pages/ProductStock/ProductStock";
import Products from "../pages/Products/Products";
import PurchaseInvoiceDetails from "../pages/PurchaseInvoices/PurchaseInvoiceDetails";
import PurchaseInvoiceForm from "../pages/PurchaseInvoices/PurchaseInvoiceForm";
import PurchaseInvoices from "../pages/PurchaseInvoices/PurchaseInvoices";
import PurchaseQuotationDetails from "../pages/PurchaseQuotations/PurchaseQuotationDetails";
import PurchaseQuotationForm from "../pages/PurchaseQuotations/PurchaseQuotationForm";
import PurchaseQuotations from "../pages/PurchaseQuotations/PurchaseQuotations";
import StockMovements from "../pages/StockMovements/StockMovements";
import Suppliers from "../pages/Suppliers/Suppliers";
import Users from "../pages/Users/Users";
import ProtectedRoute from "./ProtectedRoute";
import PublicOnlyRoute from "./PublicOnlyRoute";
import RoleRoute from "./RoleRoute";
import RouteError from "./RouteError";

const router = createBrowserRouter(
  createRoutesFromElements(
    // Catches a crash anywhere (also the login page and the layout itself).
    <Route errorElement={<RouteError />}>
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
        {/* A page the role may not open shows "ليس لديك صلاحية" instead.
            A page that crashes shows RouteError inside the layout (Sidebar + Header stay). */}
        <Route element={<RoleRoute />} errorElement={<RouteError />}>
          <Route index element={<Home />} />
          <Route path="branches" element={<Branches />} />
          <Route path="inventories" element={<Inventories />} />
          <Route path="categories" element={<Categories />} />
          <Route path="units" element={<ItemUnits />} />
          <Route path="currencies" element={<Currencies />} />
          <Route path="products" element={<Products />} />
          <Route path="stock" element={<ProductStock />} />
          <Route path="stock-movements" element={<StockMovements />} />
          <Route path="item-card" element={<ItemCard />} />
          {/* Document pages: list, new, details, edit (keys: new and edit never share their state). */}
          <Route path="purchase-quotations" element={<PurchaseQuotations />} />
          <Route path="purchase-quotations/new" element={<PurchaseQuotationForm key="new" />} />
          <Route path="purchase-quotations/:id" element={<PurchaseQuotationDetails />} />
          <Route path="purchase-quotations/:id/edit" element={<PurchaseQuotationForm key="edit" />} />
          <Route path="purchase-invoices" element={<PurchaseInvoices />} />
          <Route path="purchase-invoices/new" element={<PurchaseInvoiceForm key="new" />} />
          <Route path="purchase-invoices/:id" element={<PurchaseInvoiceDetails />} />
          <Route path="purchase-invoices/:id/edit" element={<PurchaseInvoiceForm key="edit" />} />
          <Route path="customers" element={<Customers />} />
          <Route path="suppliers" element={<Suppliers />} />
          <Route path="employees" element={<Employees />} />
          <Route path="users" element={<Users />} />
        </Route>
      </Route>

      {/* Unknown URLs: a normal page (not an error). */}
      <Route path="*" element={<NotFound />} />
    </Route>,
  ),
);

function AppRoutes() {
  return <RouterProvider router={router} />;
}

export default AppRoutes;
