import { useState } from "react";
import { Link, useLocation } from "wouter";
import { Phone, Star, Zap, Clock, CheckCircle, ArrowRight, Loader2, Lock, Shield, AlertTriangle } from "lucide-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

const DEFAULT_SITE_NAME = "Phone Booth";

interface SiteSettings {
  siteName: string;
  fallbackPhoneNumber: string;
}

interface MembershipSettings {
  freeTrialMinutes: number;
  plan1Name: string; plan1Minutes: number; plan1PriceCents: number;
  plan2Name: string; plan2Minutes: number; plan2PriceCents: number;
  plan3Name: string; plan3Minutes: number; plan3PriceCents: number;
  bonusPlanKey: string | null;
  billingMode: string;
}

interface WebUser {
  id: string;
  email: string;
  linkedPhoneNumber: string | null;
}

function formatPrice(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function formatTime(minutes: number): { value: string; unit: string } {
  if (minutes >= 43200) return { value: String(Math.round(minutes / 43200)), unit: "month" };
  if (minutes >= 10080) return { value: String(Math.round(minutes / 10080)), unit: "weeks" };
  if (minutes >= 1440) return { value: String(Math.round(minutes / 1440)), unit: "days" };
  if (minutes >= 60) return { value: String(Math.round(minutes / 60)), unit: "hours" };
  return { value: String(minutes), unit: "min" };
}

const PLAN_CONFIG = [
  {
    key: "plan1",
    icon: Star,
    gradient: "linear-gradient(135deg, #f59e0b, #d97706)",
    accentColor: "#f59e0b",
    glowColor: "#f59e0b30",
    badge: "Most Popular",
    perks: ["Unlimited access", "Priority connections", "Premium support"],
  },
  {
    key: "plan2",
    icon: Zap,
    gradient: "linear-gradient(135deg, #3b82f6, #1d4ed8)",
    accentColor: "#3b82f6",
    glowColor: "#3b82f630",
    badge: null,
    perks: ["Full access", "Standard connections", "Email support"],
  },
  {
    key: "plan3",
    icon: Clock,
    gradient: "linear-gradient(135deg, #6b7280, #4b5563)",
    accentColor: "#9ca3af",
    glowColor: "#6b728030",
    badge: "Try it out",
    perks: ["24-hour access", "Basic connections", "Self-serve support"],
  },
];

export default function Membership() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [purchasingPlan, setPurchasingPlan] = useState<string | null>(null);

  const { data: siteData } = useQuery<SiteSettings>({
    queryKey: ["/api/site-settings"],
    staleTime: 5 * 60 * 1000,
  });
  const siteName = siteData?.siteName || DEFAULT_SITE_NAME;

  const { data: settings, isLoading: settingsLoading } = useQuery<MembershipSettings>({
    queryKey: ["/api/membership-settings"],
    staleTime: 5 * 60 * 1000,
  });

  const { data: me, isLoading: authLoading } = useQuery<WebUser>({
    queryKey: ["/api/auth/me"],
    retry: false,
  });

  const checkoutMutation = useMutation({
    mutationFn: async (planKey: string) => {
      const res = await apiRequest("POST", "/api/stripe/create-web-checkout", { planKey });
      return res.json() as Promise<{ url: string; error?: string }>;
    },
    onSuccess: (data) => {
      if (data.url) {
        window.location.href = data.url;
      } else {
        toast({ title: "Error", description: data.error || "Unable to start checkout.", variant: "destructive" });
        setPurchasingPlan(null);
      }
    },
    onError: async (err: any) => {
      let message = "Failed to start checkout. Please try again.";
      try {
        const b = await err.response?.json?.();
        if (b?.error) message = b.error;
      } catch {}
      toast({ title: "Error", description: message, variant: "destructive" });
      setPurchasingPlan(null);
    },
  });

  const handlePurchase = (planKey: string) => {
    if (!me) {
      setLocation(`/login?redirect=/membership`);
      return;
    }
    setPurchasingPlan(planKey);
    checkoutMutation.mutate(planKey);
  };

  const isLoading = settingsLoading || authLoading;

  const plans = settings
    ? [
        { ...PLAN_CONFIG[0], name: settings.plan1Name, minutes: settings.plan1Minutes, priceCents: settings.plan1PriceCents },
        { ...PLAN_CONFIG[1], name: settings.plan2Name, minutes: settings.plan2Minutes, priceCents: settings.plan2PriceCents },
        { ...PLAN_CONFIG[2], name: settings.plan3Name, minutes: settings.plan3Minutes, priceCents: settings.plan3PriceCents },
      ]
    : [];

  return (
    <div
      data-testid="page-membership"
      style={{
        fontFamily: "'Inter', system-ui, sans-serif",
        background: "#0d0d0d",
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Nav */}
      <nav style={{ background: "#000", borderBottom: "1px solid #1a1a1a", position: "sticky", top: 0, zIndex: 10 }}>
        <div
          style={{
            maxWidth: "1100px",
            margin: "0 auto",
            padding: "0 1.5rem",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            minHeight: "64px",
          }}
        >
          <Link href="/" style={{ display: "flex", alignItems: "center", gap: "0.5rem", textDecoration: "none" }}>
            <div
              style={{
                width: 36,
                height: 36,
                background: "#1d4ed8",
                borderRadius: "8px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Phone size={16} color="#fff" />
            </div>
            <span style={{ fontSize: "1rem", fontWeight: 800, color: "#fff" }}>{siteName}</span>
          </Link>
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            {me ? (
              <Link
                href="/dashboard"
                data-testid="link-dashboard"
                style={{
                  background: "#1d4ed8",
                  color: "#fff",
                  borderRadius: "8px",
                  padding: "0.45rem 1rem",
                  fontSize: "0.82rem",
                  fontWeight: 600,
                  textDecoration: "none",
                }}
              >
                My Dashboard
              </Link>
            ) : (
              <>
                <Link
                  href="/login"
                  data-testid="link-login"
                  style={{ color: "#aaa", fontSize: "0.875rem", textDecoration: "none" }}
                >
                  Log in
                </Link>
                <Link
                  href="/register"
                  data-testid="link-register"
                  style={{
                    background: "#1d4ed8",
                    color: "#fff",
                    borderRadius: "8px",
                    padding: "0.45rem 1rem",
                    fontSize: "0.82rem",
                    fontWeight: 600,
                    textDecoration: "none",
                  }}
                >
                  Register
                </Link>
              </>
            )}
          </div>
        </div>
      </nav>

      <div style={{ flex: 1, maxWidth: "1100px", margin: "0 auto", padding: "4rem 1.5rem 5rem", width: "100%", boxSizing: "border-box" }}>
        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: "3.5rem" }}>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.4rem",
              background: "#1d4ed815",
              border: "1px solid #1d4ed830",
              borderRadius: "100px",
              padding: "0.3rem 0.9rem",
              marginBottom: "1.25rem",
            }}
          >
            <Shield size={12} color="#60a5fa" />
            <span style={{ color: "#60a5fa", fontSize: "0.75rem", fontWeight: 600, letterSpacing: "0.04em" }}>
              SECURE CHECKOUT
            </span>
          </div>
          <h1
            style={{
              color: "#fff",
              fontSize: "clamp(2rem, 5vw, 3rem)",
              fontWeight: 900,
              margin: "0 0 1rem",
              letterSpacing: "-0.03em",
              lineHeight: 1.1,
            }}
          >
            Choose Your Membership
          </h1>
          <p style={{ color: "#666", fontSize: "1.05rem", margin: 0, maxWidth: "520px", marginInline: "auto", lineHeight: 1.6 }}>
            Get instant access to {siteName}. Purchase once, talk freely.
          </p>
        </div>

        {/* Auth / phone notice */}
        {!authLoading && me && !me.linkedPhoneNumber && (
          <div
            data-testid="notice-link-phone"
            style={{
              background: "#1c1a00",
              border: "1px solid #fbbf2440",
              borderRadius: "12px",
              padding: "1rem 1.25rem",
              marginBottom: "2.5rem",
              display: "flex",
              alignItems: "flex-start",
              gap: "0.75rem",
            }}
          >
            <AlertTriangle size={18} color="#fbbf24" style={{ flexShrink: 0, marginTop: "0.1rem" }} />
            <div>
              <p style={{ color: "#fbbf24", fontSize: "0.875rem", fontWeight: 700, margin: "0 0 0.2rem" }}>
                Phone number required before purchase
              </p>
              <p style={{ color: "#92783a", fontSize: "0.82rem", margin: 0, lineHeight: 1.5 }}>
                You need to link a phone number to your account first.{" "}
                <Link href="/dashboard" style={{ color: "#fbbf24", textDecoration: "underline" }}>
                  Go to your dashboard
                </Link>{" "}
                to link your phone, then come back to purchase.
              </p>
            </div>
          </div>
        )}

        {!authLoading && !me && (
          <div
            data-testid="notice-login"
            style={{
              background: "#0d1a2e",
              border: "1px solid #1e3a5f",
              borderRadius: "12px",
              padding: "1rem 1.25rem",
              marginBottom: "2.5rem",
              display: "flex",
              alignItems: "center",
              gap: "0.75rem",
            }}
          >
            <Lock size={16} color="#60a5fa" />
            <p style={{ color: "#93c5fd", fontSize: "0.875rem", margin: 0 }}>
              <Link href="/login" style={{ color: "#60a5fa", fontWeight: 700, textDecoration: "underline" }}>
                Log in
              </Link>{" "}
              or{" "}
              <Link href="/register" style={{ color: "#60a5fa", fontWeight: 700, textDecoration: "underline" }}>
                create an account
              </Link>{" "}
              to purchase a membership.
            </p>
          </div>
        )}

        {/* Plans grid */}
        {isLoading ? (
          <div style={{ display: "flex", justifyContent: "center", padding: "4rem 0" }}>
            <Loader2 size={36} color="#1d4ed8" className="animate-spin" />
          </div>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
              gap: "1.25rem",
              alignItems: "stretch",
            }}
          >
            {plans.map((plan) => {
              const Icon = plan.icon;
              const timeDisplay = formatTime(plan.minutes);
              const isBuying = purchasingPlan === plan.key;
              const isHighlighted = plan.key === "plan1";
              const canBuy = !!me && !!me.linkedPhoneNumber;

              return (
                <div
                  key={plan.key}
                  data-testid={`card-plan-${plan.key}`}
                  style={{
                    background: isHighlighted ? "#0e1a30" : "#111",
                    border: `1px solid ${isHighlighted ? "#1d4ed840" : "#1e1e1e"}`,
                    borderRadius: "18px",
                    padding: "1.75rem",
                    display: "flex",
                    flexDirection: "column",
                    position: "relative",
                    boxShadow: isHighlighted ? `0 0 40px ${plan.glowColor}` : "none",
                    transition: "transform 0.15s, box-shadow 0.15s",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = "translateY(-2px)";
                    e.currentTarget.style.boxShadow = `0 8px 40px ${plan.glowColor}`;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = "translateY(0)";
                    e.currentTarget.style.boxShadow = isHighlighted ? `0 0 40px ${plan.glowColor}` : "none";
                  }}
                >
                  {/* Badge */}
                  {plan.badge && (
                    <div
                      style={{
                        position: "absolute",
                        top: "-1px",
                        left: "50%",
                        transform: "translateX(-50%)",
                        background: plan.gradient,
                        borderRadius: "0 0 8px 8px",
                        padding: "0.2rem 0.85rem",
                        fontSize: "0.68rem",
                        fontWeight: 800,
                        color: "#fff",
                        letterSpacing: "0.06em",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {plan.badge.toUpperCase()}
                    </div>
                  )}

                  {/* Icon */}
                  <div
                    style={{
                      width: 48,
                      height: 48,
                      background: `${plan.accentColor}18`,
                      border: `1px solid ${plan.accentColor}30`,
                      borderRadius: "12px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      marginBottom: "1.25rem",
                      marginTop: plan.badge ? "0.75rem" : "0",
                    }}
                  >
                    <Icon size={22} color={plan.accentColor} />
                  </div>

                  {/* Plan name */}
                  <h2 style={{ color: "#fff", fontSize: "1.15rem", fontWeight: 800, margin: "0 0 0.35rem", letterSpacing: "-0.01em" }}>
                    {plan.name}
                  </h2>

                  {/* Time */}
                  <div style={{ marginBottom: "1.25rem" }}>
                    <span style={{ color: plan.accentColor, fontSize: "2.25rem", fontWeight: 900, lineHeight: 1, letterSpacing: "-0.03em" }}>
                      {timeDisplay.value}
                    </span>
                    <span style={{ color: "#666", fontSize: "0.95rem", marginLeft: "0.4rem" }}>
                      {timeDisplay.unit} of talk time
                    </span>
                  </div>

                  {/* Price */}
                  <div style={{ marginBottom: "1.5rem" }}>
                    <span style={{ color: "#fff", fontSize: "2rem", fontWeight: 900, letterSpacing: "-0.03em" }}>
                      {formatPrice(plan.priceCents)}
                    </span>
                    <span style={{ color: "#555", fontSize: "0.82rem", marginLeft: "0.4rem" }}>one-time</span>
                  </div>

                  {/* Perks */}
                  <ul style={{ listStyle: "none", padding: 0, margin: "0 0 1.75rem", display: "flex", flexDirection: "column", gap: "0.55rem", flex: 1 }}>
                    {plan.perks.map((perk) => (
                      <li key={perk} style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                        <CheckCircle size={14} color={plan.accentColor} />
                        <span style={{ color: "#aaa", fontSize: "0.85rem" }}>{perk}</span>
                      </li>
                    ))}
                  </ul>

                  {/* CTA button */}
                  <button
                    data-testid={`button-buy-${plan.key}`}
                    onClick={() => handlePurchase(plan.key)}
                    disabled={isBuying || checkoutMutation.isPending}
                    style={{
                      background: canBuy ? plan.gradient : "#1a1a1a",
                      color: canBuy ? "#fff" : "#555",
                      border: canBuy ? "none" : "1px solid #2a2a2a",
                      borderRadius: "10px",
                      padding: "0.825rem 1.25rem",
                      fontWeight: 700,
                      fontSize: "0.9rem",
                      cursor: canBuy && !checkoutMutation.isPending ? "pointer" : "not-allowed",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "0.5rem",
                      width: "100%",
                      opacity: isBuying || (checkoutMutation.isPending && purchasingPlan !== plan.key) ? 0.6 : 1,
                      transition: "opacity 0.15s",
                    }}
                  >
                    {isBuying ? (
                      <>
                        <Loader2 size={16} className="animate-spin" />
                        Redirecting…
                      </>
                    ) : canBuy ? (
                      <>
                        Get {plan.name}
                        <ArrowRight size={16} />
                      </>
                    ) : (
                      <>
                        <Lock size={14} />
                        {me ? "Link phone to buy" : "Log in to buy"}
                      </>
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {/* Trust badges */}
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            justifyContent: "center",
            gap: "2rem",
            marginTop: "3rem",
            paddingTop: "2rem",
            borderTop: "1px solid #1a1a1a",
          }}
        >
          {[
            { icon: Shield, label: "Secure payment via Stripe" },
            { icon: Lock, label: "256-bit SSL encryption" },
            { icon: CheckCircle, label: "Instant activation" },
          ].map(({ icon: Icon, label }) => (
            <div key={label} style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <Icon size={14} color="#444" />
              <span style={{ color: "#444", fontSize: "0.8rem" }}>{label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
