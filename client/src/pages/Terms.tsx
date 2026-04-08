import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { SiteNav, SiteFooter, PageHeader, SiteSettings, formatPhone, DEFAULT_SITE_NAME } from "@/components/SiteLayout";

export default function Terms() {
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
      title: "1. Acceptance of Terms",
      body: [
        `By calling in to ${siteName} or accessing our website, you agree to be bound by these Terms of Use. If you do not agree to these terms, do not use the service.`,
        "We reserve the right to update these Terms at any time. Continued use of the service after changes are posted constitutes acceptance of the revised Terms.",
      ],
    },
    {
      title: "2. Eligibility — Age Requirement",
      body: [
        `You must be at least 18 years of age to use ${siteName}. By using the service, you represent and warrant that you are 18 or older.`,
        "We reserve the right to suspend or terminate any account we believe belongs to someone under the age of 18. If you believe a minor is using the service, please report it to us immediately.",
        `${siteName} assumes no liability for misrepresentation of age by users.`,
      ],
    },
    {
      title: "3. Permitted Use",
      body: [
        "The service is provided for personal, non-commercial use only.",
        "You may use the service to browse voice greetings, exchange voice messages, and connect live with other callers.",
        "You agree to use the service in a manner that is lawful, respectful, and consistent with these Terms.",
      ],
    },
    {
      title: "4. Prohibited Conduct",
      body: [
        "You may not use the service to harass, threaten, stalk, or intimidate other callers.",
        "You may not solicit money, gifts, or financial information from other callers.",
        "You may not impersonate any person or misrepresent your identity in a way intended to deceive others.",
        "You may not use the service for commercial solicitation, advertising, or spam of any kind.",
        "You may not attempt to circumvent or manipulate the service's billing, call routing, or moderation systems.",
        "You may not use automated dialing or call spoofing tools to interact with the service.",
        "Violation of these rules may result in immediate account suspension and/or termination without refund.",
      ],
    },
    {
      title: "5. Voice Content",
      body: [
        "You retain ownership of the voice recordings you create (greetings, messages). By recording them on our platform, you grant us a limited license to store and play them back to other callers as part of the service.",
        "You are solely responsible for the content of your recordings. Content must not be illegal, threatening, harassing, or in violation of any third party's rights.",
        "We reserve the right to remove any recording that violates these Terms or our community guidelines.",
      ],
    },
    {
      title: "6. Membership & Payments",
      body: [
        "Membership time is purchased in blocks of minutes. Time is deducted only while you are actively browsing or connected in the male box.",
        "All sales are final. We do not offer refunds for unused membership time except where required by applicable law.",
        "Payments are processed by Stripe. By providing payment information, you authorize us to charge your card for the selected plan.",
        "We reserve the right to change pricing at any time. Price changes will be communicated before they take effect.",
      ],
    },
    {
      title: "7. Free Trial",
      body: [
        "New callers receive a free trial of 90 minutes upon first calling in from a new phone number.",
        "The free trial is limited to one per phone number and expires 7 days from first use.",
        "We reserve the right to modify or discontinue the free trial offer at any time.",
      ],
    },
    {
      title: "8. Disclaimer of Warranties",
      body: [
        `${siteName} is provided "as is" and "as available" without warranties of any kind, either express or implied. We do not guarantee that the service will be uninterrupted, error-free, or free of harmful components.`,
        `We are not responsible for the conduct, content, or actions of any caller on the ${siteName} platform.`,
      ],
    },
    {
      title: "9. Limitation of Liability",
      body: [
        `To the fullest extent permitted by law, ${siteName} shall not be liable for any indirect, incidental, special, consequential, or punitive damages arising from your use of the service.`,
        `Our total liability to you for any claim arising out of or related to these Terms or the service shall not exceed the amount you paid us in the 30 days preceding the claim.`,
      ],
    },
    {
      title: "10. Termination",
      body: [
        "We reserve the right to suspend or terminate your access to the service at any time, for any reason, including violation of these Terms.",
        "You may stop using the service at any time. Your obligation to pay for services already rendered remains in effect.",
      ],
    },
    {
      title: "11. Governing Law",
      body: [
        "These Terms shall be governed by and construed in accordance with the laws of the United States, without regard to its conflict of law provisions.",
      ],
    },
    {
      title: "12. Contact",
      body: [
        `Questions about these Terms? Contact us:${csEmail ? "\n\nEmail: " + csEmail : ""}${csPhone ? "\n\nPhone: " + formatPhone(csPhone) : ""}`,
      ],
    },
  ];

  return (
    <div style={{ fontFamily: "'Inter', system-ui, sans-serif", background: "#0d0d0d", color: "#fff", minHeight: "100vh" }}>
      <SiteNav siteName={siteName} onMenuToggle={() => setMobileOpen(v => !v)} mobileOpen={mobileOpen} />

      <PageHeader
        eyebrow="Legal"
        title="Terms of Use"
        subtitle={`Last updated: ${updated}`}
      />

      <section style={{ padding: "3.5rem 1.5rem 5rem" }}>
        <div style={{ maxWidth: "720px", margin: "0 auto" }}>

          <p style={{ fontSize: "0.95rem", color: "rgba(255,255,255,0.6)", lineHeight: 1.85, marginBottom: "3rem", borderLeft: "3px solid #1d4ed8", paddingLeft: "1.25rem" }}>
            Please read these Terms of Use carefully before using {siteName}. These terms govern your access to and use of the voice chatline service and website.
          </p>

          <div style={{ display: "flex", flexDirection: "column", gap: "2.5rem" }}>
            {sections.map((s, i) => (
              <div key={i} data-testid={`terms-section-${i}`}>
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
