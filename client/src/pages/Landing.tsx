import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Phone, Mic, MessageCircle, Star, ChevronRight, CheckCircle, Headphones, Heart, Shield, Clock, Zap, Play, MapPin, Loader2, Users, Flame } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

const DEFAULT_PHONE = "1-800-555-0100";

const NAV_LINKS = [
  { label: "How It Works", href: "#how-it-works" },
  { label: "Who's Here", href: "#community" },
  { label: "Pricing", href: "#pricing" },
];

const STEPS = [
  {
    icon: <Phone className="w-7 h-7" />,
    title: "Call Your Local Number",
    description: "Dial the number for your area and step right in. No app, no profile picture, no judgment — just your voice.",
    color: "#A855F7",
  },
  {
    icon: <Mic className="w-7 h-7" />,
    title: "Drop Your Greeting",
    description: "Record a quick intro that's all you. Say what you're into, what you sound like, what you're looking for tonight.",
    color: "#8B5CF6",
  },
  {
    icon: <MessageCircle className="w-7 h-7" />,
    title: "Meet the Men",
    description: "Browse guys in your area, leave voice messages, or jump straight into a live one-on-one call — right now.",
    color: "#6D28D9",
  },
];

const FEATURES = [
  { icon: <Shield className="w-5 h-5" />, title: "Completely Private", desc: "Your phone number is never shared. Connect with full anonymity — no screenshots, no receipts." },
  { icon: <Clock className="w-5 h-5" />, title: "Live 24/7", desc: "Guys are on the line at any hour. Whether it's noon or 2am, the booth is open." },
  { icon: <Zap className="w-5 h-5" />, title: "No Waiting, No Swiping", desc: "Hear a voice and connect in seconds. No inbox full of unanswered texts." },
  { icon: <Headphones className="w-5 h-5" />, title: "Voice Over Photos", desc: "A man's voice tells you way more than his photo ever could. Real vibe, real fast." },
  { icon: <MapPin className="w-5 h-5" />, title: "Local Guys", desc: "Connect with men in your city — or wherever you are. Community that's close to home." },
  { icon: <Flame className="w-5 h-5" />, title: "Free Trial Tonight", desc: "Jump in free on your first call. No credit card, no commitment — just see who's out there." },
];

const PRICING = [
  {
    name: "Intro",
    subtitle: "Try it tonight",
    price: "$9.99",
    per: "/month",
    minutes: "30 min",
    color: "#8B5CF6",
    features: [
      "30 minutes of talk time",
      "Unlimited voice messages",
      "Browse local profiles",
      "Full caller ID privacy",
    ],
    cta: "Call Free Now",
  },
  {
    name: "Connect",
    subtitle: "Most Popular",
    price: "$19.99",
    per: "/month",
    minutes: "90 min",
    color: "#7C3AED",
    popular: true,
    features: [
      "90 minutes of talk time",
      "Unlimited voice messages",
      "Priority profile placement",
      "Full caller ID privacy",
      "Save favorite profiles",
    ],
    cta: "Start Free Trial",
  },
  {
    name: "All Night",
    subtitle: "No limits",
    price: "$34.99",
    per: "/month",
    minutes: "∞",
    color: "#6D28D9",
    features: [
      "Unlimited talk time",
      "Unlimited voice messages",
      "Top placement in listings",
      "Premium caller ID privacy",
      "Save unlimited profiles",
      "VIP member status",
    ],
    cta: "Go Unlimited",
  },
];

const TESTIMONIALS = [
  {
    name: "Marcus T.",
    city: "Dallas, TX",
    rating: 5,
    text: "Wasn't sure what to expect on the first call. By the end of the night I'd talked to three interesting guys. Nothing else moves that fast.",
  },
  {
    name: "Devon K.",
    city: "Atlanta, GA",
    rating: 5,
    text: "The voice thing is real. You can hear someone's energy immediately. Met a guy I've been talking to every week since.",
  },
  {
    name: "James R.",
    city: "Chicago, IL",
    rating: 5,
    text: "Private, easy, and actually fun. No catfish, no games — just real dudes having real conversations.",
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

function formatPhoneDisplay(raw: string | null | undefined): string {
  if (!raw) return DEFAULT_PHONE;
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  if (digits.length === 11 && digits[0] === "1") {
    return `1-${digits.slice(1, 4)}-${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  return raw;
}

function CallLink({
  phone,
  children,
  style,
  testId,
}: {
  phone: string;
  children: React.ReactNode;
  style?: React.CSSProperties;
  testId?: string;
}) {
  const dialable = "tel:" + phone.replace(/\D/g, "");
  return (
    <a href={dialable} style={style} data-testid={testId}>
      {children}
    </a>
  );
}

export default function Landing() {
  const [areaCode, setAreaCode] = useState("");
  const [areaCodeResult, setAreaCodeResult] = useState<string | null>(null);
  const [areaCodeLoading, setAreaCodeLoading] = useState(false);

  const { data: stats } = useQuery<{
    activeCalls: number;
    users: number;
    profiles: number;
    messages: number;
  }>({ queryKey: ["/api/stats"] });

  const { data: localData, isLoading: localLoading } = useQuery<LocalNumberData>({
    queryKey: ["/api/local-number"],
    staleTime: Infinity,
    retry: 1,
  });

  const displayPhone = areaCodeResult || localData?.phoneNumber || DEFAULT_PHONE;
  const displayPhoneFormatted = formatPhoneDisplay(displayPhone);
  const cityLabel =
    localData?.city && localData?.state
      ? `${localData.city}, ${localData.state}`
      : null;

  const scrollTo = (href: string) => {
    const el = document.querySelector(href);
    if (el) el.scrollIntoView({ behavior: "smooth" });
  };

  async function handleAreaCodeLookup() {
    if (areaCode.length < 3) return;
    setAreaCodeLoading(true);
    try {
      const res = await fetch(
        `/api/local-number?areacode=${encodeURIComponent(areaCode)}`
      );
      const data: LocalNumberData = await res.json();
      setAreaCodeResult(data.phoneNumber);
    } catch {
      setAreaCodeResult(null);
    } finally {
      setAreaCodeLoading(false);
    }
  }

  return (
    <div
      style={{
        background: "linear-gradient(160deg, #0A0714 0%, #0F0A20 50%, #140A24 100%)",
        color: "#F1F0FF",
        fontFamily: "'Inter', system-ui, sans-serif",
        minHeight: "100vh",
        backgroundAttachment: "fixed",
      }}
    >
      {/* ── NAV ── */}
      <nav
        style={{
          position: "sticky",
          top: 0,
          zIndex: 50,
          backdropFilter: "blur(20px)",
          background: "rgba(10, 7, 20, 0.88)",
          borderBottom: "1px solid rgba(109, 40, 217, 0.25)",
        }}
      >
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: "10px",
                background: "linear-gradient(135deg, #7C3AED, #A855F7)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: "0 0 16px rgba(124, 58, 237, 0.5)",
              }}
            >
              <Phone className="w-4 h-4 text-white" />
            </div>
            <span
              style={{
                fontSize: "1.2rem",
                fontWeight: 800,
                background: "linear-gradient(90deg, #C4B5FD, #A78BFA)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                letterSpacing: "-0.02em",
              }}
            >
              Phone Booth
            </span>
          </div>

          {/* Links */}
          <div className="hidden md:flex items-center gap-8">
            {NAV_LINKS.map((link) => (
              <button
                key={link.label}
                onClick={() => scrollTo(link.href)}
                style={{
                  background: "none",
                  border: "none",
                  color: "rgba(241,240,255,0.6)",
                  fontSize: "0.9rem",
                  cursor: "pointer",
                  fontWeight: 500,
                  transition: "color 0.2s",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.color = "#F1F0FF")}
                onMouseLeave={(e) =>
                  (e.currentTarget.style.color = "rgba(241,240,255,0.6)")
                }
                data-testid={`nav-${link.label.toLowerCase().replace(/\s+/g, "-")}`}
              >
                {link.label}
              </button>
            ))}
          </div>

          {/* CTA */}
          <CallLink
            phone={displayPhone}
            testId="nav-call-now"
            style={{
              background: "linear-gradient(135deg, #7C3AED, #A855F7)",
              color: "#fff",
              borderRadius: "2rem",
              padding: "0.5rem 1.25rem",
              fontSize: "0.875rem",
              fontWeight: 600,
              textDecoration: "none",
              display: "flex",
              alignItems: "center",
              gap: "0.4rem",
              boxShadow: "0 0 20px rgba(124, 58, 237, 0.45)",
            }}
          >
            <Phone className="w-4 h-4" /> Call Free
          </CallLink>
        </div>
      </nav>

      {/* ── HERO ── */}
      <section style={{ position: "relative", overflow: "hidden", paddingTop: "6rem", paddingBottom: "5rem" }}>
        {/* background orbs */}
        <div style={{ position: "absolute", top: "-12rem", right: "-12rem", width: "42rem", height: "42rem", borderRadius: "50%", background: "radial-gradient(circle, rgba(124,58,237,0.18) 0%, transparent 70%)", pointerEvents: "none" }} />
        <div style={{ position: "absolute", bottom: "-8rem", left: "-8rem", width: "32rem", height: "32rem", borderRadius: "50%", background: "radial-gradient(circle, rgba(109,40,217,0.12) 0%, transparent 70%)", pointerEvents: "none" }} />

        <div className="max-w-6xl mx-auto px-6 text-center">
          {/* Live badge */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem", background: "rgba(124,58,237,0.15)", border: "1px solid rgba(124,58,237,0.35)", borderRadius: "2rem", padding: "0.35rem 1rem", fontSize: "0.8rem", color: "#C4B5FD", marginBottom: "2rem", fontWeight: 500 }}
            data-testid="badge-active-callers"
          >
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#4ADE80", display: "inline-block", animation: "pulse 2s infinite" }} />
            {localLoading
              ? "Finding guys near you…"
              : localData?.regionName
                ? `${localData.activeCalls} guys on the line in ${localData.regionName}`
                : `${localData?.activeCalls ?? stats?.activeCalls ?? 0} guys on the line right now`}
          </motion.div>

          {/* Headline */}
          <motion.h1
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            style={{ fontSize: "clamp(2.5rem, 6vw, 4.75rem)", fontWeight: 800, lineHeight: 1.08, letterSpacing: "-0.035em", marginBottom: "1.5rem", fontFamily: "system-ui, sans-serif", textTransform: "none" }}
          >
            Your voice.{" "}
            <span style={{ background: "linear-gradient(90deg, #C4B5FD, #A78BFA, #8B5CF6)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
              Your vibe.
            </span>
            <br />
            Your crowd.
          </motion.h1>

          {/* Sub */}
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            style={{ fontSize: "1.2rem", color: "rgba(241,240,255,0.6)", maxWidth: "40rem", margin: "0 auto 2.5rem", lineHeight: 1.75, fontWeight: 400, textTransform: "none" }}
          >
            Phone Booth is a live phone chat line for gay men. Call in, drop your greeting, 
            and connect with real guys in your area — no apps, no photos, no drama.
          </motion.p>

          {/* LOCAL NUMBER DISPLAY */}
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.6, delay: 0.3 }}
            style={{ marginBottom: "2rem" }}
          >
            <AnimatePresence mode="wait">
              {localLoading ? (
                <motion.div
                  key="loading"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.75rem" }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "rgba(241,240,255,0.4)", fontSize: "0.875rem", textTransform: "none" }}>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Finding your local number…
                  </div>
                  <div style={{ height: 90 }} />
                </motion.div>
              ) : (
                <motion.div
                  key="loaded"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "1rem" }}
                >
                  {cityLabel && (
                    <div
                      style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem", background: "rgba(124,58,237,0.15)", border: "1px solid rgba(124,58,237,0.3)", borderRadius: "2rem", padding: "0.3rem 0.9rem", fontSize: "0.8rem", color: "#C4B5FD", fontWeight: 500 }}
                      data-testid="text-detected-city"
                    >
                      <MapPin className="w-3.5 h-3.5" />
                      Calling from {cityLabel}
                    </div>
                  )}

                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.5rem" }}>
                    <p style={{ fontSize: "0.72rem", color: "rgba(241,240,255,0.35)", textTransform: "uppercase", letterSpacing: "0.14em", fontWeight: 600, margin: 0 }}>
                      {localData?.phoneNumber ? "Your local number" : "National number"}
                    </p>
                    <CallLink
                      phone={displayPhone}
                      testId="hero-local-number"
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "0.65rem",
                        background: "linear-gradient(135deg, #7C3AED 0%, #A855F7 100%)",
                        color: "#fff",
                        borderRadius: "3rem",
                        padding: "1rem 2.75rem",
                        fontSize: "clamp(1.1rem, 3vw, 1.4rem)",
                        fontWeight: 800,
                        textDecoration: "none",
                        boxShadow: "0 8px 36px rgba(124,58,237,0.55)",
                        letterSpacing: "0.02em",
                      }}
                    >
                      <Phone className="w-5 h-5 flex-shrink-0" />
                      {displayPhoneFormatted}
                    </CallLink>
                    <p style={{ fontSize: "0.78rem", color: "rgba(241,240,255,0.3)", margin: 0, textTransform: "none" }}>
                      Free trial on your first call · Must be 18+
                    </p>
                  </div>

                  <button
                    onClick={() => scrollTo("#how-it-works")}
                    style={{ background: "rgba(241,240,255,0.06)", border: "1px solid rgba(241,240,255,0.12)", color: "rgba(241,240,255,0.8)", borderRadius: "3rem", padding: "0.75rem 1.75rem", fontSize: "0.95rem", fontWeight: 600, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "0.4rem", textTransform: "none" }}
                    data-testid="hero-how-it-works"
                    onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(241,240,255,0.1)")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(241,240,255,0.06)")}
                  >
                    <Play className="w-4 h-4" /> See How It Works
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>

          {/* Area code finder */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.5 }}
            style={{ display: "inline-flex", flexDirection: "column", alignItems: "center", gap: "0.6rem", marginTop: "0.5rem" }}
          >
            <p style={{ fontSize: "0.78rem", color: "rgba(241,240,255,0.3)", textTransform: "none", margin: 0 }}>
              Not seeing your area? Enter your area code:
            </p>
            <div style={{ display: "inline-flex", alignItems: "center", gap: "0.75rem", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(124,58,237,0.25)", borderRadius: "3rem", padding: "0.4rem 0.4rem 0.4rem 1.25rem" }}>
              <input
                type="text"
                placeholder="e.g. 214"
                maxLength={3}
                value={areaCode}
                onChange={(e) => { setAreaCode(e.target.value.replace(/\D/g, "")); setAreaCodeResult(null); }}
                onKeyDown={(e) => e.key === "Enter" && handleAreaCodeLookup()}
                style={{ background: "transparent", border: "none", outline: "none", color: "#F1F0FF", fontSize: "0.9rem", width: "5rem", fontFamily: "system-ui, sans-serif" }}
                data-testid="input-area-code"
              />
              <button
                onClick={handleAreaCodeLookup}
                disabled={areaCode.length < 3 || areaCodeLoading}
                style={{ background: "linear-gradient(135deg, #7C3AED, #A855F7)", color: "#fff", border: "none", borderRadius: "2rem", padding: "0.55rem 1.1rem", fontSize: "0.8rem", fontWeight: 600, cursor: areaCode.length < 3 ? "not-allowed" : "pointer", display: "flex", alignItems: "center", gap: "0.3rem", opacity: areaCode.length < 3 ? 0.6 : 1 }}
                data-testid="button-find-number"
              >
                {areaCodeLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <><span>Find</span><ChevronRight className="w-3.5 h-3.5" /></>}
              </button>
            </div>
            {areaCodeResult && (
              <motion.p
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                style={{ fontSize: "0.8rem", color: "#A78BFA", margin: 0, textTransform: "none" }}
                data-testid="text-area-code-result"
              >
                Your number: {formatPhoneDisplay(areaCodeResult)}
              </motion.p>
            )}
          </motion.div>
        </div>
      </section>

      {/* ── LIVE STATS ── */}
      <div style={{ background: "rgba(124,58,237,0.07)", borderTop: "1px solid rgba(124,58,237,0.15)", borderBottom: "1px solid rgba(124,58,237,0.15)", padding: "1.5rem 0" }}>
        <div className="max-w-6xl mx-auto px-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
            {[
              { label: "Live on the Line", value: stats?.activeCalls ?? 0 },
              { label: "Members", value: stats?.users ?? 0 },
              { label: "Voice Profiles", value: stats?.profiles ?? 0 },
              { label: "Messages Sent", value: stats?.messages ?? 0 },
            ].map((stat, i) => (
              <div key={i} data-testid={`stat-${stat.label.toLowerCase().replace(/\s+/g, "-")}`}>
                <div style={{ fontSize: "clamp(1.5rem, 3vw, 2rem)", fontWeight: 800, background: "linear-gradient(90deg, #C4B5FD, #A78BFA)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", fontFamily: "system-ui, sans-serif", textTransform: "none", letterSpacing: "-0.02em" }}>
                  {stat.value.toLocaleString()}
                </div>
                <div style={{ fontSize: "0.8rem", color: "rgba(241,240,255,0.45)", marginTop: "0.25rem", textTransform: "none", fontWeight: 400 }}>
                  {stat.label}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── HOW IT WORKS ── */}
      <section id="how-it-works" style={{ padding: "6rem 0" }}>
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-16">
            <p style={{ fontSize: "0.78rem", color: "#A78BFA", textTransform: "uppercase", letterSpacing: "0.15em", fontWeight: 600, marginBottom: "0.75rem" }}>
              Simple by Design
            </p>
            <h2 style={{ fontSize: "clamp(2rem, 4vw, 3rem)", fontWeight: 800, letterSpacing: "-0.03em", textTransform: "none", color: "#F1F0FF", fontFamily: "system-ui, sans-serif" }}>
              Three steps to your next great conversation
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {STEPS.map((step, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: i * 0.15 }}
                viewport={{ once: true }}
                style={{ background: "rgba(255,255,255,0.025)", border: `1px solid ${step.color}30`, borderRadius: "1.25rem", padding: "2rem", position: "relative", overflow: "hidden" }}
                data-testid={`step-card-${i}`}
              >
                <div style={{ position: "absolute", top: "-2rem", right: "-2rem", width: "8rem", height: "8rem", borderRadius: "50%", background: `radial-gradient(circle, ${step.color}18 0%, transparent 70%)` }} />
                <div style={{ width: 56, height: 56, borderRadius: "1rem", background: `${step.color}20`, border: `1px solid ${step.color}35`, display: "flex", alignItems: "center", justifyContent: "center", color: step.color, marginBottom: "1.25rem" }}>
                  {step.icon}
                </div>
                <div style={{ fontSize: "0.72rem", color: step.color, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: "0.5rem" }}>
                  Step {i + 1}
                </div>
                <h3 style={{ fontSize: "1.25rem", fontWeight: 700, color: "#F1F0FF", marginBottom: "0.75rem", textTransform: "none", fontFamily: "system-ui, sans-serif" }}>
                  {step.title}
                </h3>
                <p style={{ color: "rgba(241,240,255,0.55)", lineHeight: 1.7, fontSize: "0.95rem", textTransform: "none", fontWeight: 400 }}>
                  {step.description}
                </p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── COMMUNITY ── */}
      <section
        id="community"
        style={{ background: "rgba(124,58,237,0.05)", borderTop: "1px solid rgba(124,58,237,0.14)", borderBottom: "1px solid rgba(124,58,237,0.14)", padding: "6rem 0" }}
      >
        <div className="max-w-6xl mx-auto px-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-16 items-center">
            <motion.div
              initial={{ opacity: 0, x: -30 }}
              whileInView={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.6 }}
              viewport={{ once: true }}
            >
              <p style={{ fontSize: "0.78rem", color: "#A78BFA", textTransform: "uppercase", letterSpacing: "0.15em", fontWeight: 600, marginBottom: "0.75rem" }}>
                Who's Here
              </p>
              <h2 style={{ fontSize: "clamp(2rem, 4vw, 2.8rem)", fontWeight: 800, color: "#F1F0FF", letterSpacing: "-0.03em", textTransform: "none", fontFamily: "system-ui, sans-serif", marginBottom: "1.25rem", lineHeight: 1.15 }}>
                Gay men.{" "}
                <span style={{ background: "linear-gradient(90deg, #C4B5FD, #A78BFA)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
                  Real voices.
                </span>
                <br />
                Your city.
              </h2>
              <p style={{ color: "rgba(241,240,255,0.6)", lineHeight: 1.8, fontSize: "1rem", marginBottom: "2rem", textTransform: "none", fontWeight: 400 }}>
                Phone Booth is built exclusively for gay and bi men. Everyone on the line is here for 
                the same reason — real conversation, real connection, without the noise of mainstream apps. 
                No swiping, no ghosting, no algorithm deciding who you meet.
              </p>
              <ul style={{ listStyle: "none", padding: 0, margin: "0 0 2rem", display: "flex", flexDirection: "column", gap: "0.8rem" }}>
                {[
                  "Men meeting men — that's it",
                  "Your number is never revealed",
                  "Block anyone with a single keypress",
                  "No photos required — just your voice",
                  "Guys in your area, available right now",
                ].map((item, i) => (
                  <li
                    key={i}
                    style={{ display: "flex", alignItems: "center", gap: "0.75rem", color: "rgba(241,240,255,0.8)", fontSize: "0.95rem", textTransform: "none", fontWeight: 400 }}
                  >
                    <CheckCircle className="w-5 h-5 flex-shrink-0" style={{ color: "#A78BFA" }} />
                    {item}
                  </li>
                ))}
              </ul>
              <CallLink
                phone={displayPhone}
                testId="community-call-cta"
                style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem", background: "linear-gradient(135deg, #7C3AED, #A855F7)", color: "#fff", borderRadius: "3rem", padding: "0.875rem 2rem", fontWeight: 700, textDecoration: "none", fontSize: "1rem", boxShadow: "0 6px 28px rgba(124,58,237,0.45)" }}
              >
                <Phone className="w-4 h-4" /> Call {displayPhoneFormatted}
              </CallLink>
            </motion.div>

            {/* Quote cards */}
            <motion.div
              initial={{ opacity: 0, x: 30 }}
              whileInView={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.6 }}
              viewport={{ once: true }}
              style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}
            >
              {TESTIMONIALS.map((t, i) => (
                <div
                  key={i}
                  style={{ background: "rgba(124,58,237,0.07)", border: "1px solid rgba(124,58,237,0.2)", borderRadius: "1.25rem", padding: "1.5rem" }}
                  data-testid={`community-testimonial-${i}`}
                >
                  <div style={{ display: "flex", gap: "0.2rem", marginBottom: "0.75rem" }}>
                    {[...Array(t.rating)].map((_, j) => (
                      <Star key={j} className="w-3.5 h-3.5" style={{ color: "#FBBF24", fill: "#FBBF24" }} />
                    ))}
                  </div>
                  <p style={{ color: "rgba(241,240,255,0.78)", lineHeight: 1.7, fontSize: "0.9rem", fontStyle: "italic", marginBottom: "0.75rem", textTransform: "none", fontWeight: 400 }}>
                    "{t.text}"
                  </p>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <div style={{ width: 28, height: 28, borderRadius: "50%", background: "linear-gradient(135deg, #7C3AED, #A855F7)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <Users className="w-3.5 h-3.5 text-white" />
                    </div>
                    <div>
                      <div style={{ fontWeight: 600, color: "#C4B5FD", textTransform: "none", fontSize: "0.85rem" }}>{t.name}</div>
                      <div style={{ fontSize: "0.75rem", color: "rgba(241,240,255,0.35)", textTransform: "none" }}>{t.city}</div>
                    </div>
                  </div>
                </div>
              ))}
            </motion.div>
          </div>
        </div>
      </section>

      {/* ── FEATURES ── */}
      <section style={{ padding: "6rem 0" }}>
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-16">
            <p style={{ fontSize: "0.78rem", color: "#A78BFA", textTransform: "uppercase", letterSpacing: "0.15em", fontWeight: 600, marginBottom: "0.75rem" }}>
              Why Phone Booth
            </p>
            <h2 style={{ fontSize: "clamp(2rem, 4vw, 3rem)", fontWeight: 800, letterSpacing: "-0.03em", textTransform: "none", color: "#F1F0FF", fontFamily: "system-ui, sans-serif" }}>
              Built for real connection. Not distraction.
            </h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {FEATURES.map((feature, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: i * 0.08 }}
                viewport={{ once: true }}
                style={{ background: "rgba(255,255,255,0.025)", border: "1px solid rgba(124,58,237,0.15)", borderRadius: "1rem", padding: "1.75rem", transition: "border-color 0.3s, background 0.3s", cursor: "default" }}
                data-testid={`feature-card-${i}`}
                onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(124,58,237,0.08)"; e.currentTarget.style.borderColor = "rgba(124,58,237,0.35)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.025)"; e.currentTarget.style.borderColor = "rgba(124,58,237,0.15)"; }}
              >
                <div style={{ width: 44, height: 44, borderRadius: "0.75rem", background: "rgba(124,58,237,0.15)", border: "1px solid rgba(124,58,237,0.25)", display: "flex", alignItems: "center", justifyContent: "center", color: "#A78BFA", marginBottom: "1rem" }}>
                  {feature.icon}
                </div>
                <h3 style={{ fontSize: "1rem", fontWeight: 700, color: "#F1F0FF", marginBottom: "0.5rem", textTransform: "none", fontFamily: "system-ui, sans-serif" }}>
                  {feature.title}
                </h3>
                <p style={{ fontSize: "0.875rem", color: "rgba(241,240,255,0.5)", lineHeight: 1.65, textTransform: "none", fontWeight: 400 }}>
                  {feature.desc}
                </p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── PRICING ── */}
      <section
        id="pricing"
        style={{ background: "rgba(124,58,237,0.05)", borderTop: "1px solid rgba(124,58,237,0.14)", padding: "6rem 0" }}
      >
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-16">
            <p style={{ fontSize: "0.78rem", color: "#A78BFA", textTransform: "uppercase", letterSpacing: "0.15em", fontWeight: 600, marginBottom: "0.75rem" }}>
              Transparent Pricing
            </p>
            <h2 style={{ fontSize: "clamp(2rem, 4vw, 3rem)", fontWeight: 800, letterSpacing: "-0.03em", textTransform: "none", color: "#F1F0FF", fontFamily: "system-ui, sans-serif", marginBottom: "1rem" }}>
              Pick your plan. Cancel anytime.
            </h2>
            <p style={{ color: "rgba(241,240,255,0.45)", textTransform: "none", fontWeight: 400 }}>
              Every plan starts with a free trial on your first call. No credit card needed to try.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-stretch">
            {PRICING.map((plan, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: i * 0.1 }}
                viewport={{ once: true }}
                style={{ background: plan.popular ? "linear-gradient(145deg, rgba(124,58,237,0.18), rgba(109,40,217,0.1))" : "rgba(255,255,255,0.025)", border: plan.popular ? "1px solid rgba(124,58,237,0.55)" : "1px solid rgba(255,255,255,0.07)", borderRadius: "1.25rem", padding: "2rem", position: "relative", display: "flex", flexDirection: "column", boxShadow: plan.popular ? "0 0 48px rgba(124,58,237,0.22)" : "none" }}
                data-testid={`pricing-card-${plan.name.toLowerCase().replace(/\s+/g, "-")}`}
              >
                {plan.popular && (
                  <div style={{ position: "absolute", top: "-1px", left: "50%", transform: "translateX(-50%)", background: "linear-gradient(90deg, #7C3AED, #A855F7)", color: "#fff", fontSize: "0.7rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", padding: "0.25rem 1rem", borderRadius: "0 0 0.5rem 0.5rem", whiteSpace: "nowrap" }}>
                    Most Popular
                  </div>
                )}
                <div style={{ marginBottom: "0.5rem" }}>
                  <span style={{ fontSize: "0.7rem", color: plan.color, textTransform: "uppercase", letterSpacing: "0.12em", fontWeight: 600 }}>
                    {plan.subtitle}
                  </span>
                </div>
                <h3 style={{ fontSize: "1.4rem", fontWeight: 800, color: "#F1F0FF", marginBottom: "0.5rem", textTransform: "none", fontFamily: "system-ui, sans-serif" }}>
                  {plan.name}
                </h3>
                <div style={{ display: "flex", alignItems: "baseline", gap: "0.25rem", marginBottom: "0.25rem" }}>
                  <span style={{ fontSize: "2.5rem", fontWeight: 800, background: `linear-gradient(90deg, ${plan.color}, #C4B5FD)`, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", fontFamily: "system-ui, sans-serif" }}>
                    {plan.price}
                  </span>
                  <span style={{ color: "rgba(241,240,255,0.35)", fontSize: "0.875rem", textTransform: "none" }}>{plan.per}</span>
                </div>
                <div style={{ color: plan.color, fontSize: "0.8rem", fontWeight: 600, marginBottom: "1.5rem" }}>
                  {plan.minutes} talk time
                </div>
                <ul style={{ listStyle: "none", padding: 0, margin: "0 0 2rem", display: "flex", flexDirection: "column", gap: "0.65rem", flex: 1 }}>
                  {plan.features.map((f, j) => (
                    <li key={j} style={{ display: "flex", alignItems: "center", gap: "0.6rem", color: "rgba(241,240,255,0.65)", fontSize: "0.875rem", textTransform: "none", fontWeight: 400 }}>
                      <CheckCircle className="w-4 h-4 flex-shrink-0" style={{ color: plan.color }} />
                      {f}
                    </li>
                  ))}
                </ul>
                <CallLink
                  phone={displayPhone}
                  testId={`pricing-cta-${plan.name.toLowerCase().replace(/\s+/g, "-")}`}
                  style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "0.5rem", background: plan.popular ? "linear-gradient(135deg, #7C3AED, #A855F7)" : "rgba(255,255,255,0.06)", border: plan.popular ? "none" : "1px solid rgba(255,255,255,0.1)", color: "#fff", borderRadius: "3rem", padding: "0.875rem", fontWeight: 700, textDecoration: "none", fontSize: "0.95rem", boxShadow: plan.popular ? "0 4px 24px rgba(124,58,237,0.45)" : "none", textTransform: "none" }}
                >
                  <Phone className="w-4 h-4" /> {plan.cta}
                </CallLink>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FINAL CTA ── */}
      <section style={{ padding: "7rem 0" }}>
        <div className="max-w-4xl mx-auto px-6 text-center">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.6 }}
            viewport={{ once: true }}
            style={{ background: "linear-gradient(135deg, rgba(124,58,237,0.18) 0%, rgba(109,40,217,0.1) 100%)", border: "1px solid rgba(124,58,237,0.35)", borderRadius: "2rem", padding: "4rem 3rem", position: "relative", overflow: "hidden" }}
          >
            <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", width: "30rem", height: "30rem", borderRadius: "50%", background: "radial-gradient(circle, rgba(124,58,237,0.15) 0%, transparent 70%)", pointerEvents: "none" }} />
            <h2 style={{ fontSize: "clamp(2rem, 4vw, 3.2rem)", fontWeight: 800, letterSpacing: "-0.03em", textTransform: "none", color: "#F1F0FF", fontFamily: "system-ui, sans-serif", marginBottom: "1rem" }}>
              The next great conversation{" "}
              <span style={{ background: "linear-gradient(90deg, #C4B5FD, #A78BFA)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
                is one call away.
              </span>
            </h2>
            <p style={{ color: "rgba(241,240,255,0.55)", fontSize: "1.1rem", lineHeight: 1.7, marginBottom: "2.5rem", textTransform: "none", fontWeight: 400 }}>
              Pick up the phone. That's it. Guys in your area are on the line right now — no profile, no photo, no game-playing required.
            </p>
            {cityLabel && (
              <div style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem", background: "rgba(124,58,237,0.15)", border: "1px solid rgba(124,58,237,0.3)", borderRadius: "2rem", padding: "0.3rem 0.9rem", fontSize: "0.8rem", color: "#C4B5FD", marginBottom: "1.5rem" }}>
                <MapPin className="w-3.5 h-3.5" />
                Serving {cityLabel} and surrounding areas
              </div>
            )}
            <div>
              <CallLink
                phone={displayPhone}
                testId="final-cta-call"
                style={{ display: "inline-flex", alignItems: "center", gap: "0.75rem", background: "linear-gradient(135deg, #7C3AED, #A855F7)", color: "#fff", borderRadius: "3rem", padding: "1.1rem 3rem", fontSize: "1.2rem", fontWeight: 700, textDecoration: "none", boxShadow: "0 10px 44px rgba(124,58,237,0.55)", textTransform: "none" }}
              >
                <Phone className="w-5 h-5" /> Call {displayPhoneFormatted} Free
              </CallLink>
            </div>
            <p style={{ marginTop: "1.25rem", fontSize: "0.78rem", color: "rgba(241,240,255,0.28)", textTransform: "none", fontWeight: 400 }}>
              All members must be 18 years of age or older · Gay & bi men's community
            </p>
          </motion.div>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer style={{ borderTop: "1px solid rgba(255,255,255,0.05)", padding: "3rem 0" }}>
        <div className="max-w-6xl mx-auto px-6">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
              <div style={{ width: 30, height: 30, borderRadius: "8px", background: "linear-gradient(135deg, #7C3AED, #A855F7)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Phone className="w-3.5 h-3.5 text-white" />
              </div>
              <span style={{ fontSize: "1rem", fontWeight: 800, background: "linear-gradient(90deg, #C4B5FD, #A78BFA)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
                Phone Booth
              </span>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-6">
              {["Privacy Policy", "Terms of Use", "Safety Tips", "Customer Support", "FAQ"].map((link) => (
                <a
                  key={link}
                  href="#"
                  style={{ color: "rgba(241,240,255,0.35)", textDecoration: "none", fontSize: "0.8rem", transition: "color 0.2s", textTransform: "none", fontWeight: 400 }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = "rgba(241,240,255,0.75)")}
                  onMouseLeave={(e) => (e.currentTarget.style.color = "rgba(241,240,255,0.35)")}
                  data-testid={`footer-link-${link.toLowerCase().replace(/\s+/g, "-")}`}
                >
                  {link}
                </a>
              ))}
            </div>
            <p style={{ fontSize: "0.72rem", color: "rgba(241,240,255,0.22)", textTransform: "none", fontWeight: 400, textAlign: "center" }}>
              © 2026 Phone Booth. All rights reserved.<br />All members 18+ only.
            </p>
          </div>
        </div>
      </footer>

      <style>{`
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
        * { box-sizing: border-box; }
      `}</style>
    </div>
  );
}
