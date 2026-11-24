// Which pages each role may open. The ONE place to change when roles get their pages (Week 5).
// Source: ../backend/doc/FRONTEND_WEEK1_UPDATE_3.txt (PART 6.1).
// Until Week 5 the backend answers 403 to every role except SUPERADMIN, so the others get nothing.
//
// Values are page paths from routes/AppRoutes.jsx ("/branches", "/stock", ...); "*" = every page.
// Example for later: ACCOUNTANT: ["/customers", "/suppliers"],
export const ROLE_PAGES = {
  SUPERADMIN: ["*"],
  ADMIN: [],
  ACCOUNTANT: [],
  SALES: [],
  USER: [],
};

// canAccess("USER", "/branches") → false. The home page "/" is always allowed.
// A page also allows its sub-pages: "/products" allows "/products/123".
export function canAccess(role, path) {
  if (path === "/") return true;
  const pages = ROLE_PAGES[role] ?? [];
  return pages.some((page) => page === "*" || path === page || path.startsWith(`${page}/`));
}
