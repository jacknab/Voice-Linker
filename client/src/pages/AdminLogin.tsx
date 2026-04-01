import { useState } from "react";
import { useLocation } from "wouter";
import { Loader2, Eye, EyeOff, ShieldCheck } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

export default function AdminLogin() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const loginMutation = useMutation({
    mutationFn: (data: { email: string; password: string }) =>
      apiRequest("POST", "/api/admin/login", data),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/admin/me"] });
      setLocation("/admin");
    },
    onError: async (err: any) => {
      let message = "Login failed. Please check your credentials.";
      try {
        const body = await err.response?.json?.();
        if (body?.error) message = body.error;
      } catch {}
      toast({ title: "Access denied", description: message, variant: "destructive" });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;
    loginMutation.mutate({ email, password });
  };

  return (
    <div style={{ minHeight: "100vh", background: "#0a0a0a", display: "flex", alignItems: "center", justifyContent: "center", padding: "1.5rem" }}>
      <div style={{ width: "100%", maxWidth: "380px" }}>
        <div style={{ textAlign: "center", marginBottom: "2rem" }}>
          <div style={{ width: 48, height: 48, background: "#1d4ed8", borderRadius: "12px", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 1rem" }}>
            <ShieldCheck size={24} color="#fff" />
          </div>
          <h1 style={{ color: "#fff", fontSize: "1.25rem", fontWeight: 700, fontFamily: "monospace", letterSpacing: "0.05em", textTransform: "uppercase", marginBottom: "0.25rem" }}>
            Admin Access
          </h1>
          <p style={{ color: "#555", fontSize: "0.8rem", fontFamily: "monospace" }}>
            Restricted — authorised personnel only
          </p>
        </div>

        <form onSubmit={handleSubmit} style={{ background: "#111", border: "1px solid #222", borderRadius: "10px", padding: "1.75rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
            <label style={{ color: "#888", fontSize: "0.72rem", fontFamily: "monospace", letterSpacing: "0.08em", textTransform: "uppercase" }}>
              Email
            </label>
            <input
              data-testid="input-admin-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              style={{ background: "#0d0d0d", border: "1px solid #2a2a2a", borderRadius: "6px", padding: "0.6rem 0.9rem", color: "#fff", fontSize: "0.9rem", fontFamily: "monospace", outline: "none", transition: "border-color 0.15s" }}
              onFocus={e => (e.currentTarget.style.borderColor = "#1d4ed8")}
              onBlur={e => (e.currentTarget.style.borderColor = "#2a2a2a")}
            />
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
            <label style={{ color: "#888", fontSize: "0.72rem", fontFamily: "monospace", letterSpacing: "0.08em", textTransform: "uppercase" }}>
              Password
            </label>
            <div style={{ position: "relative" }}>
              <input
                data-testid="input-admin-password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                style={{ background: "#0d0d0d", border: "1px solid #2a2a2a", borderRadius: "6px", padding: "0.6rem 2.5rem 0.6rem 0.9rem", color: "#fff", fontSize: "0.9rem", fontFamily: "monospace", outline: "none", width: "100%", boxSizing: "border-box", transition: "border-color 0.15s" }}
                onFocus={e => (e.currentTarget.style.borderColor = "#1d4ed8")}
                onBlur={e => (e.currentTarget.style.borderColor = "#2a2a2a")}
              />
              <button
                type="button"
                data-testid="btn-toggle-password"
                onClick={() => setShowPassword(v => !v)}
                style={{ position: "absolute", right: "0.6rem", top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: "#555", cursor: "pointer", padding: "0.25rem", display: "flex" }}
              >
                {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </div>

          <button
            data-testid="btn-admin-login"
            type="submit"
            disabled={loginMutation.isPending || !email || !password}
            style={{ marginTop: "0.25rem", background: loginMutation.isPending || !email || !password ? "#1e3a8a" : "#1d4ed8", color: "#fff", border: "none", borderRadius: "6px", padding: "0.7rem", fontFamily: "monospace", fontWeight: 700, fontSize: "0.85rem", letterSpacing: "0.06em", textTransform: "uppercase", cursor: loginMutation.isPending || !email || !password ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "0.5rem", transition: "background 0.15s" }}
          >
            {loginMutation.isPending ? <><Loader2 size={14} className="animate-spin" /> Verifying…</> : "Sign In"}
          </button>
        </form>
      </div>
    </div>
  );
}
