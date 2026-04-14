import { useState, useEffect } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
import { getConfig, saveConfig, clearConfig } from "./config";
import AdminPage from "./pages/Admin";

// ── Key Login Screen ──────────────────────────────────────────────────────────
function LoginScreen({ onSave }: { onSave: () => void }) {
  const [secretKey, setSecretKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [error, setError] = useState("");

  async function handleLogin() {
    setError("");
    const trimKey = secretKey.trim();

    if (!trimKey) {
      setError("Enter the admin secret key.");
      return;
    }
    if (trimKey.length < 8) {
      setError("Secret key too short.");
      return;
    }

    // Verify the key actually works before saving
    try {
      const res = await fetch("/api/admin/profiles", {
        headers: { "X-Admin-Key": trimKey },
        credentials: "include",
      });
      if (res.status === 403) {
        setError("Invalid admin key — access denied.");
        return;
      }
    } catch {
      setError("Could not reach the server. Please try again.");
      return;
    }

    saveConfig({ secretKey: trimKey });
    onSave();
  }

  return (
    <div style={{
      minHeight: "100vh", background: "#0d1424",
      display: "flex", alignItems: "center", justifyContent: "center",
      fontFamily: "'IBM Plex Mono', monospace",
    }}>
      <div style={{
        background: "#131d30", border: "1px solid #1e2d47",
        borderRadius: 16, padding: "2.5rem 2rem", width: 400,
        maxWidth: "90vw",
      }}>
        <div style={{ textAlign: "center", marginBottom: "2rem" }}>
          <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "#e2e8f0", letterSpacing: "0.04em" }}>
            Male Box
          </div>
          <div style={{ fontSize: "0.7rem", color: "#4a6080", letterSpacing: "0.14em", marginTop: "0.25rem" }}>
            ADMIN CONSOLE
          </div>
        </div>

        <div style={{ marginBottom: "1.5rem" }}>
          <label style={{ display: "block", fontSize: "0.68rem", color: "#6b84a8", letterSpacing: "0.1em", marginBottom: "0.5rem" }}>
            ADMIN SECRET KEY
          </label>
          <div style={{ position: "relative" }}>
            <input
              data-testid="input-admin-secret-key"
              type={showKey ? "text" : "password"}
              value={secretKey}
              onChange={e => setSecretKey(e.target.value)}
              placeholder="Enter admin key…"
              onKeyDown={e => e.key === "Enter" && handleLogin()}
              autoFocus
              style={{
                width: "100%", boxSizing: "border-box",
                background: "#1a2540", border: "1px solid #2a3d5e",
                borderRadius: 8, padding: "0.7rem 2.75rem 0.7rem 0.9rem",
                color: "#c8d8f0", fontSize: "0.82rem", outline: "none",
              }}
            />
            <button
              onClick={() => setShowKey(v => !v)}
              style={{
                position: "absolute", right: "0.75rem", top: "50%",
                transform: "translateY(-50%)", background: "none",
                border: "none", cursor: "pointer", color: "#4a6080",
                fontSize: "0.7rem", letterSpacing: "0.06em",
              }}
            >
              {showKey ? "HIDE" : "SHOW"}
            </button>
          </div>
        </div>

        {error && (
          <div style={{
            background: "#3f1010", border: "1px solid #7f2020",
            borderRadius: 8, padding: "0.6rem 0.9rem",
            color: "#fca5a5", fontSize: "0.75rem", marginBottom: "1rem",
          }}>
            {error}
          </div>
        )}

        <button
          data-testid="btn-admin-login"
          onClick={handleLogin}
          style={{
            width: "100%", padding: "0.85rem",
            background: "#22c55e", border: "none", borderRadius: 10,
            color: "#fff", fontFamily: "inherit", fontWeight: 700,
            fontSize: "0.88rem", letterSpacing: "0.06em", cursor: "pointer",
          }}
          onMouseEnter={e => (e.currentTarget.style.background = "#16a34a")}
          onMouseLeave={e => (e.currentTarget.style.background = "#22c55e")}
        >
          Access Admin Console
        </button>
      </div>
    </div>
  );
}

// ── Root ──────────────────────────────────────────────────────────────────────
export default function App() {
  const [configured, setConfigured] = useState(false);

  useEffect(() => {
    setConfigured(getConfig() !== null);
  }, []);

  function handleLogin() {
    setConfigured(true);
    queryClient.clear();
  }

  function handleLogout() {
    clearConfig();
    queryClient.clear();
    setConfigured(false);
  }

  if (!configured) {
    return <LoginScreen onSave={handleLogin} />;
  }

  return (
    <QueryClientProvider client={queryClient}>
      <AdminPage onLogout={handleLogout} />
      <Toaster />
    </QueryClientProvider>
  );
}
