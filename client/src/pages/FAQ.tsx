import { useState } from "react";
import { Phone, ChevronDown, ChevronUp, Menu, X } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";

const DEFAULT_PHONE = "000-000-0000";
const DEFAULT_SITE_NAME = "Phone Booth";

interface SiteSettings {
  siteName: string;
  fallbackPhoneNumber: string;
  customerServiceEmail: string | null;
  customerServicePhone: string | null;
  siteCategory: string;
}

function formatPhone(raw: string | null | undefined): string {
  if (!raw) return DEFAULT_PHONE;
  const d = raw.replace(/\D/g, "");
  if (d.length === 10) return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
  if (d.length === 11 && d[0] === "1") return `${d.slice(1, 4)}-${d.slice(4, 7)}-${d.slice(7)}`;
  return raw;
}

interface FAQItem {
  q: string;
  a: string;
}
interface FAQCategory {
  heading: string;
  items: FAQItem[];
}

function buildFAQsMM(siteName: string, phone: string): FAQCategory[] {
  return [
    {
      heading: "Getting Started",
      items: [
        {
          q: "What is " + siteName + "?",
          a: siteName + " is a live voice chatline for gay, bi, and curious men. When you call in, you'll hear a menu of real guys who are on the line right now. You can exchange voice messages, connect live for a private one-on-one conversation, or just browse profiles — all completely anonymous.",
        },
        {
          q: "How do I get started?",
          a: "Just dial " + formatPhone(phone) + " from your phone. You'll be greeted with a short welcome message and then asked to record a quick voice intro — just say your first name and a brief greeting. Once that's done, you're in and can start browsing other callers right away.",
        },
        {
          q: "Is there really a free trial?",
          a: "Yes! New callers receive 90 free minutes to explore the system. No credit card is required to start. Your free trial begins the moment you first call in and is available to your phone number for 7 days.",
        },
        {
          q: "Do I need to create an account?",
          a: "No account is needed to call in and use the live voice system. If you'd like to manage your membership online, purchase time, or track your account, you can register on the website — but it's completely optional.",
        },
        {
          q: "What do I need to call in?",
          a: "All you need is a phone. Cell phones, landlines, and VoIP phones all work. Just dial the number and follow the voice prompts. There's no app to download and no internet connection required.",
        },
      ],
    },
    {
      heading: "Privacy & Safety",
      items: [
        {
          q: "Is my call anonymous?",
          a: "Yes. " + siteName + " never displays your phone number to other callers. All connections are routed through our system so your real number stays private. You can also use a prepaid phone if you prefer complete anonymity.",
        },
        {
          q: "Can other callers find out who I am?",
          a: "No. Other callers can only hear your recorded voice greeting — they never see your name, phone number, or any other personal information. You control how much you share in your own greeting.",
        },
        {
          q: "What if I encounter someone I want to avoid?",
          a: "You can block any caller instantly by pressing 4 while listening to their profile. Once blocked, you will never be matched with that caller again and they won't be able to send you messages or invite you to a live connect.",
        },
        {
          q: "Is the system moderated?",
          a: "Yes. Our team reviews flagged content. While listening to a profile, press 7 to flag it for review. We take reports seriously and remove callers who violate our community guidelines. All callers must be 18 or older.",
        },
        {
          q: "Is my payment information secure?",
          a: "Absolutely. All payments are processed through Stripe, a PCI-compliant payment processor. " + siteName + " never stores your full card number on our servers.",
        },
      ],
    },
    {
      heading: "Using the System",
      items: [
        {
          q: "How do I browse other callers?",
          a: "After you're connected, press 1 from the main menu to enter the phone booth and start browsing profiles. You'll hear callers' voice greetings one by one. Callers closest to your location are played first when you enter your zip code.",
        },
        {
          q: "How do I send a message to someone?",
          a: "While listening to a caller's greeting, press 1 to send them a voice message. You'll be prompted to record your message after the tone. The other caller will receive it in their mailbox the next time they're on the line.",
        },
        {
          q: "What is a live connect?",
          a: "A live connect is a real-time private voice call between two callers. While browsing profiles, press 3 on a caller's greeting to send them a live connect request. If they accept, you'll both be placed into a private two-way conversation. Either party can exit at any time by pressing the pound (#) key.",
        },
        {
          q: "How do I re-record my greeting?",
          a: "From the main menu, press 2 to re-record your profile. You'll be asked to record your name (5 seconds) followed by your greeting (up to 60 seconds). Your new greeting is available to other callers immediately.",
        },
        {
          q: "What is the mailbox system?",
          a: "The mailbox system is a personal voice inbox where other callers can leave you messages. When you're not on the line, callers can still send you messages which you'll receive the next time you call in. You can also post a mailbox ad in a category (e.g. Quick & Hot Talk, Kink, Bears) so other callers can find you.",
        },
        {
          q: "How do I use my zip code to find nearby callers?",
          a: "When you enter the phone booth, you'll be asked to enter your 5-digit zip code (optional). If you provide it, the system will prioritize playing callers who are geographically close to you first. You can skip this step by pressing the pound (#) key.",
        },
        {
          q: "What do the keypad options mean?",
          a: "While browsing a caller's profile: press 1 to send a message, press 2 to skip, press 3 for a live connect, press 4 to block, press 5 to go back, press 7 to flag for review, press 9 to return to the main menu. From the main menu: press 1 for the phone booth, press 2 to re-record your profile, press 4 for membership info.",
        },
      ],
    },
    {
      heading: "Membership & Billing",
      items: [
        {
          q: "How does membership work?",
          a: "After your free trial expires, you can purchase a membership to continue using the system. Memberships come in blocks of time (minutes) that are deducted while you're actively browsing and connected on the line. Time is only counted when you're in the phone booth — not while navigating menus.",
        },
        {
          q: "What membership plans are available?",
          a: "We offer several plans ranging from a short 24-hour pass to longer multi-day memberships. Current pricing and plan details are available from the main menu (press 4, then 1) or on our website at the Buy Time page.",
        },
        {
          q: "Can I call from any phone?",
          a: "Your membership is linked to your registered phone number by default. If you'd like to call from a different phone, you can set a 4-digit PIN from your registered phone first, which allows you to verify your identity from any number.",
        },
        {
          q: "What happens when my time runs out?",
          a: "You'll receive a warning when you have less than 5 minutes remaining. When your time expires, your call will end and you'll be prompted to purchase more time the next time you call in. You won't be charged automatically.",
        },
        {
          q: "How do I check how much time I have left?",
          a: "When you enter the phone booth, the system announces how much time you have remaining before you start browsing profiles.",
        },
      ],
    },
    {
      heading: "Technical & Support",
      items: [
        {
          q: "I'm having trouble connecting. What should I try?",
          a: "Make sure you're dialing the correct number for your area. If you're calling from a cell phone and experience call quality issues, try moving to an area with better signal. If problems persist, contact our customer support team.",
        },
        {
          q: "The system says it could not identify my call. Why?",
          a: "This happens when your phone number is blocked or comes in as 'private.' The system requires caller ID to be enabled to use the service. Make sure your number is not blocked before calling in.",
        },
        {
          q: "How do I contact customer support?",
          a: "You can reach our support team by calling or emailing us. Contact details are listed in the footer of this page and are also read out on the main menu of the voice system under the customer service option.",
        },
      ],
    },
  ];
}

function buildFAQsMW(siteName: string, phone: string): FAQCategory[] {
  return [
    {
      heading: "Getting Started",
      items: [
        {
          q: "What is " + siteName + "?",
          a: siteName + " is a live voice chatline for men and women to connect over the phone. When you call in, you'll hear real people who are on the line right now. You can exchange private voice messages, connect live for a one-on-one conversation, or browse profiles — all anonymously.",
        },
        {
          q: "Who can use " + siteName + "?",
          a: siteName + " is open to any adult 18 or older. The system is designed for men and women to meet each other. Men browse women's profiles and women browse men's profiles. Everyone is on the line at the same time, and connections happen naturally through the system.",
        },
        {
          q: "How do I get started?",
          a: "Just dial " + formatPhone(phone) + " from your phone. You'll be asked a quick question to identify your gender, then prompted to record a short voice intro — just say your first name and a brief greeting. Once done, you're in and ready to start meeting people.",
        },
        {
          q: "Is there really a free trial?",
          a: "Yes! New callers receive 90 free minutes to explore the system. No credit card is required to start. Your free trial is tied to your phone number and is available for 7 days from when you first call in.",
        },
        {
          q: "Do I need to create an account?",
          a: "No account is needed to call in and use the live system. If you'd like to manage your membership online, purchase time, or access your profile from the web, you can optionally register on our website.",
        },
        {
          q: "What do I need to call in?",
          a: "Just a phone — cell, landline, or VoIP. Dial the number and follow the prompts. There's no app to download and no internet connection needed.",
        },
      ],
    },
    {
      heading: "Privacy & Safety",
      items: [
        {
          q: "Is my call anonymous?",
          a: "Yes. " + siteName + " never displays your real phone number to other callers. All connections are handled through our system. You can use a prepaid phone for added anonymity if you prefer.",
        },
        {
          q: "Can other callers find out who I am?",
          a: "No. Other callers can only hear your recorded voice greeting. Your name, phone number, and any other personal details are never shared with other callers. You decide what to say in your greeting.",
        },
        {
          q: "What if someone makes me uncomfortable?",
          a: "You can block any caller immediately by pressing 4 while their profile or message is playing. Once blocked, that caller will not appear to you again and cannot contact you. You can also flag profiles for review by pressing 7.",
        },
        {
          q: "Is the content moderated?",
          a: "Yes. Our team reviews all flagged content and removes callers who violate our community guidelines. All callers must be 18 or older. If you hear something inappropriate, press 7 to report it immediately.",
        },
        {
          q: "Is my payment secure?",
          a: "All payments are processed through Stripe, which is PCI-compliant. We never store full card details on our servers.",
        },
      ],
    },
    {
      heading: "Using the System",
      items: [
        {
          q: "How do I browse profiles?",
          a: "From the main menu, press 1 to enter the live chatline and start hearing greetings. Men hear women's greetings and women hear men's greetings. You'll hear one greeting at a time. Callers near your zip code are played first if you choose to enter it.",
        },
        {
          q: "How do I send a message?",
          a: "While listening to a profile, press 1 to leave a voice message. You'll record it after the tone. The other person will receive it in their inbox the next time they call in.",
        },
        {
          q: "What is a live connect?",
          a: "A live connect is a real-time private two-way phone call between two callers. While browsing, press 3 on someone's profile to send them a live connect request. If they accept, you'll be placed into a private call together. Either person can exit by pressing the pound (#) key.",
        },
        {
          q: "How do I re-record my greeting?",
          a: "From the main menu, press 2 to record a new profile. First you'll record your name (5 seconds), then your greeting (up to 60 seconds). Your new greeting goes live immediately.",
        },
        {
          q: "What is the mailbox?",
          a: "Your mailbox is a personal voice inbox. Other callers can leave you messages even when you're not on the line. You'll receive them the next time you call in. You can also post a mailbox ad in various categories to be discovered by other callers.",
        },
        {
          q: "What do the keypad options do?",
          a: "While listening to a profile: press 1 to send a message, press 2 to skip, press 3 for a live connect, press 4 to block, press 5 for the previous profile, press 7 to flag, press 9 for the main menu. From the main menu: press 1 to browse profiles, press 2 to re-record your greeting, press 4 for membership information.",
        },
        {
          q: "How does the zip code feature work?",
          a: "When you enter the live chatline, you can optionally enter your 5-digit zip code. The system uses it to play profiles of people who are geographically near you first. Press pound (#) to skip and hear all callers in order.",
        },
      ],
    },
    {
      heading: "Membership & Billing",
      items: [
        {
          q: "How does membership work?",
          a: "After your free trial, you can purchase a block of minutes to keep using the system. Time counts down only while you're actively browsing or connected — not while navigating menus or holding.",
        },
        {
          q: "What plans are available?",
          a: "We offer several plans ranging from a short 24-hour pass to longer multi-day memberships. You can hear pricing on the voice system from the main menu (press 4, then 1), or visit the Buy Time page on our website.",
        },
        {
          q: "Can I call from a different phone?",
          a: "Your account is linked to your registered phone number. To call from a different device, set a 4-digit PIN from your registered phone first. This lets you verify your membership from any phone number.",
        },
        {
          q: "What happens when my time runs out?",
          a: "You'll get a warning when fewer than 5 minutes remain. When time is up, your session ends. You won't be charged automatically — you choose when to purchase more time.",
        },
        {
          q: "How do I check my remaining time?",
          a: "Each time you enter the live chatline, the system tells you how much time you have remaining before you start browsing.",
        },
      ],
    },
    {
      heading: "Technical & Support",
      items: [
        {
          q: "I'm having trouble connecting. What should I try?",
          a: "Make sure you're dialing the correct number. If you're on a cell phone, try a spot with better signal. If problems continue, reach out to our support team — contact details are in the footer.",
        },
        {
          q: "The system says it couldn't identify my call. Why?",
          a: "This means your number came in as private or blocked. The system requires caller ID to identify your account. Unblock your number before calling in.",
        },
        {
          q: "How do I contact support?",
          a: "Contact details are in the footer of this page and are also available on the voice system's main menu. We're happy to help with any questions or issues.",
        },
      ],
    },
  ];
}

function AccordionItem({ item, index, openIndex, onToggle }: {
  item: FAQItem;
  index: number;
  openIndex: number | null;
  onToggle: (i: number) => void;
}) {
  const isOpen = openIndex === index;
  return (
    <div
      style={{
        borderBottom: "1px solid #1e1e1e",
        overflow: "hidden",
      }}
      data-testid={`faq-item-${index}`}
    >
      <button
        onClick={() => onToggle(index)}
        data-testid={`faq-toggle-${index}`}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "1rem",
          padding: "1.15rem 0",
          background: "none",
          border: "none",
          cursor: "pointer",
          textAlign: "left",
          color: "#fff",
        }}
      >
        <span style={{ fontSize: "0.97rem", fontWeight: 600, lineHeight: 1.4, color: isOpen ? "#60a5fa" : "#fff", transition: "color 0.15s" }}>
          {item.q}
        </span>
        <span style={{ flexShrink: 0, color: "rgba(255,255,255,0.4)" }}>
          {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </span>
      </button>
      {isOpen && (
        <div style={{ paddingBottom: "1.25rem" }}>
          <p style={{ fontSize: "0.92rem", color: "rgba(255,255,255,0.65)", lineHeight: 1.75, margin: 0 }}>
            {item.a}
          </p>
        </div>
      )}
    </div>
  );
}

function FAQSection({ category, globalOffset, openIndex, onToggle }: {
  category: FAQCategory;
  globalOffset: number;
  openIndex: number | null;
  onToggle: (i: number) => void;
}) {
  return (
    <div style={{ marginBottom: "2.5rem" }}>
      <h2
        data-testid={`faq-category-${category.heading.toLowerCase().replace(/\s+/g, "-")}`}
        style={{
          fontSize: "0.72rem",
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: "0.12em",
          color: "#3b82f6",
          marginBottom: "0.75rem",
        }}
      >
        {category.heading}
      </h2>
      <div style={{ borderTop: "1px solid #1e1e1e" }}>
        {category.items.map((item, i) => (
          <AccordionItem
            key={i}
            item={item}
            index={globalOffset + i}
            openIndex={openIndex}
            onToggle={onToggle}
          />
        ))}
      </div>
    </div>
  );
}

export default function FAQ() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [openIndex, setOpenIndex] = useState<number | null>(null);

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

  const categories = isMM
    ? buildFAQsMM(siteName, phone)
    : buildFAQsMW(siteName, phone);

  const footerBlurb = isMM
    ? "The most popular gay, bi & curious live chat line. Real guys, real voices."
    : "The most popular mixed live chat line. Real men, real women, real conversations.";

  const handleToggle = (i: number) => {
    setOpenIndex(prev => (prev === i ? null : i));
  };

  let offset = 0;

  return (
    <div style={{ fontFamily: "'Inter', system-ui, sans-serif", background: "#0d0d0d", color: "#fff", minHeight: "100vh" }}>

      {/* ── NAVBAR ── */}
      <nav style={{ background: "#000", position: "sticky", top: 0, zIndex: 100, borderBottom: "1px solid #1a1a1a" }}>
        <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "0 1.5rem", display: "flex", alignItems: "center", justifyContent: "space-between", minHeight: "79px" }}>
          <Link href="/" style={{ display: "flex", alignItems: "center", gap: "0.5rem", textDecoration: "none" }} data-testid="nav-logo">
            <div style={{ width: 36, height: 36, background: "#1d4ed8", borderRadius: "8px", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Phone className="w-4 h-4 text-white" />
            </div>
            <span style={{ fontSize: "1rem", fontWeight: 800, color: "#fff", letterSpacing: "-0.01em" }}>{siteName}</span>
          </Link>

          <div className="hidden md:flex items-center gap-6" style={{ fontSize: "0.95rem", fontWeight: 500 }}>
            {[{ label: "Buy Time", href: "/membership" }].map(l => (
              <Link key={l.label} href={l.href}
                style={{ color: "#ccc", textDecoration: "none", transition: "color 0.15s" }}
                onMouseEnter={(e: any) => (e.currentTarget.style.color = "#fff")}
                onMouseLeave={(e: any) => (e.currentTarget.style.color = "#ccc")}
                data-testid={`nav-${l.label.toLowerCase().replace(/\s+/g, "-")}`}
              >
                {l.label}
              </Link>
            ))}
            <div style={{ width: "1px", height: "18px", background: "#222" }} />
            <Link href="/login"
              style={{ color: "#ccc", textDecoration: "none", transition: "color 0.15s" }}
              onMouseEnter={(e: any) => (e.currentTarget.style.color = "#fff")}
              onMouseLeave={(e: any) => (e.currentTarget.style.color = "#ccc")}
              data-testid="nav-sign-in">
              Log in
            </Link>
            <Link href="/register"
              style={{ background: "#1d4ed8", color: "#fff", textDecoration: "none", fontSize: "0.92rem", fontWeight: 700, padding: "0.4rem 0.875rem", borderRadius: "7px", transition: "background 0.15s" }}
              onMouseEnter={(e: any) => (e.currentTarget.style.background = "#1e40af")}
              onMouseLeave={(e: any) => (e.currentTarget.style.background = "#1d4ed8")}
              data-testid="nav-register">
              Register
            </Link>
          </div>

          <button className="md:hidden" onClick={() => setMobileOpen(v => !v)}
            style={{ background: "none", border: "none", color: "#fff", cursor: "pointer", padding: "0.25rem" }}>
            {mobileOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>

        {mobileOpen && (
          <div style={{ background: "#111", borderTop: "1px solid #222", padding: "1rem 1.5rem 1.5rem" }}>
            <Link href="/membership"
              style={{ display: "block", color: "#ccc", textDecoration: "none", fontSize: "0.95rem", padding: "0.5rem 0", borderBottom: "1px solid #1e1e1e" }}>
              Buy Time
            </Link>
            <Link href="/dashboard"
              style={{ display: "block", color: "#ccc", textDecoration: "none", fontSize: "0.95rem", padding: "0.5rem 0", borderBottom: "1px solid #1e1e1e" }}>
              My Account
            </Link>
          </div>
        )}
      </nav>

      {/* ── PAGE HEADER ── */}
      <section style={{ background: "#111", borderBottom: "1px solid #1a1a1a", padding: "3.5rem 1.5rem 3rem" }}>
        <div style={{ maxWidth: "760px", margin: "0 auto" }}>
          <p style={{ fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", color: "#3b82f6", marginBottom: "0.75rem" }}
            data-testid="faq-label">
            Help Center
          </p>
          <h1 style={{ fontSize: "clamp(1.8rem, 4vw, 2.8rem)", fontWeight: 900, letterSpacing: "-0.02em", lineHeight: 1.1, marginBottom: "1rem", color: "#fff" }}
            data-testid="faq-title">
            Frequently Asked Questions
          </h1>
          <p style={{ fontSize: "1rem", color: "rgba(255,255,255,0.55)", lineHeight: 1.7, marginBottom: "1.75rem" }}
            data-testid="faq-subtitle">
            {isMM
              ? `Everything you need to know about using ${siteName} — the gay, bi & curious live chatline.`
              : `Everything you need to know about using ${siteName} — the live chat line for men and women.`}
          </p>
          <a
            href={"tel:" + phone.replace(/\D/g, "")}
            style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem", background: "#1d4ed8", color: "#fff", textDecoration: "none", fontSize: "0.95rem", fontWeight: 700, padding: "0.6rem 1.25rem", borderRadius: "7px" }}
            data-testid="faq-cta-call"
          >
            <Phone className="w-4 h-4" /> Call {formatPhone(phone)} — First 90 Min Free
          </a>
        </div>
      </section>

      {/* ── FAQ BODY ── */}
      <section style={{ padding: "3.5rem 1.5rem 5rem" }}>
        <div style={{ maxWidth: "760px", margin: "0 auto" }}>
          {categories.map((cat) => {
            const node = (
              <FAQSection
                key={cat.heading}
                category={cat}
                globalOffset={offset}
                openIndex={openIndex}
                onToggle={handleToggle}
              />
            );
            offset += cat.items.length;
            return node;
          })}

          {/* Still have questions */}
          <div style={{ marginTop: "2rem", background: "#111", border: "1px solid #1e1e1e", borderRadius: "10px", padding: "2rem", textAlign: "center" }}>
            <h3 style={{ fontSize: "1.05rem", fontWeight: 700, color: "#fff", marginBottom: "0.5rem" }}>
              Still have questions?
            </h3>
            <p style={{ fontSize: "0.9rem", color: "rgba(255,255,255,0.5)", marginBottom: "1.25rem" }}>
              Our support team is happy to help.
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: "0.75rem" }}>
              {csPhone && (
                <a href={"tel:" + csPhone.replace(/\D/g, "")}
                  style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem", background: "#1d4ed8", color: "#fff", textDecoration: "none", fontSize: "0.88rem", fontWeight: 600, padding: "0.5rem 1.1rem", borderRadius: "6px" }}
                  data-testid="faq-contact-phone">
                  <Phone className="w-3.5 h-3.5" /> {formatPhone(csPhone)}
                </a>
              )}
              {csEmail && (
                <a href={"mailto:" + csEmail}
                  style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem", background: "#1a1a1a", border: "1px solid #2a2a2a", color: "rgba(255,255,255,0.7)", textDecoration: "none", fontSize: "0.88rem", fontWeight: 600, padding: "0.5rem 1.1rem", borderRadius: "6px" }}
                  data-testid="faq-contact-email">
                  {csEmail}
                </a>
              )}
              {!csPhone && !csEmail && (
                <a href={"tel:" + phone.replace(/\D/g, "")}
                  style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem", background: "#1d4ed8", color: "#fff", textDecoration: "none", fontSize: "0.88rem", fontWeight: 600, padding: "0.5rem 1.1rem", borderRadius: "6px" }}
                  data-testid="faq-contact-main">
                  <Phone className="w-3.5 h-3.5" /> {formatPhone(phone)}
                </a>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer style={{ background: "#080808", borderTop: "1px solid #1a1a1a", padding: "3rem 1.5rem 2rem" }}>
        <div style={{ maxWidth: "1000px", margin: "0 auto" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "2rem", marginBottom: "2.5rem" }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.75rem" }}>
                <div style={{ width: 28, height: 28, borderRadius: "6px", background: "#1d4ed8", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Phone className="w-3.5 h-3.5 text-white" />
                </div>
                <span style={{ fontSize: "0.95rem", fontWeight: 800, color: "#fff" }}>{siteName}</span>
              </div>
              <p style={{ fontSize: "0.78rem", color: "rgba(255,255,255,0.3)", lineHeight: 1.65 }}>
                {footerBlurb}
              </p>
            </div>
            {[
              { heading: "Account", links: [{ label: "Buy Time", href: "/membership" }, { label: "Free Trial", href: "/membership" }, { label: "Memberships", href: "/membership" }] },
              {
                heading: "Help",
                links: [
                  { label: "FAQ", href: "/faq" },
                  ...(csPhone ? [{ label: "Call: " + formatPhone(csPhone), href: "tel:" + csPhone.replace(/\D/g, "") }] : []),
                  ...(csEmail ? [{ label: "Email: " + csEmail, href: "mailto:" + csEmail }] : []),
                ],
              },
              { heading: "Company", links: [{ label: "About Us", href: "#" }, { label: "Privacy Policy", href: "#" }, { label: "Terms of Use", href: "#" }] },
            ].map(col => (
              <div key={col.heading}>
                <h4 style={{ fontSize: "0.68rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "rgba(255,255,255,0.3)", marginBottom: "0.75rem" }}>
                  {col.heading}
                </h4>
                <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "0.45rem" }}>
                  {col.links.map(link => (
                    <li key={link.label}>
                      <a href={link.href}
                        style={{ fontSize: "0.82rem", color: "rgba(255,255,255,0.45)", textDecoration: "none", transition: "color 0.15s" }}
                        onMouseEnter={e => (e.currentTarget.style.color = "#fff")}
                        onMouseLeave={e => (e.currentTarget.style.color = "rgba(255,255,255,0.45)")}>
                        {link.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <div style={{ borderTop: "1px solid #1a1a1a", paddingTop: "1.5rem", display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: "0.75rem" }}>
            <p style={{ fontSize: "0.75rem", color: "rgba(255,255,255,0.2)" }}>
              © {new Date().getFullYear()} {siteName}. All Rights Reserved.
            </p>
            <p style={{ fontSize: "0.75rem", color: "rgba(255,255,255,0.2)" }}>
              All callers must be 18 years or older.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
