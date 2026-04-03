import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Phone } from "lucide-react";
import { SiteNav, SiteFooter, PageHeader, SiteSettings, formatPhone, DEFAULT_SITE_NAME, DEFAULT_PHONE } from "@/components/SiteLayout";

export default function About() {
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
    ? "The most popular gay, bi & curious live chat line. Real guys, real voices."
    : "The most popular mixed live chat line. Real men, real women, real conversations.";

  const values = isMM
    ? [
        { title: "Privacy First", body: "Every call is completely anonymous. Your phone number is never revealed and your identity is yours to share — or keep private." },
        { title: "Real Connections", body: "No bots. No fake profiles. Every voice you hear belongs to a real person calling in at the same time you are." },
        { title: "Safe & Inclusive", body: "Phone Booth is a space for gay, bi, and curious men of all backgrounds. We moderate the system to keep it respectful and welcoming." },
        { title: "Available 24/7", body: "The line is always on. Whether it's noon or 3 AM, real guys are on the line ready to connect." },
      ]
    : [
        { title: "Privacy First", body: "Every call is completely anonymous. Your phone number is never revealed and your identity is yours to share — or keep private." },
        { title: "Real Connections", body: "No bots. No fake profiles. Every voice belongs to a real man or woman on the line right now." },
        { title: "Safe & Welcoming", body: "We maintain a respectful environment for everyone. Our moderation team reviews flagged content and removes anyone who violates our community standards." },
        { title: "Available 24/7", body: "The line never closes. Whenever you feel like connecting, someone is on the other end ready to talk." },
      ];

  const missionText = isMM
    ? `${siteName} is a live voice chatline built for gay, bi, and curious men who want real, private connections over the phone. We believe in the power of voice — no photos, no profiles, just real conversation. Since day one, our mission has been to give men a safe, anonymous, and easy way to meet others like them — on their own terms, from anywhere, at any time.`
    : `${siteName} is a live voice chatline built for men and women who want real, private connections over the phone. We believe in the power of voice — no photos, no scrolling, just real conversation between real people. Our mission is to give adults a safe, anonymous, and simple way to connect with others — on their own terms, from anywhere, at any time.`;

  const howText = isMM
    ? `When you call in, you hear real guys who are on the line at the same moment you are. Browse voice greetings, send messages to the ones that interest you, and connect live for a completely private one-on-one conversation. Everything runs through our system so your real phone number stays hidden. Your first 90 minutes are completely free.`
    : `When you call in, you hear real people who are on the line at the same moment you are. Men hear women's greetings and women hear men's. Browse, send voice messages, and connect live for a completely private two-way conversation. Everything runs through our system so your real number is never revealed. Your first 90 minutes are completely free.`;

  return (
    <div style={{ fontFamily: "'Inter', system-ui, sans-serif", background: "#0d0d0d", color: "#fff", minHeight: "100vh" }}>
      <SiteNav siteName={siteName} onMenuToggle={() => setMobileOpen(v => !v)} mobileOpen={mobileOpen} />

      <PageHeader
        eyebrow="Our Story"
        title={`About ${siteName}`}
        subtitle={isMM ? "The gay, bi & curious live chatline built on real voices." : "The live chatline for men and women — built on real voices."}
      />

      <section style={{ padding: "3.5rem 1.5rem 5rem" }}>
        <div style={{ maxWidth: "760px", margin: "0 auto" }}>

          {/* Mission */}
          <div style={{ marginBottom: "3rem" }}>
            <h2 style={{ fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", color: "#3b82f6", marginBottom: "1rem" }}>
              Our Mission
            </h2>
            <p style={{ fontSize: "1rem", color: "rgba(255,255,255,0.7)", lineHeight: 1.85, borderLeft: "3px solid #1d4ed8", paddingLeft: "1.25rem" }}
              data-testid="about-mission">
              {missionText}
            </p>
          </div>

          {/* How it works */}
          <div style={{ marginBottom: "3rem" }}>
            <h2 style={{ fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", color: "#3b82f6", marginBottom: "1rem" }}>
              How It Works
            </h2>
            <p style={{ fontSize: "0.95rem", color: "rgba(255,255,255,0.65)", lineHeight: 1.85 }}
              data-testid="about-how">
              {howText}
            </p>
          </div>

          {/* Values grid */}
          <div style={{ marginBottom: "3.5rem" }}>
            <h2 style={{ fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", color: "#3b82f6", marginBottom: "1.25rem" }}>
              What We Stand For
            </h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "1rem" }}>
              {values.map((v, i) => (
                <div key={i}
                  style={{ background: "#111", border: "1px solid #1e1e1e", borderRadius: "10px", padding: "1.25rem 1.4rem" }}
                  data-testid={`about-value-${i}`}>
                  <h3 style={{ fontSize: "0.92rem", fontWeight: 700, color: "#fff", marginBottom: "0.5rem" }}>{v.title}</h3>
                  <p style={{ fontSize: "0.85rem", color: "rgba(255,255,255,0.5)", lineHeight: 1.7, margin: 0 }}>{v.body}</p>
                </div>
              ))}
            </div>
          </div>

          {/* CTA */}
          <div style={{ background: "#111", border: "1px solid #1e1e1e", borderRadius: "12px", padding: "2rem", textAlign: "center" }}>
            <h3 style={{ fontSize: "1.1rem", fontWeight: 800, color: "#fff", marginBottom: "0.5rem" }}>
              Ready to try it?
            </h3>
            <p style={{ fontSize: "0.9rem", color: "rgba(255,255,255,0.5)", marginBottom: "1.5rem", lineHeight: 1.65 }}>
              Your first 90 minutes are completely free. No credit card required.
            </p>
            <a href={"tel:" + phone.replace(/\D/g, "")}
              style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem", background: "#1d4ed8", color: "#fff", textDecoration: "none", fontSize: "1rem", fontWeight: 800, padding: "0.7rem 2rem", borderRadius: "8px" }}
              data-testid="about-cta">
              <Phone className="w-4 h-4" /> Call {formatPhone(phone)}
            </a>
          </div>
        </div>
      </section>

      <SiteFooter siteName={siteName} footerBlurb={footerBlurb} csPhone={csPhone} csEmail={csEmail} />
    </div>
  );
}
