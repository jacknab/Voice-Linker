import { useState } from "react";
import { Phone, Loader2, Menu, X } from "lucide-react";
import { MaleBoxLogo, MaleBoxWordmark } from "@/components/SiteLayout";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import heroImgMM from "@assets/hero_mm_guy_phone.png";
import heroImgMW from "@assets/image_1775035245108.png";

const DEFAULT_PHONE = "000-000-0000";
const DEFAULT_SITE_NAME = "Male Box";

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
  linkedNumbers?: Array<{ name: string; phoneNumber: string }>;
}

interface MembershipSettings {
  freeMode: boolean;
  freeModeScheduleDays: number[] | null;
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

  const { data: membershipData } = useQuery<MembershipSettings>({
    queryKey: ["/api/membership-settings"],
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  const isFreeModeActive = membershipData?.freeMode
    || (membershipData?.freeModeScheduleDays ?? []).includes(new Date().getDay())
    || false;

  const siteName = siteData?.siteName || DEFAULT_SITE_NAME;
  const fallbackPhone = siteData?.fallbackPhoneNumber || DEFAULT_PHONE;
  const csEmail = siteData?.customerServiceEmail || null;
  const csPhone = siteData?.customerServicePhone || null;
  const isMM = (siteData?.siteCategory ?? "MM") === "MM";

  const heroImg = isMM ? heroImgMM : heroImgMW;
  const heroAlt = isMM ? "Man on the phone" : "Woman smiling on the phone";
  const introHeadline = isMM
    ? `${siteName} is your place to chat with local guys like you — anytime, anywhere.`
    : `${siteName} is your place to connect with local singles — men and women — anytime, anywhere.`;
  const introBody = isMM
    ? `${siteName} is a place where you can chat with real men looking to meet men. The Connection booth is where the action is with real guys who are on the line right now. ${siteName} is the go-to outlet for men seeking men.`
    : `${siteName} is a place where real men and women connect over the phone. Whether you're a man looking to meet women, or a woman looking to meet men, real people are on the line right now. ${siteName} is your go-to live chat line for singles of all kinds.`;
  const taglineHeadline = isMM
    ? "A gay, bi and curious live chat line in"
    : "A live chat line for men and women in";
  const taglineSubtags = isMM
    ? ["Real guys just like you", "Freedom to be yourself"]
    : ["Real men & real women", "Connect with someone near you"];
  const footerBlurb = isMM
    ? "A gay, bi & curious live chat line. Real guys, real voices."
    : "A live chat line for men and women. Real voices, real conversations.";

  const displayPhone = localData?.phoneNumber || "000-000-0000";
  const cityLabel = localData?.regionName || localData?.city || null;
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
        <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "0 1.5rem", display: "flex", alignItems: "center", justifyContent: "space-between", minHeight: "79px" }}>

          {/* Left: Logo + Site Name */}
          <div style={{ display: "flex", alignItems: "center", gap: "1.25rem" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.625rem", flexShrink: 0 }}>
              <MaleBoxLogo size={38} />
              <span style={{ fontSize: "1.15rem" }}><MaleBoxWordmark /></span>
            </div>
          </div>

          {/* Right: Nav links */}
          <div className="hidden md:flex items-center gap-6" style={{ fontSize: "0.95rem", fontWeight: 500 }}>
            <Link href="/membership"
              style={{ color: "#ccc", textDecoration: "none", fontSize: "0.95rem", fontWeight: 500, transition: "color 0.15s" }}
              onMouseEnter={(e: any) => (e.currentTarget.style.color = "#fff")}
              onMouseLeave={(e: any) => (e.currentTarget.style.color = "#ccc")}
              data-testid="nav-buy-time">
              Buy Time
            </Link>
            <div style={{ width: "1px", height: "18px", background: "#222" }} />
            <Link href="/faq"
              style={{ color: "#ccc", textDecoration: "none", fontSize: "0.95rem", fontWeight: 500, transition: "color 0.15s" }}
              onMouseEnter={(e: any) => (e.currentTarget.style.color = "#fff")}
              onMouseLeave={(e: any) => (e.currentTarget.style.color = "#ccc")}
              data-testid="nav-faq">
              FAQ
            </Link>
            <div style={{ width: "1px", height: "18px", background: "#222" }} />
            <Link href="/login"
              style={{ color: "#ccc", textDecoration: "none", fontSize: "0.95rem", fontWeight: 500, transition: "color 0.15s" }}
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

          {/* Mobile hamburger */}
          <button className="md:hidden" onClick={() => setMobileOpen(v => !v)}
            style={{ background: "none", border: "none", color: "#fff", cursor: "pointer", padding: "0.25rem" }}>
            {mobileOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>

        {/* Mobile menu */}
        {mobileOpen && (
          <div style={{ background: "#111", borderTop: "1px solid #222", padding: "1rem 1.5rem 1.5rem" }}>
            <Link href="/membership"
              style={{ display: "block", width: "100%", textAlign: "left", color: "#ccc", textDecoration: "none", fontSize: "0.95rem", padding: "0.5rem 0", borderBottom: "1px solid #1e1e1e" }}>
              Buy Time
            </Link>
            <Link href="/faq"
              style={{ display: "block", width: "100%", textAlign: "left", color: "#ccc", textDecoration: "none", fontSize: "0.95rem", padding: "0.5rem 0", borderBottom: "1px solid #1e1e1e" }}>
              FAQ
            </Link>
            <Link href="/dashboard"
              style={{ display: "block", width: "100%", textAlign: "left", color: "#ccc", textDecoration: "none", fontSize: "0.95rem", padding: "0.5rem 0", borderBottom: "1px solid #1e1e1e" }}>
              My Account
            </Link>
          </div>
        )}
      </nav>

      {/* ── HERO ── */}
      <section id="hero" className="relative overflow-hidden min-h-[260px] md:min-h-[480px] border-0 outline-none" style={{ backgroundColor: "#0d0d0d" }}>
        {/* Background image — full image, no cropping, anchored right */}
        <img
          src={heroImg}
          alt={heroAlt}
          style={{ display: "block", position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", objectPosition: "right center", filter: "saturate(0.9) brightness(0.95)", border: "none", outline: "none" }}
        />
        {/* Dark overlay — uniform for centered text readability */}
        <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.45)" }} />
        {/* Bottom fade to dark */}
        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: "80px", background: "linear-gradient(to top, #0d0d0d, transparent)" }} />

        {/* Content */}
        <div className={`relative z-10 w-full min-h-[260px] md:min-h-[480px] flex items-start px-4 md:px-16 pt-8 md:pt-14 pb-10 justify-start`}>
          <div style={{ maxWidth: "560px" }}>

            {/* Age disclaimer */}
            <p style={{ fontSize: "clamp(0.7rem, 2vw, 0.85rem)", color: "rgba(255,255,255,0.55)", marginBottom: "0.75rem", fontWeight: 400, letterSpacing: "0.04em" }}>
              All users must be 18 years or older
            </p>

            {/* Free minutes */}
            <h1 style={{ fontSize: "clamp(1.8rem, 5vw, 2.8rem)", fontWeight: 800, letterSpacing: "-0.01em", lineHeight: 1.15, marginBottom: "1rem", color: "#fff", textShadow: "2px 2px 0 #000, -2px -2px 0 #000, 2px -2px 0 #000, -2px 2px 0 #000, 3px 3px 0 #000" }}
              data-testid="hero-headline"
            >
              {isMM ? "Talk to Real Local Guys" : "Talk to Real Locals"}<br />Right Now — {isFreeModeActive ? "It's Free!" : "Try It Free Today!"}
            </h1>

            {/* Glass pill */}
            <div style={{ display: "inline-block", background: "rgba(255,255,255,0.12)", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)", border: "1px solid rgba(255,255,255,0.2)", borderRadius: "6px", padding: "0.35rem 0.9rem", marginBottom: "2.5rem" }}>
              <p style={{ fontSize: "0.95rem", color: "rgba(255,255,255,0.85)", fontWeight: 400, margin: 0 }}>
                No credit card required · Click for details
              </p>
            </div>

            {/* Local number */}
            {localLoading ? (
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "rgba(255,255,255,0.4)", fontSize: "1.1rem" }}>
                <Loader2 className="w-4 h-4 animate-spin" /> Finding your local number…
              </div>
            ) : /* linked-region multi-number display disabled
            localData?.linkedNumbers && localData.linkedNumbers.length > 0 ? (
              <div>
                <p style={{ fontSize: "clamp(0.85rem, 3vw, 1.1rem)", color: "rgba(255,255,255,0.7)", fontWeight: 400, marginBottom: "0.75rem", textShadow: "1px 1px 0 #000, -1px -1px 0 #000" }}>
                  Your local <strong style={{ color: "#fff", fontWeight: 700 }}>{cityLabel || "area"}</strong> access numbers
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                  {[{ name: localData.regionName!, phoneNumber: localData.phoneNumber! }, ...localData.linkedNumbers].map((entry, i) => (
                    <a
                      key={i}
                      href={"tel:" + entry.phoneNumber.replace(/\D/g, "")}
                      data-testid={`link-local-number-${i}`}
                      style={{ display: "flex", alignItems: "baseline", gap: "1rem", textDecoration: "none", color: "#fff", padding: "0.15rem 0" }}
                    >
                      <span style={{ fontSize: "clamp(1rem, 3vw, 1.25rem)", fontWeight: 500, color: "rgba(255,255,255,0.75)", minWidth: "7rem", textShadow: "1px 1px 0 #000" }}>{entry.name}</span>
                      <span style={{ fontSize: "clamp(1.1rem, 3.5vw, 1.5rem)", fontWeight: 900, letterSpacing: "0.01em", textShadow: "2px 2px 0 #000, -1px -1px 0 #000" }}>{formatPhone(entry.phoneNumber)}</span>
                    </a>
                  ))}
                </div>
              </div>
            ) : */ (
              <div>
                <p style={{ fontSize: "clamp(0.95rem, 4vw, 1.64rem)", color: "rgba(255,255,255,0.75)", fontWeight: 400, marginBottom: "0.2rem", textShadow: "1px 1px 0 #000, -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000" }}>
                  Your local <strong style={{ color: "#fff", fontWeight: 700 }}>{cityLabel || "area"}</strong> access number
                </p>
                <CallLink phone={displayPhone} style={{ display: "inline-block", fontSize: "clamp(1.75rem, 4vw, 2.7rem)", color: "#fff", textDecoration: "none", letterSpacing: "0.01em", lineHeight: 1.1, textShadow: "2px 2px 0 #000, -2px -2px 0 #000, 2px -2px 0 #000, -2px 2px 0 #000, 3px 3px 0 #000" }}
                  data-testid="text-local-phone"
                >
                  <span style={{ fontWeight: 400 }}>Call </span><span style={{ fontWeight: 900 }}>{formatPhone(displayPhone)}</span>
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
            <MaleBoxLogo size={22} />
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
              <div style={{ display: "flex", alignItems: "center", gap: "0.625rem", marginBottom: "0.75rem" }}>
                <MaleBoxLogo size={28} />
                <span style={{ fontSize: "0.95rem" }}><MaleBoxWordmark /></span>
              </div>
              <p style={{ fontSize: "0.78rem", color: "rgba(255,255,255,0.3)", lineHeight: 1.65 }}>
                {footerBlurb}
              </p>
            </div>
            {([
              {
                heading: "Account",
                links: [
                  { label: "Buy Time", href: "/membership" },
                  { label: "Free Trial", href: "/membership" },
                  { label: "Memberships", href: "/membership" },
                ],
              },
              {
                heading: "Help",
                links: [
                  { label: "Customer Support", href: "/support" },
                  { label: "FAQ", href: "/faq" },
                  { label: "Keypad Tips", href: "/keypad-tips" },
                  { label: "Cities Coverage", href: "/cities" },
                  { label: "Safety Tips", href: "/safety-tips" },
                  ...(csPhone ? [{ label: `Call: ${formatPhone(csPhone)}`, href: `tel:${csPhone.replace(/\D/g, "")}` }] : []),
                  ...(csEmail ? [{ label: `Email: ${csEmail}`, href: `mailto:${csEmail}` }] : []),
                ],
              },
              {
                heading: "Company",
                links: [
                  { label: "About Us", href: "/about" },
                  { label: "Privacy Policy", href: "/privacy-policy" },
                  { label: "Terms of Use", href: "/terms" },
                ],
              },
            ] as { heading: string; links: { label: string; href: string }[] }[]).map(col => (
              <div key={col.heading}>
                <h4 style={{ fontSize: "0.68rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "rgba(255,255,255,0.3)", marginBottom: "0.75rem" }}>
                  {col.heading}
                </h4>
                <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "0.45rem" }}>
                  {col.links.map(link => (
                    <li key={link.label}>
                      <a href={link.href} style={{ fontSize: "0.82rem", color: "rgba(255,255,255,0.45)", textDecoration: "none", transition: "color 0.15s" }}
                        onMouseEnter={e => (e.currentTarget.style.color = "#fff")}
                        onMouseLeave={e => (e.currentTarget.style.color = "rgba(255,255,255,0.45)")}
                      >
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
