import { useState } from "react";
import { Phone, Loader2, Menu, X } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import heroImgMM from "@assets/hero_guy_1.png";
import heroImgMW from "@assets/image_1775034559566.png";

const DEFAULT_PHONE = "800-730-2508";
const DEFAULT_SITE_NAME = "Phone Booth";

interface SiteSettings {
  siteName: string;
  fallbackPhoneNumber: string;
  customerServiceEmail: string | null;
  customerServicePhone: string | null;
  siteCategory: string;
}

interface LocalNumberData {
  city: string | null;
  state: string | null;
  phoneNumber: string | null;
  regionName: string | null;
  regionId: string | null;
  activeCalls: number;
}

function formatPhone(raw: string | null | undefined): string {
  if (!raw) return DEFAULT_PHONE;
  const d = raw.replace(/\D/g, "");
  if (d.length === 10) return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
  if (d.length === 11 && d[0] === "1") return `${d.slice(1, 4)}-${d.slice(4, 7)}-${d.slice(7)}`;
  return raw;
}

function CallLink({ phone, children, className, style }: {
  phone: string;
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <a href={"tel:" + phone.replace(/\D/g, "")} className={className} style={style} data-testid="link-call-now">
      {children}
    </a>
  );
}

export default function Landing() {
  const [mobileOpen, setMobileOpen] = useState(false);

  const { data: siteData } = useQuery<SiteSettings>({
    queryKey: ["/api/site-settings"],
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  const { data: localData, isLoading: localLoading } = useQuery<LocalNumberData>({
    queryKey: ["/api/local-number"],
    staleTime: Infinity,
    retry: 1,
  });

  const siteName = siteData?.siteName || DEFAULT_SITE_NAME;
  const fallbackPhone = siteData?.fallbackPhoneNumber || DEFAULT_PHONE;
  const csEmail = siteData?.customerServiceEmail || null;
  const csPhone = siteData?.customerServicePhone || null;
  const isMM = (siteData?.siteCategory ?? "MM") === "MM";

  const heroImg = isMM ? heroImgMM : heroImgMW;
  const heroAlt = isMM ? "Man on the phone" : "Man and woman on the phone";
  const introHeadline = isMM
    ? `${siteName} is the best place to chat with local guys like you — anytime, anywhere.`
    : `${siteName} is the best place to meet local women near you — anytime, anywhere.`;
  const introBody = isMM
    ? `${siteName} is a place where you can chat with real men looking to meet men. The Connection booth is where the action is with real guys who are on the line right now. ${siteName} is the go-to outlet for men seeking men.`
    : `${siteName} is a place where you can chat with real local men looking to meet women. The Connection booth is where the action is with real people who are on the line right now. ${siteName} is the go-to outlet for men seeking women.`;
  const taglineHeadline = isMM
    ? "The most popular gay, bi and curious live chatline in"
    : "The most popular men-seeking-women live chatline in";
  const taglineSubtags = isMM
    ? ["Real guys just like you", "Freedom to be yourself"]
    : ["Real men, real women", "Connect with someone near you"];
  const footerBlurb = isMM
    ? "The most popular gay, bi & curious live chat line. Real guys, real voices."
    : "The most popular men-seeking-women live chat line. Real conversations, real connections.";

  const displayPhone = localData?.phoneNumber || fallbackPhone;
  const cityLabel = localData?.city || localData?.regionName || null;
  const stateLabel = localData?.state || null;
  const cityFull = cityLabel && stateLabel ? `${cityLabel}, ${stateLabel}` : cityLabel;

  const scrollTo = (id: string) => {
    document.querySelector(id)?.scrollIntoView({ behavior: "smooth" });
    setMobileOpen(false);
  };

  return (
    <div data-landing style={{ fontFamily: "'Inter', system-ui, sans-serif", background: "#0d0d0d", color: "#fff", minHeight: "100vh" }}>

      {/* ── NAVBAR ── */}
      <nav style={{ background: "#000", position: "sticky", top: 0, zIndex: 100, borderBottom: "1px solid #1a1a1a" }}>
        <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "0 1.5rem", display: "flex", alignItems: "center", justifyContent: "space-between", minHeight: "64px" }}>

          {/* Left: Logo + Site Name */}
          <div style={{ display: "flex", alignItems: "center", gap: "1.25rem" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexShrink: 0 }}>
              <div style={{ width: 36, height: 36, background: "#1d4ed8", borderRadius: "8px", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Phone className="w-4 h-4 text-white" />
              </div>
              <span style={{ fontSize: "1rem", fontWeight: 800, color: "#fff", letterSpacing: "-0.01em" }}>{siteName}</span>
            </div>
          </div>

          {/* Right: Nav links */}
          <div className="hidden md:flex items-center gap-6" style={{ fontSize: "0.85rem", fontWeight: 500 }}>
            {[
              { label: "Buy Time", href: "#pricing" },
              { label: "My Account", href: "#account" },
            ].map(l => (
              <button key={l.label} onClick={() => scrollTo(l.href)}
                style={{ background: "none", border: "none", color: "#ccc", cursor: "pointer", fontSize: "0.85rem", fontWeight: 500, padding: 0, transition: "color 0.15s" }}
                onMouseEnter={e => (e.currentTarget.style.color = "#fff")}
                onMouseLeave={e => (e.currentTarget.style.color = "#ccc")}
                data-testid={`nav-${l.label.toLowerCase().replace(/\s+/g, "-")}`}
              >
                {l.label}
              </button>
            ))}
            <div style={{ width: "1px", height: "18px", background: "#222" }} />
            <Link href="/login"
              style={{ color: "#ccc", textDecoration: "none", fontSize: "0.85rem", fontWeight: 500, transition: "color 0.15s" }}
              onMouseEnter={(e: any) => (e.currentTarget.style.color = "#fff")}
              onMouseLeave={(e: any) => (e.currentTarget.style.color = "#ccc")}
              data-testid="nav-sign-in">
              Sign in
            </Link>
            <Link href="/register"
              style={{ background: "#1d4ed8", color: "#fff", textDecoration: "none", fontSize: "0.82rem", fontWeight: 700, padding: "0.4rem 0.875rem", borderRadius: "7px", transition: "background 0.15s" }}
              onMouseEnter={(e: any) => (e.currentTarget.style.background = "#1e40af")}
              onMouseLeave={(e: any) => (e.currentTarget.style.background = "#1d4ed8")}
              data-testid="nav-register">
              Register
            </Link>
          </div>

          {/* Mobile hamburger */}
          <button className="md:hidden" onClick={() => setMobileOpen(v => !v)}
            style={{ background: "none", border: "none", color: "#fff", cursor: "pointer", padding: "0.25rem" }}>
            {mobileOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>

        {/* Mobile menu */}
        {mobileOpen && (
          <div style={{ background: "#111", borderTop: "1px solid #222", padding: "1rem 1.5rem 1.5rem" }}>
            {["Buy Time", "My Account"].map(l => (
              <button key={l} onClick={() => scrollTo("#pricing")}
                style={{ display: "block", width: "100%", textAlign: "left", background: "none", border: "none", color: "#ccc", cursor: "pointer", fontSize: "0.95rem", padding: "0.5rem 0", borderBottom: "1px solid #1e1e1e" }}>
                {l}
              </button>
            ))}
          </div>
        )}
      </nav>

      {/* ── HERO ── */}
      <section id="hero" className="relative overflow-hidden min-h-[260px] md:min-h-[500px]">
        {/* Background image */}
        <img
          src={heroImg}
          alt={heroAlt}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", objectPosition: "55% 55%", filter: "saturate(0.7) brightness(0.75)" }}
        />
        {/* Dark overlay — uniform for centered text readability */}
        <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.62)" }} />
        {/* Bottom fade to dark */}
        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: "80px", background: "linear-gradient(to top, #0d0d0d, transparent)" }} />

        {/* Content */}
        <div className="relative z-10 w-full min-h-[260px] md:min-h-[500px] flex items-center justify-center px-6 py-8 md:py-14 md:pb-16">
          <div style={{ maxWidth: "520px", textAlign: "center" }}>

            {/* Age disclaimer */}
            <p style={{ fontSize: "0.8rem", color: "rgba(255,255,255,0.65)", marginBottom: "1.25rem", fontWeight: 400 }}>
              All users must be 18 years or older
            </p>

            {/* Free minutes */}
            <h1 style={{ fontSize: "clamp(1.8rem, 5vw, 3.5rem)", fontWeight: 900, letterSpacing: "-0.02em", lineHeight: 1.05, marginBottom: "0.5rem", color: "#fff", whiteSpace: "nowrap" }}
              data-testid="hero-headline"
            >
              90 MINUTES FREE!
            </h1>
            <p style={{ fontSize: "1.15rem", color: "rgba(255,255,255,0.7)", marginBottom: "1.25rem" }}>
              No credit card required · Click for details
            </p>

            {/* Local number */}
            {localLoading ? (
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "rgba(255,255,255,0.4)", fontSize: "1.1rem", marginBottom: "1.75rem" }}>
                <Loader2 className="w-4 h-4 animate-spin" /> Finding your local number…
              </div>
            ) : (
              <div style={{ marginBottom: "1.75rem" }}>
                <p style={{ fontSize: "1.35rem", color: "#fff", fontWeight: 400, marginBottom: "0.35rem" }}>
                  Your local <strong>{cityLabel || "area"}</strong> access number
                </p>
                <CallLink phone={displayPhone} style={{ display: "inline-block", fontSize: "clamp(2rem, 5vw, 3rem)", fontWeight: 900, color: "#fff", textDecoration: "none", letterSpacing: "0.02em" }}
                  data-testid="text-local-phone"
                >
                  Call {formatPhone(displayPhone)}
                </CallLink>
              </div>
            )}

          </div>
        </div>
      </section>

      {/* ── INTRO BLURB ── */}
      <section style={{ background: "#f4f4f4", padding: "3.5rem 1.5rem", textAlign: "center" }}>
        <div style={{ maxWidth: "760px", margin: "0 auto" }}>
          <h2 style={{ fontSize: "clamp(1.4rem, 3vw, 2rem)", fontWeight: 800, color: "#111", lineHeight: 1.35, marginBottom: "1.25rem" }}>
            {introHeadline}
          </h2>
          <p style={{ fontSize: "1rem", color: "#444", lineHeight: 1.75, marginBottom: "1.5rem" }}>
            {introBody}
          </p>
          <CallLink phone={displayPhone}
            style={{ fontSize: "1.25rem", fontWeight: 800, color: "#1d6fa8", textDecoration: "none", letterSpacing: "-0.01em" }}
            data-testid="link-try-free"
          >
            Try it FOR FREE!
          </CallLink>
        </div>
      </section>

      {/* ── TAGLINE BAR ── */}
      <section style={{ background: "#1a1a1a", padding: "1.75rem 1.5rem", textAlign: "center", borderTop: "1px solid #2a2a2a", borderBottom: "1px solid #2a2a2a" }}>
        <div style={{ maxWidth: "900px", margin: "0 auto" }}>
          <h2 style={{ fontSize: "clamp(1rem, 2.5vw, 1.4rem)", fontWeight: 800, letterSpacing: "0.05em", textTransform: "uppercase", color: "#fff", marginBottom: "0.4rem", lineHeight: 1.3 }}>
            {taglineHeadline}{" "}
            <span style={{ color: "#3b82f6" }} data-testid="text-city-tagline">
              {cityFull || "your area"}
            </span>
          </h2>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "1.5rem", fontSize: "0.9rem", color: "rgba(255,255,255,0.6)", marginTop: "0.5rem", flexWrap: "wrap" }}>
            <span>{taglineSubtags[0]}</span>
            <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#3b82f6", display: "inline-block", flexShrink: 0 }} />
            <span>{taglineSubtags[1]}</span>
          </div>
        </div>
      </section>

      {/* ── BOTTOM CTA ── */}
      <section style={{ padding: "5rem 1.5rem", background: "#111", textAlign: "center", borderTop: "1px solid #1e1e1e" }}>
        <div style={{ maxWidth: "560px", margin: "0 auto" }}>
          <h2 style={{ fontSize: "clamp(1.5rem, 3.5vw, 2.2rem)", fontWeight: 900, letterSpacing: "-0.01em", marginBottom: "0.75rem", color: "#fff", textTransform: "uppercase" }}>
            Ready to connect?
          </h2>
          <p style={{ fontSize: "0.95rem", color: "#fff", marginBottom: "2rem", lineHeight: 1.65 }}>
            Your first call is free. Just dial and step right in — no sign-up, no photos.
          </p>
          <CallLink phone={displayPhone}
            style={{ display: "inline-flex", alignItems: "center", gap: "0.6rem", background: "#1d4ed8", color: "#fff", borderRadius: "6px", padding: "0.9rem 2.5rem", fontSize: "1.1rem", fontWeight: 800, textDecoration: "none", letterSpacing: "0.01em" }}
          >
            <Phone className="w-5 h-5" /> {formatPhone(displayPhone)}
          </CallLink>

          {/* Customer service contact info — only shown when configured */}
          {(csEmail || csPhone) && (
            <div style={{ marginTop: "2rem", display: "flex", flexDirection: "column", alignItems: "center", gap: "0.5rem" }}>
              <p style={{ fontSize: "0.8rem", color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600 }}>
                Customer Support
              </p>
              {csPhone && (
                <a href={"tel:" + csPhone.replace(/\D/g, "")}
                  style={{ fontSize: "0.9rem", color: "rgba(255,255,255,0.6)", textDecoration: "none" }}
                  data-testid="link-cs-phone"
                >
                  {formatPhone(csPhone)}
                </a>
              )}
              {csEmail && (
                <a href={"mailto:" + csEmail}
                  style={{ fontSize: "0.9rem", color: "rgba(255,255,255,0.6)", textDecoration: "none" }}
                  data-testid="link-cs-email"
                >
                  {csEmail}
                </a>
              )}
            </div>
          )}
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
              { heading: "Account", links: ["Buy Time", "Free Trial", "Memberships"] },
              {
                heading: "Help",
                links: [
                  "Customer Support",
                  "FAQ",
                  "Keypad Tips",
                  "Cities Coverage",
                  "Safety Tips",
                  ...(csPhone ? [`Call: ${formatPhone(csPhone)}`] : []),
                  ...(csEmail ? [`Email: ${csEmail}`] : []),
                ],
              },
              { heading: "Company", links: ["About Us", "Privacy Policy", "Terms of Use"] },
            ].map(col => (
              <div key={col.heading}>
                <h4 style={{ fontSize: "0.68rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "rgba(255,255,255,0.3)", marginBottom: "0.75rem" }}>
                  {col.heading}
                </h4>
                <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "0.45rem" }}>
                  {col.links.map(link => (
                    <li key={link}>
                      <a href="#" style={{ fontSize: "0.82rem", color: "rgba(255,255,255,0.45)", textDecoration: "none", transition: "color 0.15s" }}
                        onMouseEnter={e => (e.currentTarget.style.color = "#fff")}
                        onMouseLeave={e => (e.currentTarget.style.color = "rgba(255,255,255,0.45)")}
                      >
                        {link}
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
