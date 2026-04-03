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
  highlight?: "blue" | "green" | "red" | "amber" | "purple";
}

function PhoneKeypad({ keys, title, description }: {
  keys: KeyDef[];
  title: string;
  description: string;
}) {
  const highlightColors: Record<string, { bg: string; border: string; text: string; label: string }> = {
    blue:   { bg: "rgba(29,78,216,0.18)",  border: "#1d4ed8", text: "#60a5fa", label: "#93c5fd" },
    green:  { bg: "rgba(22,163,74,0.18)",  border: "#16a34a", text: "#4ade80", label: "#86efac" },
    red:    { bg: "rgba(220,38,38,0.18)",  border: "#dc2626", text: "#f87171", label: "#fca5a5" },
    amber:  { bg: "rgba(217,119,6,0.18)",  border: "#d97706", text: "#fbbf24", label: "#fcd34d" },
    purple: { bg: "rgba(147,51,234,0.18)", border: "#9333ea", text: "#c084fc", label: "#d8b4fe" },
  };

  return (
    <div style={{ background: "#111", border: "1px solid #1e1e1e", borderRadius: "14px", padding: "2rem", maxWidth: "420px", width: "100%" }}>
      <h2 style={{ fontSize: "1.05rem", fontWeight: 800, color: "#fff", marginBottom: "0.35rem" }}>{title}</h2>
      <p style={{ fontSize: "0.82rem", color: "rgba(255,255,255,0.45)", lineHeight: 1.6, marginBottom: "1.75rem" }}>{description}</p>

      {/* 3-column keypad grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "1rem" }}>
        {keys.map((k, i) => {
          const colors = k.highlight ? highlightColors[k.highlight] : null;
          const isActive = k.active;
          return (
            <div
              key={i}
              data-testid={`keypad-key-${k.key}`}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "0.55rem",
                opacity: isActive ? 1 : 0.25,
              }}
            >
              {/* Circle */}
              <div style={{
                width: 72,
                height: 72,
                borderRadius: "50%",
                border: `2px solid ${isActive && colors ? colors.border : isActive ? "#2d2d2d" : "#1a1a1a"}`,
                background: isActive && colors ? colors.bg : isActive ? "#1a1a1a" : "#111",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                transition: "all 0.15s",
              }}>
                <span style={{
                  fontSize: "1.65rem",
                  fontWeight: 700,
                  color: isActive && colors ? colors.text : isActive ? "#fff" : "rgba(255,255,255,0.3)",
                  lineHeight: 1,
                  fontFamily: "'Inter', system-ui, sans-serif",
                }}>
                  {k.key}
                </span>
              </div>
              {/* Label */}
              {k.label && isActive ? (
                <span style={{
                  fontSize: "0.72rem",
                  fontWeight: 500,
                  color: colors ? colors.label : "rgba(255,255,255,0.6)",
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
          );
        })}
      </div>
    </div>
  );
}

const PHONE_BOOTH_KEYS: KeyDef[] = [
  { key: "1", label: "Send Message",     active: true,  highlight: "blue"   },
  { key: "2", label: "Next Profile",     active: true,  highlight: "green"  },
  { key: "3", label: "Live Connect",     active: true,  highlight: "purple" },
  { key: "4", label: "Block Caller",     active: true,  highlight: "red"    },
  { key: "5", label: "Prev Profile",     active: true,  highlight: "amber"  },
  { key: "6", label: "Location",         active: true,  highlight: "blue"   },
  { key: "7", label: "Flag Profile",     active: true,  highlight: "red"    },
  { key: "8", label: "",                 active: false                       },
  { key: "9", label: "Main Menu",        active: true,  highlight: "amber"  },
  { key: "*", label: "",                 active: false                       },
  { key: "0", label: "",                 active: false                       },
  { key: "#", label: "Exit",             active: true,  highlight: "red"    },
];

const MAIN_MENU_KEYS_MM: KeyDef[] = [
  { key: "1", label: "Mailbox & Ads",   active: true,  highlight: "blue"   },
  { key: "2", label: "Buy Time",        active: true,  highlight: "green"  },
  { key: "3", label: "",                active: false                       },
  { key: "4", label: "Pricing Info",    active: true,  highlight: "amber"  },
  { key: "5", label: "",                active: false                       },
  { key: "6", label: "",                active: false                       },
  { key: "7", label: "",                active: false                       },
  { key: "8", label: "My Membership",   active: true,  highlight: "purple" },
  { key: "9", label: "Repeat Menu",     active: true,  highlight: "amber"  },
  { key: "*", label: "Phone Booth",     active: true,  highlight: "green"  },
  { key: "0", label: "Customer Care",   active: true,  highlight: "blue"   },
  { key: "#", label: "",                active: false                       },
];

const MAIN_MENU_KEYS_MW: KeyDef[] = [
  { key: "1", label: "Join the Action", active: true,  highlight: "blue"   },
  { key: "2", label: "Buy Time",        active: true,  highlight: "green"  },
  { key: "3", label: "",                active: false                       },
  { key: "4", label: "",                active: false                       },
  { key: "5", label: "",                active: false                       },
  { key: "6", label: "",                active: false                       },
  { key: "7", label: "",                active: false                       },
  { key: "8", label: "My Membership",   active: true,  highlight: "purple" },
  { key: "9", label: "Repeat Menu",     active: true,  highlight: "amber"  },
  { key: "*", label: "",                active: false                       },
  { key: "0", label: "Customer Care",   active: true,  highlight: "blue"   },
  { key: "#", label: "",                active: false                       },
];

const MESSAGE_KEYS: KeyDef[] = [
  { key: "1", label: "Reply",           active: true,  highlight: "blue"   },
  { key: "2", label: "Sender's Profile",active: true,  highlight: "green"  },
  { key: "3", label: "Keep Browsing",   active: true,  highlight: "green"  },
  { key: "4", label: "Block Caller",    active: true,  highlight: "red"    },
  { key: "5", label: "",                active: false                       },
  { key: "6", label: "",                active: false                       },
  { key: "7", label: "Flag Message",    active: true,  highlight: "red"    },
  { key: "8", label: "",                active: false                       },
  { key: "9", label: "Main Menu",       active: true,  highlight: "amber"  },
  { key: "*", label: "",                active: false                       },
  { key: "0", label: "",                active: false                       },
  { key: "#", label: "",                active: false                       },
];

const LIVE_INVITE_KEYS: KeyDef[] = [
  { key: "1", label: "Accept",          active: true,  highlight: "green"  },
  { key: "2", label: "Decline & Next",  active: true,  highlight: "red"    },
  { key: "3", label: "Hear Greeting",   active: true,  highlight: "blue"   },
  { key: "4", label: "Block Caller",    active: true,  highlight: "red"    },
  { key: "5", label: "",                active: false                       },
  { key: "6", label: "",                active: false                       },
  { key: "7", label: "",                active: false                       },
  { key: "8", label: "",                active: false                       },
  { key: "9", label: "",                active: false                       },
  { key: "*", label: "",                active: false                       },
  { key: "0", label: "",                active: false                       },
  { key: "#", label: "Exit Call",       active: true,  highlight: "red"    },
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
    ? "The most popular gay, bi & curious live chat line. Real guys, real voices."
    : "The most popular mixed live chat line. Real men, real women, real conversations.";

  const mainMenuKeys = isMM ? MAIN_MENU_KEYS_MM : MAIN_MENU_KEYS_MW;

  const modes: { id: Mode; label: string }[] = [
    { id: "booth",    label: "Phone Booth" },
    { id: "menu",     label: "Main Menu" },
    { id: "messages", label: "Messages" },
    { id: "invite",   label: "Live Invite" },
  ];

  const keypads: Record<Mode, { keys: KeyDef[]; title: string; description: string }> = {
    booth: {
      keys: PHONE_BOOTH_KEYS,
      title: "Phone Booth — Browse Profiles",
      description: "Use these keys while listening to a caller's greeting to interact with their profile.",
    },
    menu: {
      keys: mainMenuKeys,
      title: "Main Menu",
      description: "Use these keys when you're at the main menu to navigate the system.",
    },
    messages: {
      keys: MESSAGE_KEYS,
      title: "Inbox — Listening to a Message",
      description: "Use these keys while a received message is playing to reply, browse, or manage the sender.",
    },
    invite: {
      keys: LIVE_INVITE_KEYS,
      title: "Live Connect Invite",
      description: "When another caller sends you a live connect request, use these keys to respond.",
    },
  };

  const current = keypads[activeMode];

  const legend = [
    { color: "#4ade80", label: "Navigate / Accept" },
    { color: "#60a5fa", label: "Interact / Send"   },
    { color: "#c084fc", label: "Live Connect"       },
    { color: "#fbbf24", label: "Menu / Repeat"      },
    { color: "#f87171", label: "Block / Exit / Flag"},
  ];

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
              style={{ color: "#ccc", textDecoration: "none", transition: "color 0.15s" }}
              onMouseEnter={(e: any) => (e.currentTarget.style.color = "#fff")}
              onMouseLeave={(e: any) => (e.currentTarget.style.color = "#ccc")}
              data-testid="nav-buy-time">
              Buy Time
            </Link>
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
            <Link href="/membership" style={{ display: "block", color: "#ccc", textDecoration: "none", fontSize: "0.95rem", padding: "0.5rem 0", borderBottom: "1px solid #1e1e1e" }}>
              Buy Time
            </Link>
            <Link href="/dashboard" style={{ display: "block", color: "#ccc", textDecoration: "none", fontSize: "0.95rem", padding: "0.5rem 0", borderBottom: "1px solid #1e1e1e" }}>
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
          <p style={{ fontSize: "1rem", color: "rgba(255,255,255,0.55)", lineHeight: 1.7, maxWidth: "600px" }}>
            Navigate {siteName} quickly and easily with this keypad reference guide. Select a screen below to see which keys do what.
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
                  color: activeMode === m.id ? "#fff" : "rgba(255,255,255,0.5)",
                  transition: "all 0.15s",
                }}
              >
                {m.label}
              </button>
            ))}
          </div>

          {/* Keypad + legend layout */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: "2.5rem", alignItems: "flex-start" }}>

            {/* Keypad */}
            <PhoneKeypad
              keys={current.keys}
              title={current.title}
              description={current.description}
            />

            {/* Right side: legend + quick tips */}
            <div style={{ flex: "1 1 260px", minWidth: "220px" }}>

              {/* Color legend */}
              <div style={{ background: "#111", border: "1px solid #1e1e1e", borderRadius: "12px", padding: "1.5rem", marginBottom: "1.25rem" }}>
                <h3 style={{ fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "rgba(255,255,255,0.3)", marginBottom: "1rem" }}>
                  Color Key
                </h3>
                <div style={{ display: "flex", flexDirection: "column", gap: "0.65rem" }}>
                  {legend.map(l => (
                    <div key={l.label} style={{ display: "flex", alignItems: "center", gap: "0.65rem" }}>
                      <div style={{ width: 12, height: 12, borderRadius: "50%", background: l.color, flexShrink: 0 }} />
                      <span style={{ fontSize: "0.82rem", color: "rgba(255,255,255,0.55)" }}>{l.label}</span>
                    </div>
                  ))}
                  <div style={{ display: "flex", alignItems: "center", gap: "0.65rem" }}>
                    <div style={{ width: 12, height: 12, borderRadius: "50%", background: "#2d2d2d", border: "1px solid #333", flexShrink: 0 }} />
                    <span style={{ fontSize: "0.82rem", color: "rgba(255,255,255,0.3)" }}>Not used on this screen</span>
                  </div>
                </div>
              </div>

              {/* Quick tip for current mode */}
              {activeMode === "booth" && (
                <div style={{ background: "rgba(29,78,216,0.1)", border: "1px solid rgba(29,78,216,0.3)", borderRadius: "10px", padding: "1.25rem" }}>
                  <p style={{ fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "#60a5fa", marginBottom: "0.5rem" }}>
                    Pro Tip
                  </p>
                  <p style={{ fontSize: "0.85rem", color: "rgba(255,255,255,0.6)", lineHeight: 1.65, margin: 0 }}>
                    Press <strong style={{ color: "#fff" }}>2</strong> to skip a greeting at any point — even while it's still playing. Press <strong style={{ color: "#fff" }}>3</strong> to request a live connection with whoever you're currently listening to.
                  </p>
                </div>
              )}
              {activeMode === "menu" && (
                <div style={{ background: "rgba(29,78,216,0.1)", border: "1px solid rgba(29,78,216,0.3)", borderRadius: "10px", padding: "1.25rem" }}>
                  <p style={{ fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "#60a5fa", marginBottom: "0.5rem" }}>
                    Pro Tip
                  </p>
                  <p style={{ fontSize: "0.85rem", color: "rgba(255,255,255,0.6)", lineHeight: 1.65, margin: 0 }}>
                    {isMM
                      ? <>Press <strong style={{ color: "#fff" }}>*</strong> anytime from the main menu to jump straight into the Phone Booth and start hearing live callers.</>
                      : <>Press <strong style={{ color: "#fff" }}>1</strong> from the main menu to join the action and start browsing live callers right away.</>
                    }
                  </p>
                </div>
              )}
              {activeMode === "messages" && (
                <div style={{ background: "rgba(29,78,216,0.1)", border: "1px solid rgba(29,78,216,0.3)", borderRadius: "10px", padding: "1.25rem" }}>
                  <p style={{ fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "#60a5fa", marginBottom: "0.5rem" }}>
                    Pro Tip
                  </p>
                  <p style={{ fontSize: "0.85rem", color: "rgba(255,255,255,0.6)", lineHeight: 1.65, margin: 0 }}>
                    Press <strong style={{ color: "#fff" }}>2</strong> while reading a message to hear the sender's recorded greeting before you reply.
                  </p>
                </div>
              )}
              {activeMode === "invite" && (
                <div style={{ background: "rgba(29,78,216,0.1)", border: "1px solid rgba(29,78,216,0.3)", borderRadius: "10px", padding: "1.25rem" }}>
                  <p style={{ fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "#60a5fa", marginBottom: "0.5rem" }}>
                    Pro Tip
                  </p>
                  <p style={{ fontSize: "0.85rem", color: "rgba(255,255,255,0.6)", lineHeight: 1.65, margin: 0 }}>
                    Press <strong style={{ color: "#fff" }}>3</strong> to hear the caller's greeting before deciding to accept or decline their live connect request.
                  </p>
                </div>
              )}

            </div>
          </div>

          {/* Divider */}
          <div style={{ borderTop: "1px solid #1a1a1a", margin: "3.5rem 0 3rem" }} />

          {/* Quick reference table */}
          <div>
            <h2 style={{ fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", color: "#3b82f6", marginBottom: "1.25rem" }}>
              Phone Booth — Full Key Reference
            </h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: "0.6rem" }}
              data-testid="keypad-reference-table">
              {PHONE_BOOTH_KEYS.filter(k => k.active && k.label).map(k => {
                const colorMap: Record<string, string> = {
                  blue: "#60a5fa", green: "#4ade80", red: "#f87171", amber: "#fbbf24", purple: "#c084fc",
                };
                const dotColor = k.highlight ? colorMap[k.highlight] : "#fff";
                return (
                  <div key={k.key} style={{ display: "flex", alignItems: "center", gap: "0.85rem", background: "#111", border: "1px solid #1e1e1e", borderRadius: "8px", padding: "0.65rem 0.9rem" }}
                    data-testid={`keypad-ref-${k.key}`}>
                    <div style={{ width: 36, height: 36, borderRadius: "50%", background: "#1a1a1a", border: `2px solid ${dotColor}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <span style={{ fontSize: "1rem", fontWeight: 700, color: dotColor }}>{k.key}</span>
                    </div>
                    <span style={{ fontSize: "0.85rem", fontWeight: 500, color: "rgba(255,255,255,0.7)" }}>{k.label}</span>
                  </div>
                );
              })}
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
