import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import { ErrorBoundary } from "./ErrorBoundary.jsx";
import "./App.css";

const el = document.getElementById("root");
if (!el) {
  document.body.innerHTML =
    '<p style="padding:1rem;color:#cbd5e1;font-family:sans-serif">هەڵە: #root نەدۆزرایەوە</p>';
} else {
  ReactDOM.createRoot(el).render(
    <React.StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </React.StrictMode>
  );
}
