import { useState, useEffect } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
import { getConfig, saveConfig, clearConfig, type AdminConfig } from "./config";
import AdminPage from "./pages/Admin";

// ── Setup / Connection Screen ────────────────────────────────────────────────
function SetupScreen({ onSave }: { onSave: () => void }) {
  const [serverUrl, setServerUrl] = useState("https://");
  const [secretKey, setSecretKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [error, setError] = useState("");

  function handleSave() {
    setError("");
    const trimUrl = serverUrl.trim().replace(/\/$/, "");
    const trimKey = secretKey.trim();

    if (!trimUrl || trimUrl === "https://") {
      setError("Enter your production server URL.");
      return;
    }
    if (!trimUrl.startsWith("http")) {
      setError("URL must start with https:// or http://");
      return;
    }
    if (!trimKey) {
      setError("Enter the admin secret key.");
      return;
    }
    if (trimKey.length < 16) {
      setError("Secret key should be at least 16 characters.");
      return;
    }

    saveConfig({ serverUrl: trimUrl, secretKey: trimKey });
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
        borderRadius: 16, padding: "2.5rem 2rem", width: 420,
        maxWidth: "90vw",
      }}>
        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: "2rem" }}>
          <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "#e2e8f0", letterSpacing: "0.04em" }}>
            Male Box
          </div>
          <div style={{ fontSize: "0.7rem", color: "#4a6080", letterSpacing: "0.14em", marginTop: "0.25rem" }}>
            ADMIN CONSOLE — LOCAL ONLY
          </div>
        </div>

        {/* Server URL */}
        <div style={{ marginBottom: "1.25rem" }}>
          <label style={{ display: "block", fontSize: "0.68rem", color: "#6b84a8", letterSpacing: "0.1em", marginBottom: "0.5rem" }}>
            PRODUCTION SERVER URL
          </label>
          <input
            data-testid="input-setup-server-url"
            type="url"
            value={serverUrl}
            onChange={e => setServerUrl(e.target.value)}
            placeholder="https://your-app.replit.app"
            onKeyDown={e => e.key === "Enter" && handleSave()}
            style={{
              width: "100%", boxSizing: "border-box",
              background: "#1a2540", border: "1px solid #2a3d5e",
              borderRadius: 8, padding: "0.7rem 0.9rem",
              color: "#c8d8f0", fontSize: "0.82rem", outline: "none",
            }}
          />
        </div>

        {/* Secret Key */}
        <div style={{ marginBottom: "1.5rem" }}>
          <label style={{ display: "block", fontSize: "0.68rem", color: "#6b84a8", letterSpacing: "0.1em", marginBottom: "0.5rem" }}>
            ADMIN SECRET KEY
          </label>
          <div style={{ position: "relative" }}>
            <input
              data-testid="input-setup-secret-key"
              type={showKey ? "text" : "password"}
              value={secretKey}
              onChange={e => setSecretKey(e.target.value)}
              placeholder="Enter secret key…"
              onKeyDown={e => e.key === "Enter" && handleSave()}
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
          <p style={{ fontSize: "0.65rem", color: "#4a6080", marginTop: "0.5rem" }}>
            This key is stored only in your browser's local storage and never sent anywhere except your own server.
          </p>
        </div>

        {/* Error */}
        {error && (
          <div style={{
            background: "#3f1010", border: "1px solid #7f2020",
            borderRadius: 8, padding: "0.6rem 0.9rem",
            color: "#fca5a5", fontSize: "0.75rem", marginBottom: "1rem",
          }}>
            {error}
          </div>
        )}

        {/* Connect button */}
        <button
          data-testid="btn-setup-connect"
          onClick={handleSave}
          style={{
            width: "100%", padding: "0.85rem",
            background: "#22c55e", border: "none", borderRadius: 10,
            color: "#fff", fontFamily: "inherit", fontWeight: 700,
            fontSize: "0.88rem", letterSpacing: "0.06em", cursor: "pointer",
          }}
          onMouseEnter={e => (e.currentTarget.style.background = "#16a34a")}
          onMouseLeave={e => (e.currentTarget.style.background = "#22c55e")}
        >
          Connect to Server
        </button>

        <p style={{ fontSize: "0.65rem", color: "#4a6080", textAlign: "center", marginTop: "1.25rem" }}>
          These settings are saved locally and persist across restarts.
        </p>
      </div>
    </div>
  );
}

// ── Settings bar shown inside admin when already configured ──────────────────
function ConfigBar({ onDisconnect }: { onDisconnect: () => void }) {
  const cfg = getConfig();
  if (!cfg) return null;
  return (
    <div style={{
      background: "#0b1120", borderBottom: "1px solid #1a2a42",
      padding: "0.4rem 1rem", display: "flex", alignItems: "center",
      justifyContent: "space-between", fontFamily: "'IBM Plex Mono', monospace",
      fontSize: "0.68rem",
    }}>
      <span style={{ color: "#4a6080" }}>
        Connected to <span style={{ color: "#6b84a8" }}>{cfg.serverUrl}</span>
      </span>
      <button
        data-testid="btn-disconnect-server"
        onClick={onDisconnect}
        style={{
          background: "none", border: "1px solid #2a3d5e", borderRadius: 6,
          padding: "0.2rem 0.6rem", color: "#6b84a8", cursor: "pointer",
          fontFamily: "inherit", fontSize: "0.65rem", letterSpacing: "0.06em",
        }}
        onMouseEnter={e => (e.currentTarget.style.borderColor = "#ef4444")}
        onMouseLeave={e => (e.currentTarget.style.borderColor = "#2a3d5e")}
      >
        DISCONNECT
      </button>
    </div>
  );
}

// ── Root ──────────────────────────────────────────────────────────────────────
export default function App() {
  const [configured, setConfigured] = useState(false);

  useEffect(() => {
    setConfigured(getConfig() !== null);
  }, []);

  function handleSave() {
    setConfigured(true);
    // Clear all cached queries so they re-fetch against the new server
    queryClient.clear();
  }

  function handleDisconnect() {
    clearConfig();
    queryClient.clear();
    setConfigured(false);
  }

  if (!configured) {
    return <SetupScreen onSave={handleSave} />;
  }

  return (
    <QueryClientProvider client={queryClient}>
      <ConfigBar onDisconnect={handleDisconnect} />
      <AdminPage />
      <Toaster />
    </QueryClientProvider>
  );
}
