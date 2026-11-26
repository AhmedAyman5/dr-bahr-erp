import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "./index.css";
import App from "./App.jsx";
import { applyFontSize, getFontSize } from "./utils/fontSize";

// The saved font size (حجم الخط) is applied before the first render, so there is no flash.
applyFontSize(getFontSize());

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
