import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Shield, EyeOff, AlertTriangle, Phone, Flag, Lock } from "lucide-react";
import { SiteNav, SiteFooter, PageHeader, SiteSettings, formatPhone, DEFAULT_SITE_NAME, DEFAULT_PHONE } from "@/components/SiteLayout";

export default function SafetyTips() {
  const [mobileOpen, setMobileOpen] = useState(false);

  const { data: siteData } = useQuery<SiteSettings>({
    queryKey: ["/api/site-settings"],
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  const siteName = siteData?.siteName || DEFAULT_SITE_NAME;
  const phone = siteData?.fallbackPhoneNumber || DEFAULT_PHONE;
  const csEmail = siteData?.customerServiceEmail || null;
  const csPhone = siteData?.customerServicePhone || null;
  const isMM = (siteData?.siteCategory ?? "MM") === "MM";
  const footerBlurb = isMM
    ? "A gay, bi & curious live chat line. Real guys, real voices."
    : "A live chat line for men and women. Real voices, real conversations.";

  const tips = [
    {
      icon: <EyeOff className="w-5 h-5" />,
      color: "#60a5fa",
      bg: "rgba(29,78,216,0.12)",
      border: "rgba(29,78,216,0.3)",
      title: "Stay Anonymous",
      points: [
        "Your phone number is never shown to other callers — all connections are routed through our system.",
        `Never share personal information in your greeting or during a conversation — no full name, address, workplace, or social media handles.`,
        "Use a prepaid phone if you prefer complete anonymity.",
        "Your voice greeting is the only thing other callers can hear about you — keep it general and fun.",
      ],
    },
    {
      icon: <Shield className="w-5 h-5" />,
      color: "#4ade80",
      bg: "rgba(22,163,74,0.12)",
      border: "rgba(22,163,74,0.3)",
      title: "Protect Your Safety",
      points: [
        "All callers must be 18 years of age or older. If you believe someone is underage, report them immediately by pressing 7 while on their profile.",
        isMM
          ? "If you decide to meet someone from the chatline in person, always meet in a public place first."
          : "If you plan to meet someone from the chatline in person, meet in a public location and let a trusted person know where you're going.",
        "Trust your instincts — if a conversation makes you uncomfortable, hang up or press 4 to block the caller.",
        "Never feel pressured to continue a conversation or connect live if you don't want to.",
      ],
    },
    {
      icon: <Lock className="w-5 h-5" />,
      color: "#c084fc",
      bg: "rgba(147,51,234,0.12)",
      border: "rgba(147,51,234,0.3)",
      title: "Protect Your Account",
      points: [
        "Your membership is linked to your phone number. Do not share your phone or PIN with others.",
        "If you set up a 4-digit PIN to call from multiple phones, keep it private.",
        "Monitor your membership balance. If you notice unexpected deductions, contact our support team.",
        "Never share your web account password with anyone.",
      ],
    },
    {
      icon: <Flag className="w-5 h-5" />,
      color: "#fbbf24",
      bg: "rgba(217,119,6,0.12)",
      border: "rgba(217,119,6,0.3)",
      title: "Report & Block",
      points: [
        "Press 4 at any time while listening to a greeting to block that caller permanently. They will never appear to you again.",
        "Press 7 while listening to a profile or message to flag it for our moderation team. We take all reports seriously.",
        "Our team reviews flagged content and removes callers who violate our community guidelines.",
        `If you experience serious harassment or threats, contact our support team directly${csPhone ? " at " + formatPhone(csPhone) : ""}${csEmail ? " or " + csEmail : ""}.`,
      ],
    },
    {
      icon: <AlertTriangle className="w-5 h-5" />,
      color: "#f87171",
      bg: "rgba(220,38,38,0.12)",
      border: "rgba(220,38,38,0.3)",
      title: "Warning Signs",
      points: [
        "Be cautious of anyone who pressures you for personal information, money, or gifts.",
        "Be wary of callers who claim to be in emergency situations and ask for financial help — this is a common scam.",
        "Callers who ask you to call them on a different number may be attempting to bypass the system's anonymity protections.",
        `${siteName} will never ask for your payment details over the voice system beyond our standard checkout flow.`,
      ],
    },
  ];

  return (
    <div style={{ fontFamily: "'Inter', system-ui, sans-serif", background: "#0d0d0d", color: "#fff", minHeight: "100vh" }}>
      <SiteNav siteName={siteName} onMenuToggle={() => setMobileOpen(v => !v)} mobileOpen={mobileOpen} />

      <PageHeader
        eyebrow="Your Safety"
        title="Safety Tips"
        subtitle={`${siteName} is designed to be anonymous and fun. These guidelines help you get the most out of the experience while staying safe.`}
      />

      <section style={{ padding: "3.5rem 1.5rem 5rem" }}>
        <div style={{ maxWidth: "760px", margin: "0 auto" }}>

          {/* Tips sections */}
          <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem", marginBottom: "3rem" }}>
            {tips.map((tip, i) => (
              <div key={i}
                style={{ background: "#111", border: "1px solid #1e1e1e", borderRadius: "12px", overflow: "hidden" }}
                data-testid={`safety-section-${i}`}>
                {/* Header */}
                <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", padding: "1.1rem 1.4rem", background: tip.bg, borderBottom: `1px solid ${tip.border}` }}>
                  <div style={{ color: tip.color }}>{tip.icon}</div>
                  <h2 style={{ fontSize: "0.95rem", fontWeight: 700, color: "#fff", margin: 0 }}>{tip.title}</h2>
                </div>
                {/* Points */}
                <ul style={{ listStyle: "none", padding: "1rem 1.4rem 1.25rem", margin: 0, display: "flex", flexDirection: "column", gap: "0.65rem" }}>
                  {tip.points.map((pt, j) => (
                    <li key={j} style={{ display: "flex", gap: "0.65rem", alignItems: "flex-start" }}>
                      <span style={{ width: 5, height: 5, borderRadius: "50%", background: tip.color, flexShrink: 0, marginTop: "0.45rem" }} />
                      <span style={{ fontSize: "0.88rem", color: "rgba(255,255,255,0.65)", lineHeight: 1.7 }}>{pt}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          {/* Reminder pill */}
          <div style={{ background: "rgba(29,78,216,0.08)", border: "1px solid rgba(29,78,216,0.25)", borderRadius: "10px", padding: "1.5rem", display: "flex", gap: "1rem", alignItems: "flex-start" }}>
            <Phone className="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5" />
            <div>
              <p style={{ fontSize: "0.9rem", fontWeight: 600, color: "#fff", margin: "0 0 0.35rem" }}>
                Need help right now?
              </p>
              <p style={{ fontSize: "0.85rem", color: "rgba(255,255,255,0.55)", margin: 0, lineHeight: 1.65 }}>
                Dial in and press 7 from the main menu for customer service{csPhone ? `, or call our support line at ${formatPhone(csPhone)}` : ""}{csEmail ? `, or email us at ${csEmail}` : ""}.
              </p>
            </div>
          </div>
        </div>
      </section>

      <SiteFooter siteName={siteName} footerBlurb={footerBlurb} csPhone={csPhone} csEmail={csEmail} />
    </div>
  );
}
