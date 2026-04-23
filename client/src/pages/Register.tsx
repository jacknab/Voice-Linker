import { useState } from "react";
import { Link, useLocation } from "wouter";
import { Loader2, Eye, EyeOff } from "lucide-react";
import { MaleBoxLogo, MaleBoxWordmark } from "@/components/SiteLayout";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useSEO } from "@/hooks/use-seo";

const DEFAULT_SITE_NAME = "Male Box";

export default function Register() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const { data: siteData } = useQuery<{ siteName: string }>({
    queryKey: ["/api/site-settings"],
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
  const siteName = siteData?.siteName || DEFAULT_SITE_NAME;

  useSEO({
    title: `Create Account — Join ${siteName} Today`,
    description: `Create a free ${siteName} account to manage your interactive male phone chat line membership, track your minutes, and link your phone number. Join today.`,
  });

  const registerMutation = useMutation({
    mutationFn: (data: { email: string; password: string }) =>
      apiRequest("POST", "/api/auth/register", data),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      setLocation("/dashboard");
    },
    onError: async (err: any) => {
      let message = "Registration failed. Please try again.";
      try {
        const body = await err.response?.json?.();
        if (body?.error) message = body.error;
      } catch {}
      toast({ title: "Registration failed", description: message, variant: "destructive" });
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
    registerMutation.mutate({ email, password });
  };

  const inputStyle: React.CSSProperties = {
    width: "100%", background: "#1a1a1a", border: "1px solid #333", borderRadius: "8px",
    color: "#fff", fontSize: "0.9rem", padding: "0.65rem 0.875rem", outline: "none", boxSizing: "border-box",
  };

  return (
    <div style={{ fontFamily: "'Inter', system-ui, sans-serif", background: "#0d0d0d", minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <nav style={{ background: "#000", borderBottom: "1px solid #1a1a1a" }}>
        <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "0 1.5rem", display: "flex", alignItems: "center", minHeight: "64px" }}>
          <Link href="/" style={{ display: "flex", alignItems: "center", gap: "0.625rem", textDecoration: "none" }}>
            <MaleBoxLogo size={36} />
            <span style={{ fontSize: "1.1rem" }}><MaleBoxWordmark /></span>
          </Link>
        </div>
      </nav>

      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "2rem 1rem" }}>
        <div style={{ width: "100%", maxWidth: "420px" }}>
          <div style={{ background: "#111", border: "1px solid #222", borderRadius: "16px", padding: "2.5rem 2rem" }}>
            <h1 style={{ color: "#fff", fontSize: "1.5rem", fontWeight: 700, marginBottom: "0.5rem", textAlign: "center" }}>
              Create account
            </h1>
            <p style={{ color: "#888", fontSize: "0.875rem", textAlign: "center", marginBottom: "2rem" }}>
              Join {siteName} today
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
                  style={inputStyle}
                  onFocus={e => (e.target.style.borderColor = "#1d4ed8")}
                  onBlur={e => (e.target.style.borderColor = "#333")}
                />
              </div>

              <div>
                <label style={{ color: "#ccc", fontSize: "0.8rem", fontWeight: 600, display: "block", marginBottom: "0.4rem" }}>
                  Password
                </label>
                <div style={{ position: "relative" }}>
                  <input
                    type={showPassword ? "text" : "password"} value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="At least 8 characters" required autoComplete="new-password"
                    data-testid="input-password"
                    style={{ ...inputStyle, paddingRight: "2.5rem" }}
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
                  Confirm password
                </label>
                <div style={{ position: "relative" }}>
                  <input
                    type={showConfirm ? "text" : "password"} value={confirm}
                    onChange={e => setConfirm(e.target.value)}
                    placeholder="Repeat your password" required autoComplete="new-password"
                    data-testid="input-confirm-password"
                    style={{ ...inputStyle, paddingRight: "2.5rem" }}
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
                disabled={registerMutation.isPending}
                data-testid="button-register"
                style={{ background: "#1d4ed8", color: "#fff", border: "none", borderRadius: "8px", padding: "0.75rem", fontWeight: 700, fontSize: "0.9rem", cursor: registerMutation.isPending ? "not-allowed" : "pointer", opacity: registerMutation.isPending ? 0.7 : 1, display: "flex", alignItems: "center", justifyContent: "center", gap: "0.5rem", marginTop: "0.5rem" }}
              >
                {registerMutation.isPending && <Loader2 size={16} className="animate-spin" />}
                Create account
              </button>
            </form>

            <p style={{ color: "#888", fontSize: "0.85rem", textAlign: "center", marginTop: "1.5rem" }}>
              Already have an account?{" "}
              <Link href="/login" style={{ color: "#1d4ed8", textDecoration: "none", fontWeight: 600 }} data-testid="link-login">
                Sign in
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
