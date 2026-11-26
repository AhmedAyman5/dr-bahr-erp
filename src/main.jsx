import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.jsx";
import { applyFontSize, getFontSize } from "./utils/fontSize";

// The saved font size (حجم الخط) is applied before the first render, so there is no flash.
applyFontSize(getFontSize());

// The router lives in routes/AppRoutes.jsx (a data router: RouterProvider), rendered by App.
createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
