import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";
import { getConfig } from "./config";

// ── Patch global fetch to inject server URL prefix + admin secret key ────────
// This means Admin.tsx needs zero changes — all its fetch('/api/...') calls
// automatically hit the configured production server with the right auth header.
const _originalFetch = window.fetch.bind(window);

window.fetch = function (input, init) {
  const config = getConfig();
  if (!config) return _originalFetch(input, init);

  let url =
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.toString()
        : (input as Request).url;

  // Prefix relative API paths with the configured server URL
  if (url.startsWith("/")) {
    url = config.serverUrl + url;
  }

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
    return _originalFetch(url, newInit);
  } else {
    return _originalFetch(new Request(url, input), newInit);
  }
};

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
