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
    ? "A gay, bi & curious live chat line. Real guys, real voices."
    : "A live chat line for men and women. Real voices, real conversations.";

  const updated = "January 1, 2025";

  const sections = [
    {
      title: "1. Who We Are",
      body: [
        `${siteName} is a live telephone chatline service operated by TJ Benjamin Group ("the Company", "we", "us", or "our"). This Privacy Policy describes how we collect, use, store, and protect the personal information of callers and web account holders who use the ${siteName} service.`,
        "By using the service — whether by phone or through our website — you consent to the practices described in this Privacy Policy.",
      ],
    },
    {
      title: "2. Information We Collect",
      body: [
        "Phone Number (Caller ID): When you call in to the service, we log your phone number via Caller ID. This is required for the service to function — it is how we identify your account, maintain your membership balance, and apply your settings. You cannot use the voice service anonymously from a blocked or unknown number.",
        "Voice Recordings: We store the voice greetings and voice messages you record within the service. These recordings are retained to make them available to other callers and are deleted when you re-record them, delete your account, or when our data retention schedule requires.",
        "Call Metadata: We log call-level data including call duration, timestamps, and the local access number dialed. This data is used for billing, service quality monitoring, and fraud prevention.",
        "Web Account Information: If you create a web account, we collect your email address and any profile details you voluntarily provide (such as membership card number). We do not require your real name.",
        "Payment Information: When you purchase a membership, your payment is processed by Stripe. We do not store your full credit card number, CVV, or full banking details. Stripe provides us with a tokenized reference used only to manage your subscription.",
        "Support Communications: If you contact our support team by phone, email, or through the website, we retain the content of those communications to assist you and improve our service.",
        "Technical Data: Our website may collect standard server log data including your IP address, browser type, and pages visited, used for security and performance monitoring.",
      ],
    },
    {
      title: "3. How We Use Your Information",
      body: [
        "To operate, maintain, and improve the telephone chatline service.",
        "To identify your account and apply your membership balance when you call in.",
        "To connect you with other callers in your area.",
        "To process payments, send billing receipts, and manage your membership.",
        "To enforce our Terms of Service, including age verification, blocked caller lists, and moderation.",
        "To respond to customer support requests and resolve billing disputes.",
        "To detect and prevent fraud, abuse, and unauthorized use of the service.",
        "To comply with applicable laws, regulations, and lawful requests from law enforcement or courts.",
        "We do not use your information for behavioral advertising. We do not sell, rent, or trade your personal information to third parties for their own marketing purposes.",
      ],
    },
    {
      title: "4. Caller Anonymity",
      body: [
        `${siteName} is designed with caller anonymity as a core feature. Your phone number is never revealed to other callers. All live connections between callers are routed through our telephony infrastructure so that neither party's actual phone number is disclosed during or after a conversation.`,
        "Other callers can only hear your recorded voice greeting and any personal information you voluntarily share within that greeting. We strongly recommend against sharing your real name, location, or contact details in your greeting.",
        "Your phone number is used internally only, as described in this Privacy Policy.",
      ],
    },
    {
      title: "5. Voice Message Privacy",
      body: [
        "Private voice messages exchanged between callers are stored on our servers and are accessible only to the intended recipient. They are not publicly broadcast.",
        "We do not routinely listen to or review private voice messages. However, we may access message content to investigate reported violations of our Terms of Service, respond to lawful legal process, or prevent harm.",
        "Voice messages are deleted from our servers once both parties have had a reasonable opportunity to listen to them, or upon account deletion.",
      ],
    },
    {
      title: "6. Cookies & Website Tracking",
      body: [
        "Our website uses session cookies to maintain your login state and keep you signed in to your web account. These cookies are essential to the website's functionality.",
        "We may use anonymized, aggregate analytics data (such as total page views and session counts) to understand how the website is being used and improve it. This data is not linked to individual identities.",
        "We do not use tracking cookies for advertising or cross-site profiling.",
        "You can disable cookies in your browser settings. Note that disabling cookies will prevent you from remaining logged in to your web account.",
      ],
    },
    {
      title: "7. Data Retention",
      body: [
        "Phone number and account records: Retained for as long as your account is active plus a period of up to 12 months following inactivity, after which records may be purged.",
        "Voice greetings: Retained until you re-record or delete them, or until your account is closed.",
        "Private voice messages: Retained for a reasonable playback window after delivery, then deleted.",
        "Call metadata (duration, timestamps): Retained for up to 12 months for billing verification and fraud prevention.",
        "Payment records: Retained for a minimum of 7 years as required by applicable financial record-keeping laws.",
        "Support communications: Retained for up to 24 months.",
        "To request early deletion of your data, please contact us using the information in Section 12.",
      ],
    },
    {
      title: "8. Third-Party Service Providers",
      body: [
        "Stripe, Inc. — payment processing. Your payment data is handled under Stripe's Privacy Policy and PCI-DSS compliance standards.",
        "Twilio, Inc. — telephone infrastructure, call routing, and voice recording storage. Call data is processed through Twilio's infrastructure under their Data Protection Addendum.",
        "ElevenLabs — text-to-speech technology used to generate certain automated system voice prompts. No caller personal data is shared with ElevenLabs.",
        "These providers act as our data processors. They are contractually required to handle your data only as directed by us and in accordance with applicable privacy law.",
        "We do not sell or share your personal information with any third party for their own independent marketing purposes.",
      ],
    },
    {
      title: "9. Children's Privacy",
      body: [
        `${siteName} is strictly an adult service for persons 18 years of age and older. We do not knowingly collect, store, or use personal information from anyone under 18.`,
        "If we become aware that a minor has accessed the service or provided us with personal information, we will take immediate steps to delete that information and terminate the account.",
        "If you believe a minor has used the service, please contact us immediately using the information in Section 12.",
      ],
    },
    {
      title: "10. Data Security",
      body: [
        "We take reasonable technical and organizational measures to protect your personal information from unauthorized access, disclosure, alteration, or destruction.",
        "Payment data is handled exclusively by Stripe using PCI-DSS compliant infrastructure. We never transmit or store raw credit card numbers.",
        "Access to account data within our organization is restricted to personnel who need it to provide or support the service.",
        "No method of data transmission over the internet or method of electronic storage is completely secure. While we strive to use commercially acceptable means to protect your information, we cannot guarantee absolute security.",
        "In the event of a data breach affecting your personal information, we will notify you as required by applicable law.",
      ],
    },
    {
      title: "11. Your Rights & Choices",
      body: [
        "Access: You may request a summary of the personal information we hold about your account.",
        "Correction: If any of your account information is inaccurate, you may request a correction.",
        "Deletion: You may request deletion of your account and associated personal data at any time, subject to our legal retention obligations.",
        "Opt-out: If you have provided an email address and no longer wish to receive service-related emails, you may contact us to opt out.",
        "To exercise any of these rights, please contact us using the details in Section 12. We will respond to verified requests within 30 days.",
        "Please note that certain data (such as call records needed for billing disputes) may need to be retained even after account deletion to comply with our legal obligations.",
      ],
    },
    {
      title: "12. Changes to This Policy",
      body: [
        "We may update this Privacy Policy from time to time to reflect changes in our practices, the service, or applicable law. The updated date at the top of this page indicates when the Policy was last revised.",
        "If we make material changes to how we handle your personal information, we will post a notice on our website prior to the changes taking effect.",
        "Your continued use of the service after any changes to this Privacy Policy constitutes your acceptance of the updated Policy.",
      ],
    },
    {
      title: "13. Contact Us",
      body: [
        `If you have questions about this Privacy Policy, wish to exercise your data rights, or need to report a privacy concern, please contact us:${csEmail ? "\n\nEmail: " + csEmail : ""}${csPhone ? "\n\nPhone: " + formatPhone(csPhone) : ""}`,
        "TJ Benjamin Group — Operator of " + siteName,
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
            TJ Benjamin Group, operator of {siteName}, is committed to protecting your privacy. This Privacy Policy explains what personal information we collect when you use our telephone chatline service and website, how we use and protect that information, and your rights regarding it.
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
