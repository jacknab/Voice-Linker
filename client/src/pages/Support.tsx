import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Phone, Mail, MessageSquare, Clock, HelpCircle } from "lucide-react";
import { SiteNav, SiteFooter, PageHeader, SiteSettings, formatPhone, DEFAULT_SITE_NAME, DEFAULT_PHONE } from "@/components/SiteLayout";
import { Link } from "wouter";
import { useSEO } from "@/hooks/use-seo";

export default function Support() {
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

  useSEO({
    title: isMM
      ? `Customer Support — ${siteName} Gay Chat Line Help Center`
      : `Customer Support — ${siteName} Chat Line Help Center`,
    description: isMM
      ? `Need help with ${siteName}? Our support team is here for all questions about the interactive male phone chat line — billing, calling, membership, and more. Customer toll-free access available.`
      : `Need help with ${siteName}? Contact our support team for all questions about your singles phone chat line account — billing, calling, membership, and more.`,
  });

  const topics = [
    { icon: <Phone className="w-5 h-5" />, title: "Calling Issues", desc: "Trouble connecting, call quality, or being blocked by caller ID. Make sure your number isn't marked private before calling in.", href: "/faq" },
    { icon: <Clock className="w-5 h-5" />, title: "Membership & Billing", desc: "Questions about your account balance, purchasing time, or how deductions work.", href: "/faq" },
    { icon: <HelpCircle className="w-5 h-5" />, title: "How It Works", desc: "New to the system? Learn how to record a greeting, browse profiles, and connect live.", href: "/faq" },
    { icon: <MessageSquare className="w-5 h-5" />, title: "Keypad Reference", desc: "Not sure which key to press? Our full keypad guide covers every screen in the system.", href: "/keypad-tips" },
  ];

  return (
    <div style={{ fontFamily: "'Inter', system-ui, sans-serif", background: "#0d0d0d", color: "#fff", minHeight: "100vh" }}>
      <SiteNav siteName={siteName} onMenuToggle={() => setMobileOpen(v => !v)} mobileOpen={mobileOpen} />

      <PageHeader
        eyebrow="Help Center"
        title="Customer Support"
        subtitle={`We're here to help you get the most out of ${siteName}. Browse the topics below or reach out to us directly.`}
      />

      <section style={{ padding: "3.5rem 1.5rem 5rem" }}>
        <div style={{ maxWidth: "760px", margin: "0 auto" }}>

          {/* Contact cards */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "1rem", marginBottom: "3.5rem" }}>
            {/* Main line */}
            <div style={{ background: "#111", border: "1px solid #1e1e1e", borderRadius: "12px", padding: "1.5rem" }} data-testid="support-card-main">
              <div style={{ width: 40, height: 40, borderRadius: "10px", background: "rgba(29,78,216,0.15)", border: "1px solid rgba(29,78,216,0.35)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: "1rem" }}>
                <Phone className="w-5 h-5 text-blue-400" />
              </div>
              <h3 style={{ fontSize: "0.92rem", fontWeight: 700, color: "#fff", marginBottom: "0.35rem" }}>Call In</h3>
              <p style={{ fontSize: "0.82rem", color: "rgba(255,255,255,0.45)", lineHeight: 1.6, marginBottom: "1rem" }}>
                Dial in to the system and press 7 from the main menu to reach customer service.
              </p>
              <a href={"tel:" + phone.replace(/\D/g, "")}
                style={{ fontSize: "0.9rem", fontWeight: 700, color: "#60a5fa", textDecoration: "none" }}
                data-testid="support-phone-main">
                {formatPhone(phone)}
              </a>
            </div>

            {/* CS phone */}
            {csPhone && (
              <div style={{ background: "#111", border: "1px solid #1e1e1e", borderRadius: "12px", padding: "1.5rem" }} data-testid="support-card-cs-phone">
                <div style={{ width: 40, height: 40, borderRadius: "10px", background: "rgba(22,163,74,0.15)", border: "1px solid rgba(22,163,74,0.35)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: "1rem" }}>
                  <Phone className="w-5 h-5 text-green-400" />
                </div>
                <h3 style={{ fontSize: "0.92rem", fontWeight: 700, color: "#fff", marginBottom: "0.35rem" }}>Support Line</h3>
                <p style={{ fontSize: "0.82rem", color: "rgba(255,255,255,0.45)", lineHeight: 1.6, marginBottom: "1rem" }}>
                  Speak directly with a member of our support team.
                </p>
                <a href={"tel:" + csPhone.replace(/\D/g, "")}
                  style={{ fontSize: "0.9rem", fontWeight: 700, color: "#4ade80", textDecoration: "none" }}
                  data-testid="support-phone-cs">
                  {formatPhone(csPhone)}
                </a>
              </div>
            )}

            {/* CS email */}
            {csEmail && (
              <div style={{ background: "#111", border: "1px solid #1e1e1e", borderRadius: "12px", padding: "1.5rem" }} data-testid="support-card-email">
                <div style={{ width: 40, height: 40, borderRadius: "10px", background: "rgba(147,51,234,0.15)", border: "1px solid rgba(147,51,234,0.35)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: "1rem" }}>
                  <Mail className="w-5 h-5 text-purple-400" />
                </div>
                <h3 style={{ fontSize: "0.92rem", fontWeight: 700, color: "#fff", marginBottom: "0.35rem" }}>Email Support</h3>
                <p style={{ fontSize: "0.82rem", color: "rgba(255,255,255,0.45)", lineHeight: 1.6, marginBottom: "1rem" }}>
                  Send us a message and we'll get back to you as soon as possible.
                </p>
                <a href={"mailto:" + csEmail}
                  style={{ fontSize: "0.9rem", fontWeight: 700, color: "#c084fc", textDecoration: "none" }}
                  data-testid="support-email">
                  {csEmail}
                </a>
              </div>
            )}
          </div>

          {/* Common topics */}
          <h2 style={{ fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", color: "#3b82f6", marginBottom: "1.25rem" }}>
            Common Topics
          </h2>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", marginBottom: "3.5rem" }}>
            {topics.map((t, i) => (
              <Link key={i} href={t.href}
                style={{ display: "flex", alignItems: "flex-start", gap: "1rem", background: "#111", border: "1px solid #1e1e1e", borderRadius: "10px", padding: "1.1rem 1.25rem", textDecoration: "none", transition: "border-color 0.15s" }}
                onMouseEnter={(e: any) => (e.currentTarget.style.borderColor = "#2a2a2a")}
                onMouseLeave={(e: any) => (e.currentTarget.style.borderColor = "#1e1e1e")}
                data-testid={`support-topic-${i}`}>
                <div style={{ color: "rgba(255,255,255,0.35)", flexShrink: 0, marginTop: "0.1rem" }}>{t.icon}</div>
                <div>
                  <p style={{ fontSize: "0.92rem", fontWeight: 600, color: "#fff", margin: "0 0 0.25rem" }}>{t.title}</p>
                  <p style={{ fontSize: "0.82rem", color: "rgba(255,255,255,0.45)", lineHeight: 1.6, margin: 0 }}>{t.desc}</p>
                </div>
              </Link>
            ))}
          </div>

          {/* Hours note */}
          <div style={{ background: "rgba(29,78,216,0.08)", border: "1px solid rgba(29,78,216,0.25)", borderRadius: "10px", padding: "1.25rem 1.5rem", display: "flex", gap: "0.75rem", alignItems: "flex-start" }}>
            <Clock className="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5" />
            <p style={{ fontSize: "0.85rem", color: "rgba(255,255,255,0.6)", lineHeight: 1.65, margin: 0 }}>
              The voice system is available <strong style={{ color: "#fff" }}>24 hours a day, 7 days a week</strong>. For billing or account questions outside of the voice system, please email us and we'll respond within one business day.
            </p>
          </div>
        </div>
      </section>

      <SiteFooter siteName={siteName} footerBlurb={footerBlurb} csPhone={csPhone} csEmail={csEmail} />
    </div>
  );
}
