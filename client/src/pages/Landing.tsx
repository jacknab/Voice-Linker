import { useState } from "react";
import { Phone, Loader2, Menu, X } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import heroImg from "@assets/hero_guy_1.png";

const DEFAULT_PHONE = "1-800-555-0100";


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
  if (d.length === 11 && d[0] === "1") return `1-${d.slice(1, 4)}-${d.slice(4, 7)}-${d.slice(7)}`;
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

  const { data: localData, isLoading: localLoading } = useQuery<LocalNumberData>({
    queryKey: ["/api/local-number"],
    staleTime: Infinity,
    retry: 1,
  });

  const displayPhone = localData?.phoneNumber || DEFAULT_PHONE;
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

          {/* Left: Logo + Local Number */}
          <div style={{ display: "flex", alignItems: "center", gap: "1.25rem" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexShrink: 0 }}>
              <div style={{ width: 36, height: 36, background: "#1d4ed8", borderRadius: "8px", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Phone className="w-4 h-4 text-white" />
              </div>
              <span style={{ fontSize: "1rem", fontWeight: 800, color: "#fff", letterSpacing: "-0.01em" }}>Phone Booth</span>
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
            <button onClick={() => setMobileOpen(v => !v)} style={{ background: "none", border: "none", color: "#fff", cursor: "pointer", padding: "0.25rem" }}>
              <Menu className="w-5 h-5" />
            </button>
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
      <section id="hero" style={{ position: "relative", minHeight: "500px", overflow: "hidden" }}>
        {/* Background image */}
        <img
          src={heroImg}
          alt="Man on the phone"
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", objectPosition: "center top" }}
        />
        {/* Dark gradient overlay — strong on left for readability, fading right */}
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(90deg, rgba(0,0,0,0.92) 0%, rgba(0,0,0,0.82) 42%, rgba(0,0,0,0.35) 75%, rgba(0,0,0,0.1) 100%)" }} />
        {/* Bottom fade to dark */}
        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: "120px", background: "linear-gradient(to top, #0d0d0d, transparent)" }} />

        {/* Content */}
        <div style={{ position: "relative", zIndex: 1, maxWidth: "1200px", margin: "0 auto", padding: "3.5rem 1.5rem 4rem" }}>
          <div style={{ maxWidth: "520px" }}>

            {/* Age disclaimer */}
            <p style={{ fontSize: "0.8rem", color: "rgba(255,255,255,0.65)", marginBottom: "1.25rem", fontWeight: 400 }}>
              All users must be 18 years or older
            </p>

            {/* Free minutes */}
            <h1 style={{ fontSize: "clamp(2.4rem, 6vw, 4rem)", fontWeight: 900, letterSpacing: "-0.02em", lineHeight: 1.05, marginBottom: "0.5rem", color: "#fff" }}
              data-testid="hero-headline"
            >
              60 MINUTES FREE!
            </h1>
            <p style={{ fontSize: "0.9rem", color: "rgba(255,255,255,0.6)", marginBottom: "2rem" }}>
              No credit card required · Click for details
            </p>

            {/* Local number */}
            {localLoading ? (
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "rgba(255,255,255,0.4)", fontSize: "0.9rem", marginBottom: "1.75rem" }}>
                <Loader2 className="w-4 h-4 animate-spin" /> Finding your local number…
              </div>
            ) : (
              <div style={{ marginBottom: "1.75rem" }}>
                <p style={{ fontSize: "1.05rem", color: "#fff", fontWeight: 400, marginBottom: "0.25rem" }}>
                  Your local <strong>{cityLabel || "area"}</strong> access number
                </p>
                <CallLink phone={displayPhone} style={{ display: "inline-block", fontSize: "clamp(1.6rem, 4vw, 2.4rem)", fontWeight: 900, color: "#fff", textDecoration: "none", letterSpacing: "0.02em" }}
                  data-testid="text-local-phone"
                >
                  Call {formatPhone(displayPhone)}
                </CallLink>
              </div>
            )}

          </div>
        </div>
      </section>

      {/* ── TAGLINE BAR ── */}
      <section style={{ background: "#1a1a1a", padding: "1.75rem 1.5rem", textAlign: "center", borderTop: "1px solid #2a2a2a", borderBottom: "1px solid #2a2a2a" }}>
        <div style={{ maxWidth: "900px", margin: "0 auto" }}>
          <h2 style={{ fontSize: "clamp(1rem, 2.5vw, 1.4rem)", fontWeight: 800, letterSpacing: "0.05em", textTransform: "uppercase", color: "#fff", marginBottom: "0.4rem", lineHeight: 1.3 }}>
            The most popular gay, bi and curious live chatline in{" "}
            <span style={{ color: "#3b82f6" }} data-testid="text-city-tagline">
              {cityFull || "your area"}
            </span>
          </h2>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "1.5rem", fontSize: "0.9rem", color: "rgba(255,255,255,0.6)", marginTop: "0.5rem", flexWrap: "wrap" }}>
            <span>Real guys just like you</span>
            <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#3b82f6", display: "inline-block", flexShrink: 0 }} />
            <span>Freedom to be yourself</span>
          </div>
        </div>
      </section>

      {/* ── BOTTOM CTA ── */}
      <section style={{ padding: "5rem 1.5rem", background: "#111", textAlign: "center", borderTop: "1px solid #1e1e1e" }}>
        <div style={{ maxWidth: "560px", margin: "0 auto" }}>
          <h2 style={{ fontSize: "clamp(1.5rem, 3.5vw, 2.2rem)", fontWeight: 900, letterSpacing: "-0.01em", marginBottom: "0.75rem", color: "#fff", textTransform: "uppercase" }}>
            Ready to connect?
          </h2>
          <p style={{ fontSize: "0.95rem", color: "rgba(255,255,255,0.45)", marginBottom: "2rem", lineHeight: 1.65 }}>
            Your first call is free. Just dial and step right in — no sign-up, no photos.
          </p>
          <CallLink phone={displayPhone}
            style={{ display: "inline-flex", alignItems: "center", gap: "0.6rem", background: "#1d4ed8", color: "#fff", borderRadius: "6px", padding: "0.9rem 2.5rem", fontSize: "1.1rem", fontWeight: 800, textDecoration: "none", letterSpacing: "0.01em" }}
          >
            <Phone className="w-5 h-5" /> {formatPhone(displayPhone)}
          </CallLink>
          <p style={{ fontSize: "0.72rem", color: "rgba(255,255,255,0.2)", marginTop: "0.75rem" }}>
            Free trial on your first call · Must be 18+
          </p>
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
                <span style={{ fontSize: "0.95rem", fontWeight: 800, color: "#fff" }}>Phone Booth</span>
              </div>
              <p style={{ fontSize: "0.78rem", color: "rgba(255,255,255,0.3)", lineHeight: 1.65 }}>
                The most popular gay, bi &amp; curious live chat line. Real guys, real voices.
              </p>
            </div>
            {[
              { heading: "Account", links: ["My Account", "Buy Time", "Free Trial", "Memberships", "Payment Options"] },
              { heading: "Help", links: ["Customer Support", "FAQ", "Keypad Tips", "Cities Coverage", "Safety Tips"] },
              { heading: "Company", links: ["About Us", "Affiliates", "Privacy Policy", "Terms of Use"] },
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
              © {new Date().getFullYear()} Phone Booth. All Rights Reserved.
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
