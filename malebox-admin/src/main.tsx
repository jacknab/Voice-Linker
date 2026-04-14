import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";
import { getConfig } from "./config";

// ── Patch global fetch to inject admin secret key header ─────────────────────
// Admin is now served from the same origin as the backend, so relative paths
// work as-is. We only need to inject the X-Admin-Key header on every request.
const _originalFetch = window.fetch.bind(window);

window.fetch = function (input, init) {
  const config = getConfig();
  if (!config) return _originalFetch(input, init);

  // Inject the admin secret key header on every request
  const headers = new Headers(
    init?.headers ??
      (typeof input !== "string" && !(input instanceof URL)
        ? (input as Request).headers
        : undefined),
  );
  headers.set("X-Admin-Key", config.secretKey);

  const newInit: RequestInit = { ...init, headers };

  if (typeof input === "string" || input instanceof URL) {
    return _originalFetch(input, newInit);
  } else {
    return _originalFetch(new Request((input as Request).url, input), newInit);
  }
};

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
