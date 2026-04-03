import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { SiteNav, SiteFooter, PageHeader, SiteSettings, formatPhone, DEFAULT_SITE_NAME } from "@/components/SiteLayout";

export default function PrivacyPolicy() {
  const [mobileOpen, setMobileOpen] = useState(false);

  const { data: siteData } = useQuery<SiteSettings>({
    queryKey: ["/api/site-settings"],
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  const siteName = siteData?.siteName || DEFAULT_SITE_NAME;
  const csEmail = siteData?.customerServiceEmail || null;
  const csPhone = siteData?.customerServicePhone || null;
  const isMM = (siteData?.siteCategory ?? "MM") === "MM";
  const footerBlurb = isMM
    ? "The most popular gay, bi & curious live chat line. Real guys, real voices."
    : "The most popular mixed live chat line. Real men, real women, real conversations.";

  const updated = "January 1, 2025";

  const sections = [
    {
      title: "1. Information We Collect",
      body: [
        `When you call in to ${siteName}, we log your phone number (Caller ID) in order to associate your account, membership, and settings with your number. This is required for the service to function.`,
        "When you create a web account, we collect your email address and any profile information you voluntarily provide.",
        "When you purchase a membership, your payment is processed by Stripe. We do not store your full credit card number on our servers — only a tokenized reference provided by Stripe.",
        "We may log call metadata (duration, timestamps, region) for billing and fraud prevention purposes.",
        "We record voice greetings and messages that you create within the system. These recordings are stored to make them available to other callers and are deleted when you re-record or close your account.",
      ],
    },
    {
      title: "2. How We Use Your Information",
      body: [
        "To operate the voice chatline service and maintain your account.",
        "To process payments and manage your membership balance.",
        "To connect you with other callers in your region.",
        "To enforce our Terms of Use, including age verification and blocking requirements.",
        "To respond to customer support inquiries.",
        "We do not sell, rent, or share your personal information with third parties for marketing purposes.",
      ],
    },
    {
      title: "3. Your Phone Number & Anonymity",
      body: [
        `Your phone number is never displayed to other callers on ${siteName}. All voice connections are routed through our telephony system.`,
        "Other callers can only hear your recorded voice greeting and any information you voluntarily share within it.",
        "Your phone number may be used internally to associate your account, detect fraud, and comply with legal obligations.",
      ],
    },
    {
      title: "4. Cookies & Web Analytics",
      body: [
        "Our website may use cookies to maintain your login session and remember your preferences.",
        "We may use anonymized analytics data (page views, session duration) to improve the website. This data is not linked to your personal identity.",
        "You can disable cookies in your browser settings. Some website features may not function properly without cookies.",
      ],
    },
    {
      title: "5. Data Retention",
      body: [
        "Voice greetings and messages are retained as long as your account is active or until you re-record them.",
        "Call metadata is retained for up to 12 months for billing and fraud prevention.",
        "Web account data is retained until you request account deletion.",
        "To request deletion of your data, contact us using the information below.",
      ],
    },
    {
      title: "6. Third-Party Services",
      body: [
        "We use Stripe for payment processing. Stripe's privacy policy governs how they handle your payment information.",
        "We use Twilio to provide voice telephony services. Call metadata is processed through Twilio's infrastructure.",
        "We may use ElevenLabs for text-to-speech audio generation of system prompts.",
        "These service providers are bound by their own privacy policies and applicable law.",
      ],
    },
    {
      title: "7. Children's Privacy",
      body: [
        `${siteName} is intended for adults 18 years of age and older. We do not knowingly collect personal information from anyone under the age of 18. If you believe a minor has used the service, please contact us immediately.`,
      ],
    },
    {
      title: "8. Security",
      body: [
        "We take reasonable technical and organizational measures to protect your information from unauthorized access, disclosure, or misuse.",
        "Payment data is handled exclusively by Stripe using PCI-DSS compliant infrastructure.",
        "No method of transmission over the internet or method of electronic storage is 100% secure. We cannot guarantee absolute security.",
      ],
    },
    {
      title: "9. Changes to This Policy",
      body: [
        "We may update this Privacy Policy from time to time. The date at the top of this page reflects when it was last revised.",
        "Continued use of the service after changes are posted constitutes your acceptance of the updated policy.",
      ],
    },
    {
      title: "10. Contact Us",
      body: [
        `If you have questions about this Privacy Policy or wish to request deletion of your data, please contact us:${csEmail ? "\n\nEmail: " + csEmail : ""}${csPhone ? "\n\nPhone: " + formatPhone(csPhone) : ""}`,
      ],
    },
  ];

  return (
    <div style={{ fontFamily: "'Inter', system-ui, sans-serif", background: "#0d0d0d", color: "#fff", minHeight: "100vh" }}>
      <SiteNav siteName={siteName} onMenuToggle={() => setMobileOpen(v => !v)} mobileOpen={mobileOpen} />

      <PageHeader
        eyebrow="Legal"
        title="Privacy Policy"
        subtitle={`Last updated: ${updated}`}
      />

      <section style={{ padding: "3.5rem 1.5rem 5rem" }}>
        <div style={{ maxWidth: "720px", margin: "0 auto" }}>

          <p style={{ fontSize: "0.95rem", color: "rgba(255,255,255,0.6)", lineHeight: 1.85, marginBottom: "3rem", borderLeft: "3px solid #1d4ed8", paddingLeft: "1.25rem" }}>
            {siteName} ("we," "us," or "our") is committed to protecting your privacy. This Privacy Policy explains what information we collect, how we use it, and your choices regarding your data.
          </p>

          <div style={{ display: "flex", flexDirection: "column", gap: "2.5rem" }}>
            {sections.map((s, i) => (
              <div key={i} data-testid={`privacy-section-${i}`}>
                <h2 style={{ fontSize: "1rem", fontWeight: 700, color: "#fff", marginBottom: "0.9rem" }}>{s.title}</h2>
                <div style={{ display: "flex", flexDirection: "column", gap: "0.65rem" }}>
                  {s.body.map((para, j) => (
                    <p key={j} style={{ fontSize: "0.88rem", color: "rgba(255,255,255,0.6)", lineHeight: 1.8, margin: 0, whiteSpace: "pre-line" }}>
                      {para}
                    </p>
                  ))}
                </div>
                {i < sections.length - 1 && (
                  <div style={{ borderBottom: "1px solid #1a1a1a", marginTop: "2.5rem" }} />
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      <SiteFooter siteName={siteName} footerBlurb={footerBlurb} csPhone={csPhone} csEmail={csEmail} />
    </div>
  );
}
