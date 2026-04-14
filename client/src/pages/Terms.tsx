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
        `By calling in to ${siteName}, accessing our website, or creating a web account, you acknowledge that you have read, understood, and agree to be bound by these Terms of Service and our Privacy Policy. If you do not agree with any part of these terms, you must immediately discontinue use of the service.`,
        "TJ Benjamin Group (\"the Company\", \"we\", \"us\", or \"our\") reserves the right to modify these Terms at any time. We will post revised Terms on this page with an updated effective date. Your continued use of the service after any modification constitutes acceptance of the revised Terms.",
      ],
    },
    {
      title: "2. Age Requirement — Adults Only",
      body: [
        `${siteName} is an adult telephone chat service intended exclusively for persons who are 18 years of age or older. By using this service, you represent and warrant that you are at least 18 years old and have the legal capacity to enter into this agreement.`,
        "We reserve the right to suspend, terminate, or restrict access to any account we have reason to believe is being used by a person under the age of 18, at our sole discretion and without prior notice.",
        "If you become aware that a minor is accessing the service, please contact us immediately.",
        `${siteName} and TJ Benjamin Group assume no liability for any misrepresentation of age by users.`,
      ],
    },
    {
      title: "3. Description of Service",
      body: [
        `${siteName} is a live voice chatline that allows adult callers to listen to voice greetings, exchange private voice messages, and connect live in real-time voice conversations with other callers. The service is fully voice-based and operates through the public telephone network.`,
        "The service is available 24 hours a day, 7 days a week, subject to scheduled maintenance and circumstances beyond our control. We do not guarantee uninterrupted availability.",
        "Callers interact with the service through a touchtone keypad menu system. No internet connection is required to use the voice service, though a web account is available for account management and membership purchases.",
      ],
    },
    {
      title: "4. Permitted Use",
      body: [
        "The service is provided for your personal, non-commercial use only.",
        "You may use the service to browse and listen to caller voice greetings, record and maintain your own voice greeting, send and receive private voice messages, and connect live with other consenting adult callers.",
        "You agree to use the service in a manner that is lawful, respectful of other callers, and consistent with these Terms.",
        "You are solely responsible for all activity that occurs under your phone number and web account.",
      ],
    },
    {
      title: "5. Prohibited Conduct",
      body: [
        "You may not use the service for any unlawful purpose or in violation of any applicable local, state, national, or international law or regulation.",
        "You may not harass, threaten, stalk, intimidate, bully, demean, or engage in hate speech toward other callers.",
        "You may not solicit money, gifts, financial information, personal contact details, or any other items of value from other callers.",
        "You may not impersonate any other person, misrepresent your identity, or create a false impression about yourself in a manner intended to deceive others.",
        "You may not use the service to advertise, solicit, or promote any commercial product, service, or business of any kind.",
        "You may not record or distribute conversations with other callers without their explicit consent.",
        "You may not attempt to circumvent, manipulate, or exploit any aspect of the service's billing, call routing, authentication, or moderation systems.",
        "You may not use automated dialers, call-spoofing tools, voice changers, or any other technology to misrepresent who you are or artificially interact with the service.",
        "You may not share, sell, or transfer your account or membership to another person.",
        "Violation of any of the above may result in immediate and permanent account termination without refund. We reserve the right to report unlawful conduct to the appropriate authorities.",
      ],
    },
    {
      title: "6. Voice Content & Recordings",
      body: [
        "The service allows you to create voice greetings and voice messages. You retain ownership of the voice recordings you create. By recording them on our platform, you grant TJ Benjamin Group a limited, non-exclusive, royalty-free license to store, transmit, and play back those recordings to other callers as part of providing the service.",
        "You are solely responsible for the content of any voice recording you create. Recordings must not contain content that is unlawful, threatening, harassing, obscene in a manner that is not consensual, or in violation of any third party's rights.",
        "We reserve the right, but are not obligated, to monitor, review, and remove any recording that violates these Terms, our community standards, or applicable law. Removal may occur without prior notice.",
        "Voice messages between callers are private and are not reviewed in real time. However, we may access message content when investigating reported violations or responding to lawful legal process.",
        "Recordings are stored only for as long as they are needed to provide the service and are deleted when you re-record your greeting, delete your account, or upon our routine data retention schedule.",
      ],
    },
    {
      title: "7. Membership, Billing & Payment",
      body: [
        `${siteName} offers membership time packages that allow you to access the live portions of the service. Membership time is measured in minutes and is deducted only while you are actively connected inside the live service.`,
        "All purchases are final. We do not offer refunds for unused membership time, except where required by applicable consumer protection law. If you believe you have been charged in error, please contact our customer support team.",
        "Payments are processed by Stripe, Inc. By providing your payment information, you authorize us to charge your card for the amount of the plan selected. All transactions are subject to Stripe's Terms of Service and Privacy Policy.",
        "We reserve the right to change membership prices at any time. Price changes will be announced before they take effect and will not apply to time you have already purchased.",
        "Membership time does not expire unless otherwise stated at the time of purchase.",
        "If a payment fails or a chargeback is filed, we reserve the right to suspend your account until the matter is resolved. Repeated fraudulent chargebacks may result in permanent termination and legal action.",
      ],
    },
    {
      title: "8. Free Trial",
      body: [
        `New callers may be offered a complimentary free trial of up to 90 minutes upon first calling from a new phone number, subject to availability. The free trial is limited to one per unique phone number.`,
        "Free trial time is valid for 7 days from the date of first use and will expire automatically if not used within that period.",
        "The free trial is intended for genuine new callers only. Attempts to obtain multiple free trials through different phone numbers or by any other means constitutes abuse of the system and may result in account restrictions.",
        "We reserve the right to modify, limit, or discontinue the free trial offer at any time without notice.",
      ],
    },
    {
      title: "9. Caller Anonymity & Phone Numbers",
      body: [
        `${siteName} is designed to protect your privacy. Your telephone number is never disclosed to other callers. All live connections are routed through our telephony system so that neither party's real number is revealed during a call.`,
        "While your number is anonymized to other callers, it is used internally to identify your account, maintain your membership balance, and enforce service rules.",
        "You may not attempt to share or discover another caller's real phone number through any means.",
      ],
    },
    {
      title: "10. Emergency Services Disclaimer",
      body: [
        `${siteName} is NOT a substitute for emergency services. If you or someone else is in danger or in need of immediate assistance, call 911 or your local emergency number immediately.`,
        "Do not use this service to contact emergency services. We cannot guarantee call routing to emergency services and are not equipped to handle emergency situations.",
      ],
    },
    {
      title: "11. Disclaimer of Warranties",
      body: [
        `${siteName} is provided on an "as is" and "as available" basis without warranties of any kind, either express or implied, including but not limited to warranties of merchantability, fitness for a particular purpose, or non-infringement.`,
        "We do not warrant that the service will be uninterrupted, error-free, secure, or free of viruses or other harmful components. We do not guarantee the accuracy, reliability, or completeness of any information provided through the service.",
        `TJ Benjamin Group is not responsible for the conduct, content, or actions of any caller using the ${siteName} platform. Any interactions with other callers are at your own risk.`,
      ],
    },
    {
      title: "12. Limitation of Liability",
      body: [
        `To the fullest extent permitted by applicable law, TJ Benjamin Group, its officers, directors, employees, agents, and licensors shall not be liable for any indirect, incidental, special, consequential, exemplary, or punitive damages, including but not limited to loss of profits, loss of data, or loss of goodwill, arising out of or relating to your use of — or inability to use — the service.`,
        `In no event shall our total cumulative liability to you for all claims arising out of or relating to these Terms or the service exceed the total amount you actually paid us during the 90-day period immediately preceding the event giving rise to the claim.`,
        "Some jurisdictions do not allow the exclusion or limitation of certain types of liability, so some of the above limitations may not apply to you.",
      ],
    },
    {
      title: "13. Indemnification",
      body: [
        `You agree to indemnify, defend, and hold harmless TJ Benjamin Group, its affiliates, officers, directors, employees, and agents from and against any claims, liabilities, damages, losses, and expenses (including reasonable legal fees) arising out of or in any way connected with: (a) your access to or use of the service; (b) your violation of these Terms; (c) your violation of any third-party right, including any privacy or intellectual property right; or (d) any claim that your voice recordings caused damage to a third party.`,
      ],
    },
    {
      title: "14. Termination",
      body: [
        "We reserve the right to suspend, restrict, or permanently terminate your access to the service at any time, for any reason, with or without notice, including but not limited to violation of these Terms, fraudulent activity, abuse of the free trial, or conduct we determine to be harmful to other callers.",
        "Upon termination, your right to use the service ceases immediately. Unused membership time remaining at the time of a termination for cause will be forfeited without refund.",
        "You may stop using the service at any time. Any obligation to pay for services already rendered survives termination.",
      ],
    },
    {
      title: "15. Governing Law & Dispute Resolution",
      body: [
        "These Terms shall be governed by and construed in accordance with the laws of the United States and the state in which TJ Benjamin Group is registered, without regard to any conflict of law provisions.",
        "Any dispute arising out of or relating to these Terms or the service that cannot be resolved informally shall be submitted to binding arbitration on an individual basis. You waive any right to participate in a class-action lawsuit or class-wide arbitration.",
        "Before initiating arbitration, you agree to first contact us in writing and attempt to resolve the dispute informally for at least 30 days.",
      ],
    },
    {
      title: "16. Entire Agreement",
      body: [
        "These Terms, together with our Privacy Policy, constitute the entire agreement between you and TJ Benjamin Group with respect to your use of the service and supersede all prior agreements, understandings, and representations.",
        "If any provision of these Terms is found to be invalid or unenforceable, the remaining provisions will remain in full force and effect.",
      ],
    },
    {
      title: "17. Contact",
      body: [
        `If you have questions, concerns, or complaints about these Terms of Service, please contact us:${csEmail ? "\n\nEmail: " + csEmail : ""}${csPhone ? "\n\nPhone: " + formatPhone(csPhone) : ""}`,
        "TJ Benjamin Group — Operator of " + siteName,
      ],
    },
  ];

  return (
    <div style={{ fontFamily: "'Inter', system-ui, sans-serif", background: "#0d0d0d", color: "#fff", minHeight: "100vh" }}>
      <SiteNav siteName={siteName} onMenuToggle={() => setMobileOpen(v => !v)} mobileOpen={mobileOpen} />

      <PageHeader
        eyebrow="Legal"
        title="Terms of Service"
        subtitle={`Last updated: ${updated}`}
      />

      <section style={{ padding: "3.5rem 1.5rem 5rem" }}>
        <div style={{ maxWidth: "720px", margin: "0 auto" }}>

          <p style={{ fontSize: "0.95rem", color: "rgba(255,255,255,0.6)", lineHeight: 1.85, marginBottom: "3rem", borderLeft: "3px solid #1d4ed8", paddingLeft: "1.25rem" }}>
            Please read these Terms of Service carefully before using {siteName}. These terms form a legally binding agreement between you and TJ Benjamin Group governing your access to and use of the {siteName} telephone chatline service and associated website.
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
