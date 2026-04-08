import { useState } from "react";
import { Link } from "wouter";
import { Phone, Loader2, CheckCircle } from "lucide-react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

const DEFAULT_SITE_NAME = "Male Box";

export default function ForgotPassword() {
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);

  const { data: siteData } = useQuery<{ siteName: string }>({
    queryKey: ["/api/site-settings"],
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
  const siteName = siteData?.siteName || DEFAULT_SITE_NAME;

  const forgotMutation = useMutation({
    mutationFn: (data: { email: string }) =>
      apiRequest("POST", "/api/auth/forgot-password", data),
    onSuccess: () => {
      setSent(true);
    },
    onError: () => {
      setSent(true);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    forgotMutation.mutate({ email });
  };

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
            {sent ? (
              <div style={{ textAlign: "center" }}>
                <CheckCircle size={48} color="#22c55e" style={{ margin: "0 auto 1rem" }} />
                <h1 style={{ color: "#fff", fontSize: "1.4rem", fontWeight: 700, marginBottom: "0.75rem" }}>Check your email</h1>
                <p style={{ color: "#888", fontSize: "0.9rem", lineHeight: 1.6, marginBottom: "2rem" }}>
                  If an account with that email exists, we've sent a link to reset your password. The link expires in 1 hour.
                </p>
                <Link href="/login"
                  style={{ display: "inline-block", background: "#1d4ed8", color: "#fff", padding: "0.65rem 1.5rem", borderRadius: "8px", textDecoration: "none", fontWeight: 700, fontSize: "0.9rem" }}
                  data-testid="link-back-to-login">
                  Back to sign in
                </Link>
              </div>
            ) : (
              <>
                <h1 style={{ color: "#fff", fontSize: "1.5rem", fontWeight: 700, marginBottom: "0.5rem", textAlign: "center" }}>
                  Forgot password?
                </h1>
                <p style={{ color: "#888", fontSize: "0.875rem", textAlign: "center", marginBottom: "2rem" }}>
                  Enter your email and we'll send you a reset link.
                </p>

                <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                  <div>
                    <label style={{ color: "#ccc", fontSize: "0.8rem", fontWeight: 600, display: "block", marginBottom: "0.4rem" }}>
                      Email
                    </label>
                    <input
                      type="email" value={email} onChange={e => setEmail(e.target.value)}
                      placeholder="you@example.com" required autoComplete="email"
                      data-testid="input-email"
                      style={{ width: "100%", background: "#1a1a1a", border: "1px solid #333", borderRadius: "8px", color: "#fff", fontSize: "0.9rem", padding: "0.65rem 0.875rem", outline: "none", boxSizing: "border-box" }}
                      onFocus={e => (e.target.style.borderColor = "#1d4ed8")}
                      onBlur={e => (e.target.style.borderColor = "#333")}
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={forgotMutation.isPending}
                    data-testid="button-send-reset"
                    style={{ background: "#1d4ed8", color: "#fff", border: "none", borderRadius: "8px", padding: "0.75rem", fontWeight: 700, fontSize: "0.9rem", cursor: forgotMutation.isPending ? "not-allowed" : "pointer", opacity: forgotMutation.isPending ? 0.7 : 1, display: "flex", alignItems: "center", justifyContent: "center", gap: "0.5rem", marginTop: "0.25rem" }}
                  >
                    {forgotMutation.isPending && <Loader2 size={16} className="animate-spin" />}
                    Send reset link
                  </button>
                </form>

                <p style={{ color: "#888", fontSize: "0.85rem", textAlign: "center", marginTop: "1.5rem" }}>
                  <Link href="/login" style={{ color: "#1d4ed8", textDecoration: "none", fontWeight: 600 }} data-testid="link-back-to-login">
                    Back to sign in
                  </Link>
                </p>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
