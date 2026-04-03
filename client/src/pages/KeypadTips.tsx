import { useState } from "react";
import { Phone, Menu, X } from "lucide-react";
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

interface KeyDef {
  key: string;
  label: string;
  active: boolean;
}

function PhoneKeypad({ keys, title, description }: {
  keys: KeyDef[];
  title: string;
  description: string;
}) {
  return (
    <div style={{ background: "#111", border: "1px solid #1e1e1e", borderRadius: "14px", padding: "2rem", maxWidth: "380px", width: "100%" }}>
      <h2 style={{ fontSize: "1.05rem", fontWeight: 800, color: "#fff", marginBottom: "0.35rem" }}>{title}</h2>
      <p style={{ fontSize: "0.82rem", color: "rgba(255,255,255,0.4)", lineHeight: 1.6, marginBottom: "1.75rem" }}>{description}</p>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "1rem" }}>
        {keys.map((k, i) => (
          <div
            key={i}
            data-testid={`keypad-key-${k.key}`}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "0.55rem",
              opacity: k.active ? 1 : 0.2,
            }}
          >
            <div style={{
              width: 68,
              height: 68,
              borderRadius: "50%",
              border: `2px solid ${k.active ? "#2d2d2d" : "#1a1a1a"}`,
              background: k.active ? "#1a1a1a" : "#111",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}>
              <span style={{
                fontSize: "1.6rem",
                fontWeight: 700,
                color: k.active ? "#fff" : "rgba(255,255,255,0.25)",
                lineHeight: 1,
              }}>
                {k.key}
              </span>
            </div>
            {k.label && k.active ? (
              <span style={{
                fontSize: "0.7rem",
                fontWeight: 500,
                color: "rgba(255,255,255,0.55)",
                textAlign: "center",
                lineHeight: 1.35,
                maxWidth: "72px",
              }}>
                {k.label}
              </span>
            ) : (
              <span style={{ height: "1rem" }} />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

const PHONE_BOOTH_KEYS: KeyDef[] = [
  { key: "1", label: "Send Message",   active: true  },
  { key: "2", label: "Next Profile",   active: true  },
  { key: "3", label: "Live Connect",   active: true  },
  { key: "4", label: "Block Caller",   active: true  },
  { key: "5", label: "Prev Profile",   active: true  },
  { key: "6", label: "Location",       active: true  },
  { key: "7", label: "Flag Profile",   active: true  },
  { key: "8", label: "",               active: false },
  { key: "9", label: "Main Menu",      active: true  },
  { key: "*", label: "",               active: false },
  { key: "0", label: "",               active: false },
  { key: "#", label: "Exit",           active: true  },
];

const MAIN_MENU_KEYS_MM: KeyDef[] = [
  { key: "1", label: "Mailbox & Ads",  active: true  },
  { key: "2", label: "Buy Time",       active: true  },
  { key: "3", label: "",               active: false },
  { key: "4", label: "Pricing Info",   active: true  },
  { key: "5", label: "",               active: false },
  { key: "6", label: "",               active: false },
  { key: "7", label: "",               active: false },
  { key: "8", label: "My Membership",  active: true  },
  { key: "9", label: "Repeat Menu",    active: true  },
  { key: "*", label: "Phone Booth",    active: true  },
  { key: "0", label: "Customer Care",  active: true  },
  { key: "#", label: "",               active: false },
];

const MAIN_MENU_KEYS_MW: KeyDef[] = [
  { key: "1", label: "Join the Action",active: true  },
  { key: "2", label: "Buy Time",       active: true  },
  { key: "3", label: "",               active: false },
  { key: "4", label: "",               active: false },
  { key: "5", label: "",               active: false },
  { key: "6", label: "",               active: false },
  { key: "7", label: "",               active: false },
  { key: "8", label: "My Membership",  active: true  },
  { key: "9", label: "Repeat Menu",    active: true  },
  { key: "*", label: "",               active: false },
  { key: "0", label: "Customer Care",  active: true  },
  { key: "#", label: "",               active: false },
];

const MESSAGE_KEYS: KeyDef[] = [
  { key: "1", label: "Reply",             active: true  },
  { key: "2", label: "Sender's Profile",  active: true  },
  { key: "3", label: "Keep Browsing",     active: true  },
  { key: "4", label: "Block Caller",      active: true  },
  { key: "5", label: "",                  active: false },
  { key: "6", label: "",                  active: false },
  { key: "7", label: "Flag Message",      active: true  },
  { key: "8", label: "",                  active: false },
  { key: "9", label: "Main Menu",         active: true  },
  { key: "*", label: "",                  active: false },
  { key: "0", label: "",                  active: false },
  { key: "#", label: "",                  active: false },
];

const LIVE_INVITE_KEYS: KeyDef[] = [
  { key: "1", label: "Accept",         active: true  },
  { key: "2", label: "Decline & Next", active: true  },
  { key: "3", label: "Hear Greeting",  active: true  },
  { key: "4", label: "Block Caller",   active: true  },
  { key: "5", label: "",               active: false },
  { key: "6", label: "",               active: false },
  { key: "7", label: "",               active: false },
  { key: "8", label: "",               active: false },
  { key: "9", label: "",               active: false },
  { key: "*", label: "",               active: false },
  { key: "0", label: "",               active: false },
  { key: "#", label: "Exit Call",      active: true  },
];

type Mode = "booth" | "menu" | "messages" | "invite";

export default function KeypadTips() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [activeMode, setActiveMode] = useState<Mode>("booth");

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

  const mainMenuKeys = isMM ? MAIN_MENU_KEYS_MM : MAIN_MENU_KEYS_MW;

  const modes: { id: Mode; label: string }[] = [
    { id: "booth",    label: "Phone Booth" },
    { id: "menu",     label: "Main Menu" },
    { id: "messages", label: "Messages" },
    { id: "invite",   label: "Live Invite" },
  ];

  const keypads: Record<Mode, { keys: KeyDef[]; title: string; description: string; tip: string }> = {
    booth: {
      keys: PHONE_BOOTH_KEYS,
      title: "Phone Booth — Browse Profiles",
      description: "Use these keys while listening to a caller's greeting.",
      tip: "Press 2 to skip a greeting at any point — even while it's still playing. Press 3 to request a live connection.",
    },
    menu: {
      keys: mainMenuKeys,
      title: "Main Menu",
      description: "Use these keys when you're at the main menu.",
      tip: isMM
        ? "Press * anytime from the main menu to jump straight into the Phone Booth."
        : "Press 1 from the main menu to join the action and start browsing live callers.",
    },
    messages: {
      keys: MESSAGE_KEYS,
      title: "Inbox — Listening to a Message",
      description: "Use these keys while a received message is playing.",
      tip: "Press 2 while reading a message to hear the sender's recorded greeting before you reply.",
    },
    invite: {
      keys: LIVE_INVITE_KEYS,
      title: "Live Connect Invite",
      description: "Use these keys when another caller sends a live connect request.",
      tip: "Press 3 to hear the caller's greeting before deciding to accept or decline.",
    },
  };

  const current = keypads[activeMode];

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
            <Link href="/membership"
              style={{ color: "#ccc", textDecoration: "none" }}
              onMouseEnter={(e: any) => (e.currentTarget.style.color = "#fff")}
              onMouseLeave={(e: any) => (e.currentTarget.style.color = "#ccc")}
              data-testid="nav-buy-time">
              Buy Time
            </Link>
            <div style={{ width: "1px", height: "18px", background: "#222" }} />
            <Link href="/login"
              style={{ color: "#ccc", textDecoration: "none" }}
              onMouseEnter={(e: any) => (e.currentTarget.style.color = "#fff")}
              onMouseLeave={(e: any) => (e.currentTarget.style.color = "#ccc")}
              data-testid="nav-sign-in">
              Log in
            </Link>
            <Link href="/register"
              style={{ background: "#1d4ed8", color: "#fff", textDecoration: "none", fontSize: "0.92rem", fontWeight: 700, padding: "0.4rem 0.875rem", borderRadius: "7px" }}
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
            <Link href="/membership" style={{ display: "block", color: "#ccc", textDecoration: "none", fontSize: "0.95rem", padding: "0.5rem 0", borderBottom: "1px solid #1e1e1e" }}>
              Buy Time
            </Link>
            <Link href="/dashboard" style={{ display: "block", color: "#ccc", textDecoration: "none", fontSize: "0.95rem", padding: "0.5rem 0" }}>
              My Account
            </Link>
          </div>
        )}
      </nav>

      {/* ── PAGE HEADER ── */}
      <section style={{ background: "#111", borderBottom: "1px solid #1a1a1a", padding: "3.5rem 1.5rem 3rem" }}>
        <div style={{ maxWidth: "900px", margin: "0 auto" }}>
          <p style={{ fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", color: "#3b82f6", marginBottom: "0.75rem" }}>
            Reference Guide
          </p>
          <h1 style={{ fontSize: "clamp(1.8rem, 4vw, 2.8rem)", fontWeight: 900, letterSpacing: "-0.02em", lineHeight: 1.1, marginBottom: "1rem", color: "#fff" }}
            data-testid="keypad-title">
            Keypad Tips
          </h1>
          <p style={{ fontSize: "1rem", color: "rgba(255,255,255,0.5)", lineHeight: 1.7, maxWidth: "580px" }}>
            Select a screen below to see which keys do what.
          </p>
        </div>
      </section>

      {/* ── MAIN CONTENT ── */}
      <section style={{ padding: "3rem 1.5rem 5rem" }}>
        <div style={{ maxWidth: "900px", margin: "0 auto" }}>

          {/* Mode tabs */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", marginBottom: "2.5rem" }}
            data-testid="keypad-mode-tabs">
            {modes.map(m => (
              <button
                key={m.id}
                onClick={() => setActiveMode(m.id)}
                data-testid={`keypad-mode-${m.id}`}
                style={{
                  padding: "0.45rem 1rem",
                  borderRadius: "6px",
                  fontSize: "0.88rem",
                  fontWeight: 600,
                  cursor: "pointer",
                  border: activeMode === m.id ? "1px solid #1d4ed8" : "1px solid #1e1e1e",
                  background: activeMode === m.id ? "#1d4ed8" : "#111",
                  color: activeMode === m.id ? "#fff" : "rgba(255,255,255,0.45)",
                  transition: "all 0.15s",
                }}
              >
                {m.label}
              </button>
            ))}
          </div>

          {/* Keypad + tip layout */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: "2.5rem", alignItems: "flex-start" }}>

            <PhoneKeypad
              keys={current.keys}
              title={current.title}
              description={current.description}
            />

            {/* Pro tip */}
            <div style={{ flex: "1 1 240px", minWidth: "200px" }}>
              <div style={{ background: "rgba(29,78,216,0.08)", border: "1px solid rgba(29,78,216,0.25)", borderRadius: "10px", padding: "1.25rem" }}>
                <p style={{ fontSize: "0.68rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "#60a5fa", marginBottom: "0.5rem" }}>
                  Pro Tip
                </p>
                <p style={{ fontSize: "0.85rem", color: "rgba(255,255,255,0.6)", lineHeight: 1.65, margin: 0 }}>
                  {current.tip}
                </p>
              </div>
            </div>
          </div>

          {/* Divider */}
          <div style={{ borderTop: "1px solid #1a1a1a", margin: "3.5rem 0 3rem" }} />

          {/* Quick reference table */}
          <div>
            <h2 style={{ fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", color: "#3b82f6", marginBottom: "1.25rem" }}>
              Phone Booth — Full Key Reference
            </h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "0.6rem" }}
              data-testid="keypad-reference-table">
              {PHONE_BOOTH_KEYS.filter(k => k.active && k.label).map(k => (
                <div key={k.key} style={{ display: "flex", alignItems: "center", gap: "0.85rem", background: "#111", border: "1px solid #1e1e1e", borderRadius: "8px", padding: "0.65rem 0.9rem" }}
                  data-testid={`keypad-ref-${k.key}`}>
                  <div style={{ width: 34, height: 34, borderRadius: "50%", background: "#1a1a1a", border: "1px solid #2a2a2a", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <span style={{ fontSize: "0.95rem", fontWeight: 700, color: "#fff" }}>{k.key}</span>
                  </div>
                  <span style={{ fontSize: "0.85rem", fontWeight: 500, color: "rgba(255,255,255,0.6)" }}>{k.label}</span>
                </div>
              ))}
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
              <p style={{ fontSize: "0.78rem", color: "rgba(255,255,255,0.3)", lineHeight: 1.65 }}>{footerBlurb}</p>
            </div>
            {[
              { heading: "Account", links: [{ label: "Buy Time", href: "/membership" }, { label: "Free Trial", href: "/membership" }, { label: "Memberships", href: "/membership" }] },
              {
                heading: "Help",
                links: [
                  { label: "Customer Support", href: "/support" },
                  { label: "FAQ", href: "/faq" },
                  { label: "Keypad Tips", href: "/keypad-tips" },
                  { label: "Cities Coverage", href: "/cities" },
                  { label: "Safety Tips", href: "/safety-tips" },
                  ...(csPhone ? [{ label: "Call: " + formatPhone(csPhone), href: "tel:" + csPhone.replace(/\D/g, "") }] : []),
                  ...(csEmail ? [{ label: "Email: " + csEmail, href: "mailto:" + csEmail }] : []),
                ],
              },
              { heading: "Company", links: [{ label: "About Us", href: "/about" }, { label: "Privacy Policy", href: "/privacy-policy" }, { label: "Terms of Use", href: "/terms" }] },
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
