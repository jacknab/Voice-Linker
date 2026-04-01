import { useState } from "react";
import { Phone, MapPin, Loader2, ChevronRight, Users, Shield, Clock, Headphones, Zap, Flame, Mic, MessageCircle } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

const DEFAULT_PHONE = "1-800-555-0100";

const NAV_LINKS = [
  { label: "Free Trial", href: "#free-trial" },
  { label: "Buy Time", href: "#pricing" },
  { label: "My Account", href: "#account" },
  { label: "Memberships", href: "#pricing" },
  { label: "Customer Support", href: "#support" },
  { label: "FAQ", href: "#faq" },
  { label: "Keypad Tips", href: "#tips" },
  { label: "Cities Coverage", href: "#cities" },
];

const FOOTER_COLS = [
  {
    heading: "Account",
    links: ["My Account", "Buy Time", "Free Trial", "Memberships", "Payment Options"],
  },
  {
    heading: "Help",
    links: ["Customer Support", "FAQ", "Keypad Tips", "Cities Coverage", "Guidelines", "Safety Tips"],
  },
  {
    heading: "Company",
    links: ["About Us", "Affiliates", "Privacy Policy", "Terms of Use", "Security"],
  },
];

const FEATURES = [
  { icon: <Shield className="w-7 h-7" />, title: "Completely Private", desc: "Your phone number is never shared. Connect with full anonymity." },
  { icon: <Clock className="w-7 h-7" />, title: "Live 24/7", desc: "Guys are on the line at any hour, day or night." },
  { icon: <Headphones className="w-7 h-7" />, title: "Voice Over Photos", desc: "Hear someone's real energy instantly. No catfish, no games." },
  { icon: <MapPin className="w-7 h-7" />, title: "Local Guys", desc: "Connect with men in your city and surrounding areas." },
  { icon: <Zap className="w-7 h-7" />, title: "No Waiting", desc: "Hear a voice and connect in seconds. No inbox full of unanswered texts." },
  { icon: <Users className="w-7 h-7" />, title: "Real Community", desc: "Gay, bi, and curious men across hundreds of cities." },
];

const STEPS = [
  { icon: <Phone className="w-8 h-8" />, step: "1", title: "Call Your Local Number", desc: "Dial the number for your area and step right in. No app, no profile, no judgment." },
  { icon: <Mic className="w-8 h-8" />, step: "2", title: "Record Your Greeting", desc: "Drop a quick intro that's all you — your voice, your vibe, your story." },
  { icon: <MessageCircle className="w-8 h-8" />, step: "3", title: "Connect with Men", desc: "Browse guys nearby, leave messages, or jump into a live one-on-one call right now." },
];

const PRICING = [
  {
    name: "Intro",
    minutes: "30 Minutes",
    price: "$9.99",
    per: "/month",
    features: ["30 minutes of talk time", "Unlimited voice messages", "Browse local profiles", "Full caller ID privacy"],
    cta: "Get Started",
    highlight: false,
  },
  {
    name: "Connect",
    minutes: "90 Minutes",
    price: "$19.99",
    per: "/month",
    features: ["90 minutes of talk time", "Unlimited voice messages", "Priority profile placement", "Full caller ID privacy", "Save favorite profiles"],
    cta: "Most Popular",
    highlight: true,
  },
  {
    name: "All Night",
    minutes: "Unlimited",
    price: "$34.99",
    per: "/month",
    features: ["Unlimited talk time", "Unlimited voice messages", "Top placement in listings", "Premium caller ID privacy", "VIP member status"],
    cta: "Go Unlimited",
    highlight: false,
  },
];

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

function CallLink({ phone, children, className, style }: { phone: string; children: React.ReactNode; className?: string; style?: React.CSSProperties }) {
  return (
    <a href={"tel:" + phone.replace(/\D/g, "")} className={className} style={style} data-testid="link-call-now">
      {children}
    </a>
  );
}

export default function Landing() {
  const [areaCode, setAreaCode] = useState("");
  const [areaCodeResult, setAreaCodeResult] = useState<string | null>(null);
  const [areaCodeLoading, setAreaCodeLoading] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const { data: stats } = useQuery<{ activeCalls: number; users: number; profiles: number; messages: number }>({
    queryKey: ["/api/stats"],
  });

  const { data: localData, isLoading: localLoading } = useQuery<LocalNumberData>({
    queryKey: ["/api/local-number"],
    staleTime: Infinity,
    retry: 1,
  });

  const displayPhone = areaCodeResult || localData?.phoneNumber || DEFAULT_PHONE;
  const cityLabel = localData?.city && localData?.state ? `${localData.city}, ${localData.state}` : null;
  const isLocalNumber = !!(areaCodeResult || localData?.phoneNumber);

  async function handleAreaCodeLookup() {
    if (areaCode.length < 3) return;
    setAreaCodeLoading(true);
    try {
      const res = await fetch(`/api/local-number?areacode=${encodeURIComponent(areaCode)}`);
      const data: LocalNumberData = await res.json();
      setAreaCodeResult(data.phoneNumber);
    } catch {
      setAreaCodeResult(null);
    } finally {
      setAreaCodeLoading(false);
    }
  }

  const scrollTo = (href: string) => {
    if (!href.startsWith("#")) return;
    const el = document.querySelector(href);
    if (el) el.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <div style={{ fontFamily: "'Inter', system-ui, sans-serif", background: "#0e0e1a", color: "#f0f0ff", minHeight: "100vh" }} data-landing>

      {/* ── TOP BAR ── */}
      <div style={{ background: "#6d28d9", textAlign: "center", padding: "0.5rem 1rem", fontSize: "0.8rem", fontWeight: 600, letterSpacing: "0.04em", color: "#fff" }}>
        All users must be 18 years or older
      </div>

      {/* ── NAV ── */}
      <nav style={{ background: "#13111f", borderBottom: "1px solid rgba(109,40,217,0.3)" }}>
        <div style={{ maxWidth: "1100px", margin: "0 auto", padding: "0 1.5rem", display: "flex", alignItems: "center", justifyContent: "space-between", height: "62px" }}>
          {/* Logo */}
          <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
            <div style={{ width: 34, height: 34, borderRadius: "8px", background: "linear-gradient(135deg,#7c3aed,#a855f7)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Phone className="w-4 h-4 text-white" />
            </div>
            <span style={{ fontSize: "1.15rem", fontWeight: 800, color: "#e2d9ff", letterSpacing: "-0.02em" }}>
              Phone Booth
            </span>
          </div>

          {/* Desktop links */}
          <div className="hidden md:flex items-center gap-5" style={{ fontSize: "0.82rem", fontWeight: 500 }}>
            {NAV_LINKS.slice(0, 6).map((l) => (
              <button
                key={l.label}
                onClick={() => scrollTo(l.href)}
                style={{ background: "none", border: "none", color: "rgba(224,220,255,0.65)", cursor: "pointer", fontSize: "0.82rem", fontWeight: 500, padding: 0, transition: "color 0.15s" }}
                onMouseEnter={(e) => (e.currentTarget.style.color = "#e2d9ff")}
                onMouseLeave={(e) => (e.currentTarget.style.color = "rgba(224,220,255,0.65)")}
                data-testid={`nav-${l.label.toLowerCase().replace(/\s+/g, "-")}`}
              >
                {l.label}
              </button>
            ))}
          </div>

          {/* Call CTA */}
          <CallLink
            phone={displayPhone}
            style={{ background: "linear-gradient(135deg,#7c3aed,#a855f7)", color: "#fff", borderRadius: "2rem", padding: "0.45rem 1.2rem", fontSize: "0.82rem", fontWeight: 700, textDecoration: "none", display: "flex", alignItems: "center", gap: "0.4rem", boxShadow: "0 0 18px rgba(124,58,237,0.4)" }}
          >
            <Phone className="w-3.5 h-3.5" /> Call Free
          </CallLink>
        </div>
      </nav>

      {/* ── HERO ── */}
      <section
        id="free-trial"
        style={{
          background: "linear-gradient(180deg, #13111f 0%, #0e0e1a 100%)",
          padding: "5rem 1.5rem 4.5rem",
          textAlign: "center",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Background glow */}
        <div style={{ position: "absolute", top: "-6rem", left: "50%", transform: "translateX(-50%)", width: "60rem", height: "30rem", background: "radial-gradient(ellipse, rgba(109,40,217,0.18) 0%, transparent 70%)", pointerEvents: "none" }} />

        <div style={{ maxWidth: "680px", margin: "0 auto", position: "relative" }}>

          {/* Free badge */}
          <div style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem", background: "rgba(109,40,217,0.2)", border: "1px solid rgba(109,40,217,0.4)", borderRadius: "2rem", padding: "0.4rem 1.1rem", fontSize: "0.8rem", fontWeight: 600, color: "#c4b5fd", marginBottom: "1.5rem" }}
            data-testid="badge-free-trial"
          >
            <Flame className="w-3.5 h-3.5" />
            60 Minutes Free — No credit card required
          </div>

          {/* Headline */}
          <h1 style={{ fontSize: "clamp(2rem, 5vw, 3.2rem)", fontWeight: 900, letterSpacing: "-0.03em", lineHeight: 1.1, marginBottom: "0.75rem", color: "#f0f0ff" }}>
            The most popular gay, bi &amp; curious
            <br />
            <span style={{ background: "linear-gradient(90deg,#c4b5fd,#a78bfa,#8b5cf6)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
              live chat line in your area
            </span>
          </h1>

          <p style={{ fontSize: "1rem", color: "rgba(224,220,255,0.55)", marginBottom: "2.5rem", fontWeight: 400, lineHeight: 1.6 }}>
            Real guys just like you. Freedom to be yourself.
          </p>

          {/* ── LOCAL NUMBER BLOCK ── */}
          <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(109,40,217,0.35)", borderRadius: "1.25rem", padding: "2rem 2rem 1.75rem", marginBottom: "1.5rem" }}>

            {/* Location label */}
            <div style={{ fontSize: "0.75rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.12em", color: "rgba(196,181,253,0.55)", marginBottom: "0.35rem" }}
              data-testid="text-number-label"
            >
              {localLoading
                ? "Finding your local number…"
                : isLocalNumber && cityLabel
                  ? `Your ${cityLabel} access number`
                  : isLocalNumber && localData?.regionName
                    ? `Your ${localData.regionName} access number`
                    : "Your local access number"}
            </div>

            {/* Phone number */}
            {localLoading ? (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "0.6rem", height: "3.5rem", color: "rgba(196,181,253,0.5)", fontSize: "0.9rem" }}>
                <Loader2 className="w-5 h-5 animate-spin" /> Looking up your city…
              </div>
            ) : (
              <CallLink
                phone={displayPhone}
                style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "0.75rem", fontSize: "clamp(1.6rem, 4vw, 2.4rem)", fontWeight: 900, color: "#fff", textDecoration: "none", letterSpacing: "0.03em", lineHeight: 1.1, marginBottom: "0.6rem" }}
              >
                <Phone className="w-6 h-6 flex-shrink-0" style={{ color: "#a78bfa" }} />
                <span data-testid="text-local-phone">{formatPhone(displayPhone)}</span>
              </CallLink>
            )}

            {/* City pill */}
            {cityLabel && !localLoading && (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "0.35rem", fontSize: "0.78rem", color: "#a78bfa", fontWeight: 500, marginTop: "0.3rem", marginBottom: "0.75rem" }}
                data-testid="text-detected-city"
              >
                <MapPin className="w-3.5 h-3.5" /> Detected from your location: {cityLabel}
              </div>
            )}

            {/* Call button */}
            {!localLoading && (
              <div style={{ marginTop: "0.75rem" }}>
                <CallLink
                  phone={displayPhone}
                  style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem", background: "linear-gradient(135deg,#7c3aed,#a855f7)", color: "#fff", borderRadius: "3rem", padding: "0.85rem 2.5rem", fontSize: "1.05rem", fontWeight: 800, textDecoration: "none", boxShadow: "0 6px 32px rgba(124,58,237,0.5)" }}
                >
                  <Phone className="w-5 h-5" /> Call Free Now
                </CallLink>
                <p style={{ fontSize: "0.72rem", color: "rgba(224,220,255,0.3)", margin: "0.6rem 0 0", fontWeight: 400 }}>
                  Free trial on your first call · Must be 18+
                </p>
              </div>
            )}
          </div>

          {/* ── AREA CODE FINDER ── */}
          <div style={{ padding: "1.25rem", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(109,40,217,0.2)", borderRadius: "1rem" }}>
            <p style={{ fontSize: "0.82rem", color: "rgba(196,181,253,0.6)", marginBottom: "0.75rem", fontWeight: 500 }}>
              Not seeing your area? Enter your area code to get your number
            </p>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "0.6rem" }}>
              <input
                type="text"
                placeholder="e.g. 214"
                maxLength={3}
                value={areaCode}
                onChange={(e) => { setAreaCode(e.target.value.replace(/\D/g, "")); setAreaCodeResult(null); }}
                onKeyDown={(e) => e.key === "Enter" && handleAreaCodeLookup()}
                style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(109,40,217,0.35)", borderRadius: "0.6rem", padding: "0.6rem 1rem", color: "#f0f0ff", fontSize: "0.95rem", outline: "none", width: "7rem", textAlign: "center", fontFamily: "system-ui, sans-serif" }}
                data-testid="input-area-code"
              />
              <button
                onClick={handleAreaCodeLookup}
                disabled={areaCode.length < 3 || areaCodeLoading}
                style={{ background: "linear-gradient(135deg,#7c3aed,#a855f7)", color: "#fff", border: "none", borderRadius: "0.6rem", padding: "0.6rem 1.2rem", fontSize: "0.9rem", fontWeight: 700, cursor: areaCode.length < 3 ? "not-allowed" : "pointer", display: "flex", alignItems: "center", gap: "0.35rem", opacity: areaCode.length < 3 ? 0.55 : 1, transition: "opacity 0.15s" }}
                data-testid="button-find-number"
              >
                {areaCodeLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <><span>Find my number</span><ChevronRight className="w-4 h-4" /></>}
              </button>
            </div>
            {areaCodeResult && (
              <p style={{ fontSize: "0.82rem", color: "#a78bfa", marginTop: "0.6rem", fontWeight: 600 }}
                data-testid="text-area-code-result"
              >
                Your number: {formatPhone(areaCodeResult)}
              </p>
            )}
          </div>

          {/* Live stat */}
          <div style={{ marginTop: "1.5rem", display: "flex", alignItems: "center", justifyContent: "center", gap: "0.5rem", fontSize: "0.8rem", color: "rgba(196,181,253,0.5)", fontWeight: 500 }}
            data-testid="badge-active-callers"
          >
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#4ade80", display: "inline-block", animation: "pulse 2s infinite", flexShrink: 0 }} />
            {localData?.regionName
              ? `${localData.activeCalls} guys on the line in ${localData.regionName} right now`
              : `${stats?.activeCalls ?? 0} guys on the line right now`}
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ── */}
      <section id="how-it-works" style={{ padding: "5rem 1.5rem", background: "#0e0e1a" }}>
        <div style={{ maxWidth: "1000px", margin: "0 auto" }}>
          <h2 style={{ textAlign: "center", fontSize: "clamp(1.5rem, 3vw, 2.1rem)", fontWeight: 800, letterSpacing: "-0.025em", marginBottom: "0.6rem", color: "#f0f0ff" }}>
            How It Works
          </h2>
          <p style={{ textAlign: "center", fontSize: "0.95rem", color: "rgba(196,181,253,0.5)", marginBottom: "3rem" }}>
            Three steps and you're in. No app, no photos, just your voice.
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "1.5rem" }}>
            {STEPS.map((s) => (
              <div key={s.step} style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(109,40,217,0.25)", borderRadius: "1.1rem", padding: "2rem 1.75rem" }}>
                <div style={{ width: 52, height: 52, borderRadius: "50%", background: "rgba(109,40,217,0.18)", border: "1px solid rgba(109,40,217,0.35)", display: "flex", alignItems: "center", justifyContent: "center", color: "#a78bfa", marginBottom: "1.1rem" }}>
                  {s.icon}
                </div>
                <div style={{ fontSize: "0.7rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "#7c3aed", marginBottom: "0.4rem" }}>
                  Step {s.step}
                </div>
                <h3 style={{ fontSize: "1.05rem", fontWeight: 700, color: "#f0f0ff", marginBottom: "0.5rem" }}>{s.title}</h3>
                <p style={{ fontSize: "0.875rem", color: "rgba(196,181,253,0.55)", lineHeight: 1.65 }}>{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FEATURES ── */}
      <section style={{ padding: "5rem 1.5rem", background: "#0b0b18" }}>
        <div style={{ maxWidth: "1000px", margin: "0 auto" }}>
          <h2 style={{ textAlign: "center", fontSize: "clamp(1.5rem, 3vw, 2.1rem)", fontWeight: 800, letterSpacing: "-0.025em", marginBottom: "0.6rem", color: "#f0f0ff" }}>
            Why Phone Booth
          </h2>
          <p style={{ textAlign: "center", fontSize: "0.95rem", color: "rgba(196,181,253,0.5)", marginBottom: "3rem" }}>
            Voice-first connection — the way it was always meant to be.
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(270px, 1fr))", gap: "1.25rem" }}>
            {FEATURES.map((f) => (
              <div key={f.title} style={{ background: "rgba(255,255,255,0.025)", border: "1px solid rgba(109,40,217,0.2)", borderRadius: "1rem", padding: "1.5rem 1.5rem", display: "flex", gap: "1rem", alignItems: "flex-start" }}>
                <div style={{ color: "#a78bfa", flexShrink: 0, marginTop: "0.1rem" }}>{f.icon}</div>
                <div>
                  <h4 style={{ fontSize: "0.95rem", fontWeight: 700, color: "#f0f0ff", marginBottom: "0.3rem" }}>{f.title}</h4>
                  <p style={{ fontSize: "0.84rem", color: "rgba(196,181,253,0.5)", lineHeight: 1.6 }}>{f.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── PRICING ── */}
      <section id="pricing" style={{ padding: "5rem 1.5rem", background: "#0e0e1a" }}>
        <div style={{ maxWidth: "980px", margin: "0 auto" }}>
          <h2 style={{ textAlign: "center", fontSize: "clamp(1.5rem, 3vw, 2.1rem)", fontWeight: 800, letterSpacing: "-0.025em", marginBottom: "0.6rem", color: "#f0f0ff" }}>
            Memberships
          </h2>
          <p style={{ textAlign: "center", fontSize: "0.95rem", color: "rgba(196,181,253,0.5)", marginBottom: "3rem" }}>
            Start free — upgrade when you're ready.
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "1.25rem" }}>
            {PRICING.map((plan) => (
              <div key={plan.name} style={{ background: plan.highlight ? "rgba(109,40,217,0.18)" : "rgba(255,255,255,0.03)", border: plan.highlight ? "1.5px solid rgba(139,92,246,0.6)" : "1px solid rgba(109,40,217,0.2)", borderRadius: "1.1rem", padding: "2rem 1.75rem", position: "relative" }}
                data-testid={`card-plan-${plan.name.toLowerCase()}`}
              >
                {plan.highlight && (
                  <div style={{ position: "absolute", top: "-0.65rem", left: "50%", transform: "translateX(-50%)", background: "linear-gradient(135deg,#7c3aed,#a855f7)", color: "#fff", borderRadius: "2rem", padding: "0.2rem 0.9rem", fontSize: "0.7rem", fontWeight: 700, letterSpacing: "0.06em", whiteSpace: "nowrap" }}>
                    MOST POPULAR
                  </div>
                )}
                <div style={{ fontSize: "0.7rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "#7c3aed", marginBottom: "0.3rem" }}>{plan.minutes}</div>
                <h3 style={{ fontSize: "1.2rem", fontWeight: 800, color: "#f0f0ff", marginBottom: "0.25rem" }}>{plan.name}</h3>
                <div style={{ fontSize: "2rem", fontWeight: 900, color: plan.highlight ? "#c4b5fd" : "#a78bfa", marginBottom: "0.1rem" }}>
                  {plan.price}<span style={{ fontSize: "0.9rem", fontWeight: 500, color: "rgba(196,181,253,0.45)" }}>{plan.per}</span>
                </div>
                <hr style={{ border: "none", borderTop: "1px solid rgba(109,40,217,0.2)", margin: "1.25rem 0" }} />
                <ul style={{ listStyle: "none", padding: 0, margin: "0 0 1.5rem", display: "flex", flexDirection: "column", gap: "0.55rem" }}>
                  {plan.features.map((feat) => (
                    <li key={feat} style={{ fontSize: "0.84rem", color: "rgba(196,181,253,0.65)", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                      <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#7c3aed", flexShrink: 0, display: "inline-block" }} />
                      {feat}
                    </li>
                  ))}
                </ul>
                <CallLink
                  phone={displayPhone}
                  style={{ display: "block", textAlign: "center", background: plan.highlight ? "linear-gradient(135deg,#7c3aed,#a855f7)" : "rgba(109,40,217,0.2)", color: "#fff", borderRadius: "0.75rem", padding: "0.75rem", fontSize: "0.9rem", fontWeight: 700, textDecoration: "none", border: plan.highlight ? "none" : "1px solid rgba(109,40,217,0.35)" }}
                >
                  {plan.cta}
                </CallLink>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── BOTTOM CTA ── */}
      <section style={{ padding: "5rem 1.5rem", background: "linear-gradient(180deg,#13111f 0%,#0e0e1a 100%)", textAlign: "center" }}>
        <div style={{ maxWidth: "560px", margin: "0 auto" }}>
          <h2 style={{ fontSize: "clamp(1.6rem, 3.5vw, 2.3rem)", fontWeight: 900, letterSpacing: "-0.03em", marginBottom: "0.75rem", color: "#f0f0ff" }}>
            Ready to connect?
          </h2>
          <p style={{ fontSize: "0.95rem", color: "rgba(196,181,253,0.5)", marginBottom: "2rem", lineHeight: 1.65 }}>
            Your first call is free. Just dial and step right in — no sign-up, no photos, no swipe.
          </p>
          <CallLink
            phone={displayPhone}
            style={{ display: "inline-flex", alignItems: "center", gap: "0.6rem", background: "linear-gradient(135deg,#7c3aed,#a855f7)", color: "#fff", borderRadius: "3rem", padding: "1rem 2.5rem", fontSize: "1.1rem", fontWeight: 800, textDecoration: "none", boxShadow: "0 8px 36px rgba(124,58,237,0.5)" }}
          >
            <Phone className="w-5 h-5" /> {formatPhone(displayPhone)}
          </CallLink>
          <p style={{ fontSize: "0.72rem", color: "rgba(224,220,255,0.25)", marginTop: "0.75rem" }}>
            Free trial on your first call · Must be 18+
          </p>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer style={{ background: "#09090f", borderTop: "1px solid rgba(109,40,217,0.2)", padding: "3.5rem 1.5rem 2rem" }}>
        <div style={{ maxWidth: "1000px", margin: "0 auto" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "2rem", marginBottom: "3rem" }}>
            {/* Brand col */}
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.75rem" }}>
                <div style={{ width: 28, height: 28, borderRadius: "7px", background: "linear-gradient(135deg,#7c3aed,#a855f7)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Phone className="w-3.5 h-3.5 text-white" />
                </div>
                <span style={{ fontSize: "1rem", fontWeight: 800, color: "#e2d9ff" }}>Phone Booth</span>
              </div>
              <p style={{ fontSize: "0.78rem", color: "rgba(196,181,253,0.4)", lineHeight: 1.65 }}>
                The most popular gay, bi &amp; curious live chat line. Real guys, real voices, real connections.
              </p>
            </div>

            {/* Link cols */}
            {FOOTER_COLS.map((col) => (
              <div key={col.heading}>
                <h4 style={{ fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "rgba(196,181,253,0.45)", marginBottom: "0.75rem" }}>
                  {col.heading}
                </h4>
                <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                  {col.links.map((link) => (
                    <li key={link}>
                      <a href="#" style={{ fontSize: "0.82rem", color: "rgba(196,181,253,0.5)", textDecoration: "none", transition: "color 0.15s" }}
                        onMouseEnter={(e) => (e.currentTarget.style.color = "#c4b5fd")}
                        onMouseLeave={(e) => (e.currentTarget.style.color = "rgba(196,181,253,0.5)")}
                      >
                        {link}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <div style={{ borderTop: "1px solid rgba(109,40,217,0.15)", paddingTop: "1.5rem", display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: "0.75rem" }}>
            <p style={{ fontSize: "0.76rem", color: "rgba(196,181,253,0.3)" }}>
              © {new Date().getFullYear()} Phone Booth. All Rights Reserved.
            </p>
            <p style={{ fontSize: "0.76rem", color: "rgba(196,181,253,0.3)" }}>
              All callers must be 18 years or older.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
