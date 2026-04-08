import { useEffect, useState } from "react";
import { Link } from "wouter";
import { Phone, CheckCircle, Loader2, AlertTriangle, ArrowRight, Clock } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { SiPaypal } from "react-icons/si";

const DEFAULT_SITE_NAME = "Male Box";

interface SiteSettings {
  siteName: string;
}

interface VerifyResult {
  ok: boolean;
  planName: string;
  planMinutes: number;
  linkedPhoneNumber: string;
  error?: string;
}

function formatTime(minutes: number): string {
  if (minutes >= 43200) return `${Math.round(minutes / 43200)} month`;
  if (minutes >= 10080) return `${Math.round(minutes / 10080)} weeks`;
  if (minutes >= 1440) return `${Math.round(minutes / 1440)} days`;
  if (minutes >= 60) return `${Math.round(minutes / 60)} hours`;
  return `${minutes} minutes`;
}

export default function MembershipSuccess() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [method, setMethod] = useState<"stripe" | "paypal" | null>(null);
  const [verifyError, setVerifyError] = useState<string | null>(null);

  const { data: siteData } = useQuery<SiteSettings>({ queryKey: ["/api/site-settings"], staleTime: 5 * 60 * 1000 });
  const siteName = siteData?.siteName || DEFAULT_SITE_NAME;

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const m = params.get("method");
    const sid = params.get("session_id");
    setMethod(m === "paypal" ? "paypal" : "stripe");
    setSessionId(sid);
  }, []);

  const { data: verifyData, isLoading: verifying } = useQuery<VerifyResult>({
    queryKey: ["/api/stripe/verify-checkout", sessionId],
    queryFn: async () => {
      const res = await fetch(`/api/stripe/verify-checkout/${sessionId}`, { credentials: "include" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Verification failed.");
      return data;
    },
    enabled: method === "stripe" && !!sessionId,
    retry: false,
    staleTime: Infinity,
  });

  useEffect(() => {
    if (verifyData && !verifyData.ok) {
      setVerifyError(verifyData.error || "Something went wrong.");
    }
  }, [verifyData]);

  const navBar = (
    <nav style={{ background: "#000", borderBottom: "1px solid #1a1a1a" }}>
      <div style={{ maxWidth: "1100px", margin: "0 auto", padding: "0 1.5rem", display: "flex", alignItems: "center", minHeight: "64px" }}>
        <Link href="/" style={{ display: "flex", alignItems: "center", gap: "0.5rem", textDecoration: "none" }}>
          <div style={{ width: 36, height: 36, background: "#1d4ed8", borderRadius: "8px", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Phone size={16} color="#fff" />
          </div>
          <span style={{ fontSize: "1rem", fontWeight: 800, color: "#fff" }}>{siteName}</span>
        </Link>
      </div>
    </nav>
  );

  const cardWrapper = (children: React.ReactNode) => (
    <div style={{ background: "#111", border: "1px solid #1e1e1e", borderRadius: "20px", padding: "3rem 2.5rem", maxWidth: "480px", width: "100%", textAlign: "center" }}>
      {children}
    </div>
  );

  const dashboardLink = (
    <Link
      href="/dashboard"
      data-testid="link-go-dashboard"
      style={{
        background: "linear-gradient(135deg, #3b82f6, #1d4ed8)",
        borderRadius: "10px",
        padding: "0.875rem 1.5rem",
        color: "#fff",
        textDecoration: "none",
        fontSize: "0.9rem",
        fontWeight: 700,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: "0.5rem",
      }}
    >
      Go to My Dashboard
      <ArrowRight size={16} />
    </Link>
  );

  const homeLink = (
    <Link href="/" data-testid="link-go-home" style={{ color: "#555", fontSize: "0.82rem", textDecoration: "none", display: "block" }}>
      Back to Home
    </Link>
  );

  return (
    <div
      data-testid="page-membership-success"
      style={{ fontFamily: "'Inter', system-ui, sans-serif", background: "#0d0d0d", minHeight: "100vh", display: "flex", flexDirection: "column" }}
    >
      {navBar}

      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "3rem 1.5rem" }}>

        {/* ── PayPal success (IPN-based — show pending confirmation) ── */}
        {method === "paypal" && cardWrapper(
          <div data-testid="status-paypal-success" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "1.25rem" }}>
            <div style={{ width: 80, height: 80, background: "#00308718", border: "1px solid #003087", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <SiPaypal size={36} color="#0070ba" />
            </div>

            <div>
              <h2 style={{ color: "#fff", fontSize: "1.5rem", fontWeight: 900, margin: "0 0 0.5rem", letterSpacing: "-0.02em" }}>
                Payment Received!
              </h2>
              <p style={{ color: "#666", fontSize: "0.9rem", lineHeight: 1.6, margin: 0 }}>
                Your PayPal payment was received. Your membership will be activated shortly once the transaction is confirmed.
              </p>
            </div>

            <div style={{ background: "#0d1a2e", border: "1px solid #1e3a5f", borderRadius: "12px", padding: "1rem 1.25rem", width: "100%", boxSizing: "border-box", display: "flex", alignItems: "flex-start", gap: "0.75rem", textAlign: "left" }}>
              <Clock size={16} color="#60a5fa" style={{ flexShrink: 0, marginTop: "0.1rem" }} />
              <p style={{ color: "#93c5fd", fontSize: "0.85rem", margin: 0, lineHeight: 1.6 }}>
                Activation typically happens within a few minutes. If your minutes don't appear on your dashboard after 10 minutes, please contact support.
              </p>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", width: "100%" }}>
              {dashboardLink}
              {homeLink}
            </div>
          </div>
        )}

        {/* ── Stripe success ── */}
        {method === "stripe" && cardWrapper(
          <>
            {verifying ? (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "1.25rem" }}>
                <Loader2 size={44} color="#1d4ed8" className="animate-spin" />
                <p style={{ color: "#aaa", fontSize: "1rem", margin: 0 }}>Confirming your payment…</p>
              </div>
            ) : verifyError || !verifyData ? (
              <div data-testid="status-verify-error" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "1.25rem" }}>
                <div style={{ width: 72, height: 72, background: "#2d0a0a", border: "1px solid #7f1d1d", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <AlertTriangle size={32} color="#f87171" />
                </div>
                <div>
                  <h2 style={{ color: "#fff", fontSize: "1.4rem", fontWeight: 800, margin: "0 0 0.5rem" }}>Payment not confirmed</h2>
                  <p style={{ color: "#666", fontSize: "0.9rem", lineHeight: 1.6, margin: 0 }}>
                    {verifyError || "We could not verify your payment. If you were charged, please contact support."}
                  </p>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", width: "100%" }}>
                  <Link
                    href="/membership"
                    data-testid="link-back-membership"
                    style={{ background: "#1a1a1a", border: "1px solid #2a2a2a", borderRadius: "10px", padding: "0.75rem 1.5rem", color: "#aaa", textDecoration: "none", fontSize: "0.875rem", fontWeight: 600, display: "block" }}
                  >
                    Back to Plans
                  </Link>
                </div>
              </div>
            ) : (
              <div data-testid="status-success" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "1.25rem" }}>
                <div style={{ width: 80, height: 80, background: "#14532d20", border: "1px solid #166534", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <CheckCircle size={38} color="#22c55e" />
                </div>

                <div>
                  <h2 style={{ color: "#fff", fontSize: "1.5rem", fontWeight: 900, margin: "0 0 0.5rem", letterSpacing: "-0.02em" }}>Membership Activated!</h2>
                  <p style={{ color: "#666", fontSize: "0.9rem", lineHeight: 1.6, margin: 0 }}>Your payment was successful and your membership has been applied.</p>
                </div>

                <div style={{ background: "#0d1a2e", border: "1px solid #1e3a5f", borderRadius: "12px", padding: "1.25rem 1.5rem", width: "100%", boxSizing: "border-box" }}>
                  <p style={{ color: "#555", fontSize: "0.7rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", margin: "0 0 0.75rem" }}>Your Plan</p>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ color: "#fff", fontWeight: 700, fontSize: "1rem" }} data-testid="text-plan-name">
                      {verifyData.planName} Membership
                    </span>
                    <span style={{ background: "#22c55e18", border: "1px solid #166534", borderRadius: "6px", padding: "0.15rem 0.6rem", color: "#22c55e", fontSize: "0.78rem", fontWeight: 700 }}>
                      Active
                    </span>
                  </div>
                  <p style={{ color: "#60a5fa", fontSize: "0.875rem", margin: "0.4rem 0 0" }} data-testid="text-plan-minutes">
                    {formatTime(verifyData.planMinutes)} of talk time added
                  </p>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", width: "100%" }}>
                  {dashboardLink}
                  {homeLink}
                </div>
              </div>
            )}
          </>
        )}

        {/* ── Loading while method is being read from URL ── */}
        {method === null && cardWrapper(
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "1.25rem" }}>
            <Loader2 size={44} color="#1d4ed8" className="animate-spin" />
            <p style={{ color: "#aaa", fontSize: "1rem", margin: 0 }}>Loading…</p>
          </div>
        )}
      </div>
    </div>
  );
}
