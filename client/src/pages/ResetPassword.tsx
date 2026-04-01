import { useState } from "react";
import { Link, useLocation } from "wouter";
import { Phone, Loader2, Eye, EyeOff, CheckCircle, XCircle } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

const DEFAULT_SITE_NAME = "Phone Booth";

function useToken(): string {
  if (typeof window === "undefined") return "";
  const params = new URLSearchParams(window.location.search);
  return params.get("token") || "";
}

export default function ResetPassword() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const token = useToken();

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [success, setSuccess] = useState(false);

  const { data: siteData } = useQuery<{ siteName: string }>({
    queryKey: ["/api/site-settings"],
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
  const siteName = siteData?.siteName || DEFAULT_SITE_NAME;

  const resetMutation = useMutation({
    mutationFn: (data: { token: string; password: string }) =>
      apiRequest("POST", "/api/auth/reset-password", data),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      setSuccess(true);
      setTimeout(() => setLocation("/dashboard"), 2000);
    },
    onError: async (err: any) => {
      let message = "Password reset failed. Please try again.";
      try {
        const body = await err.response?.json?.();
        if (body?.error) message = body.error;
      } catch {}
      toast({ title: "Reset failed", description: message, variant: "destructive" });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) {
      toast({ title: "Password too short", description: "Password must be at least 8 characters.", variant: "destructive" });
      return;
    }
    if (password !== confirm) {
      toast({ title: "Passwords don't match", description: "Please make sure both passwords are the same.", variant: "destructive" });
      return;
    }
    resetMutation.mutate({ token, password });
  };

  const inputStyle: React.CSSProperties = {
    width: "100%", background: "#1a1a1a", border: "1px solid #333", borderRadius: "8px",
    color: "#fff", fontSize: "0.9rem", outline: "none", boxSizing: "border-box",
  };

  if (!token) {
    return (
      <div style={{ fontFamily: "'Inter', system-ui, sans-serif", background: "#0d0d0d", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ background: "#111", border: "1px solid #222", borderRadius: "16px", padding: "2.5rem 2rem", maxWidth: 420, width: "100%", textAlign: "center" }}>
          <XCircle size={48} color="#ef4444" style={{ margin: "0 auto 1rem" }} />
          <h1 style={{ color: "#fff", fontSize: "1.4rem", fontWeight: 700, marginBottom: "0.75rem" }}>Invalid link</h1>
          <p style={{ color: "#888", marginBottom: "1.5rem" }}>This reset link is missing or invalid.</p>
          <Link href="/forgot-password" style={{ display: "inline-block", background: "#1d4ed8", color: "#fff", padding: "0.65rem 1.5rem", borderRadius: "8px", textDecoration: "none", fontWeight: 700 }}>
            Request a new link
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div style={{ fontFamily: "'Inter', system-ui, sans-serif", background: "#0d0d0d", minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <nav style={{ background: "#000", borderBottom: "1px solid #1a1a1a" }}>
        <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "0 1.5rem", display: "flex", alignItems: "center", minHeight: "64px" }}>
          <Link href="/" style={{ display: "flex", alignItems: "center", gap: "0.5rem", textDecoration: "none" }}>
            <div style={{ width: 36, height: 36, background: "#1d4ed8", borderRadius: "8px", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Phone size={16} color="#fff" />
            </div>
            <span style={{ fontSize: "1rem", fontWeight: 800, color: "#fff" }}>{siteName}</span>
          </Link>
        </div>
      </nav>

      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "2rem 1rem" }}>
        <div style={{ width: "100%", maxWidth: "420px" }}>
          <div style={{ background: "#111", border: "1px solid #222", borderRadius: "16px", padding: "2.5rem 2rem" }}>
            {success ? (
              <div style={{ textAlign: "center" }}>
                <CheckCircle size={48} color="#22c55e" style={{ margin: "0 auto 1rem" }} />
                <h1 style={{ color: "#fff", fontSize: "1.4rem", fontWeight: 700, marginBottom: "0.75rem" }}>Password updated!</h1>
                <p style={{ color: "#888", fontSize: "0.9rem" }}>You're now signed in. Redirecting you shortly…</p>
              </div>
            ) : (
              <>
                <h1 style={{ color: "#fff", fontSize: "1.5rem", fontWeight: 700, marginBottom: "0.5rem", textAlign: "center" }}>
                  Set new password
                </h1>
                <p style={{ color: "#888", fontSize: "0.875rem", textAlign: "center", marginBottom: "2rem" }}>
                  Choose a strong password for your account.
                </p>

                <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                  <div>
                    <label style={{ color: "#ccc", fontSize: "0.8rem", fontWeight: 600, display: "block", marginBottom: "0.4rem" }}>
                      New password
                    </label>
                    <div style={{ position: "relative" }}>
                      <input
                        type={showPassword ? "text" : "password"} value={password}
                        onChange={e => setPassword(e.target.value)}
                        placeholder="At least 8 characters" required autoComplete="new-password"
                        data-testid="input-password"
                        style={{ ...inputStyle, padding: "0.65rem 2.5rem 0.65rem 0.875rem" }}
                        onFocus={e => (e.target.style.borderColor = "#1d4ed8")}
                        onBlur={e => (e.target.style.borderColor = "#333")}
                      />
                      <button type="button" onClick={() => setShowPassword(v => !v)}
                        data-testid="button-toggle-password"
                        style={{ position: "absolute", right: "0.75rem", top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "#888", padding: 0, display: "flex" }}>
                        {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label style={{ color: "#ccc", fontSize: "0.8rem", fontWeight: 600, display: "block", marginBottom: "0.4rem" }}>
                      Confirm new password
                    </label>
                    <div style={{ position: "relative" }}>
                      <input
                        type={showConfirm ? "text" : "password"} value={confirm}
                        onChange={e => setConfirm(e.target.value)}
                        placeholder="Repeat your password" required autoComplete="new-password"
                        data-testid="input-confirm-password"
                        style={{ ...inputStyle, padding: "0.65rem 2.5rem 0.65rem 0.875rem" }}
                        onFocus={e => (e.target.style.borderColor = "#1d4ed8")}
                        onBlur={e => (e.target.style.borderColor = "#333")}
                      />
                      <button type="button" onClick={() => setShowConfirm(v => !v)}
                        data-testid="button-toggle-confirm"
                        style={{ position: "absolute", right: "0.75rem", top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "#888", padding: 0, display: "flex" }}>
                        {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={resetMutation.isPending}
                    data-testid="button-reset-password"
                    style={{ background: "#1d4ed8", color: "#fff", border: "none", borderRadius: "8px", padding: "0.75rem", fontWeight: 700, fontSize: "0.9rem", cursor: resetMutation.isPending ? "not-allowed" : "pointer", opacity: resetMutation.isPending ? 0.7 : 1, display: "flex", alignItems: "center", justifyContent: "center", gap: "0.5rem", marginTop: "0.5rem" }}
                  >
                    {resetMutation.isPending && <Loader2 size={16} className="animate-spin" />}
                    Update password
                  </button>
                </form>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
