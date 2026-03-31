import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Phone, Mic, MessageCircle, Star, ChevronRight, CheckCircle, Headphones, Heart, Shield, Clock, Zap, Play, MapPin, Loader2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

const DEFAULT_PHONE = "1-800-555-0100";

const NAV_LINKS = [
  { label: "How It Works", href: "#how-it-works" },
  { label: "For Her", href: "#for-her" },
  { label: "For Him", href: "#for-him" },
  { label: "Pricing", href: "#pricing" },
];

const STEPS = [
  {
    icon: <Phone className="w-7 h-7" />,
    title: "Call In",
    description: "Dial your local number and get instant access. No apps, no downloads, no profile photos — just your voice.",
    color: "#A855F7",
  },
  {
    icon: <Mic className="w-7 h-7" />,
    title: "Record Your Greeting",
    description: "Leave a short voice greeting that showcases your personality. Be yourself — that's what people connect with.",
    color: "#EC4899",
  },
  {
    icon: <MessageCircle className="w-7 h-7" />,
    title: "Connect & Chat",
    description: "Browse other greetings, leave voice messages, and connect live with people in your area right now.",
    color: "#8B5CF6",
  },
];

const FEATURES = [
  { icon: <Shield className="w-5 h-5" />, title: "100% Anonymous", desc: "Your number stays private. Connect safely with no personal info shared." },
  { icon: <Clock className="w-5 h-5" />, title: "Always Live", desc: "Real people on the line 24/7. There's never a wrong time to call." },
  { icon: <Zap className="w-5 h-5" />, title: "Instant Connection", desc: "No swiping, no waiting days for a reply. Hear a voice and connect right now." },
  { icon: <Headphones className="w-5 h-5" />, title: "Voice First", desc: "A voice tells you more than a photo ever could. Real chemistry, real fast." },
  { icon: <Heart className="w-5 h-5" />, title: "Local Matches", desc: "Meet people in your area. Conversations that can turn into real-world plans." },
  { icon: <Star className="w-5 h-5" />, title: "Free to Try", desc: "Jump in free and see what the buzz is about. No credit card required." },
];

const PRICING = [
  {
    name: "Spark",
    subtitle: "Try it out",
    price: "$9.99",
    per: "/month",
    minutes: "30 min",
    color: "#8B5CF6",
    features: ["30 minutes of talk time", "Unlimited voice messages", "Local profile browsing", "Basic caller ID protection"],
    cta: "Get Started",
  },
  {
    name: "Connect",
    subtitle: "Most Popular",
    price: "$19.99",
    per: "/month",
    minutes: "90 min",
    color: "#EC4899",
    popular: true,
    features: ["90 minutes of talk time", "Unlimited voice messages", "Priority in browsing queue", "Advanced caller ID protection", "Save favorite profiles"],
    cta: "Start Free Trial",
  },
  {
    name: "Unlimited",
    subtitle: "All in",
    price: "$34.99",
    per: "/month",
    minutes: "∞",
    color: "#A855F7",
    features: ["Unlimited talk time", "Unlimited voice messages", "Top placement in browsing", "Premium caller ID protection", "Save unlimited profiles", "VIP member badge"],
    cta: "Go Unlimited",
  },
];

const TESTIMONIALS = [
  { name: "Marcus T.", city: "Dallas, TX", rating: 5, text: "I was skeptical at first but after my first call I was hooked. Met someone amazing in the first week." },
  { name: "Angela R.", city: "Phoenix, AZ", rating: 5, text: "Unlike any app I've tried. There's something about hearing someone's voice that just tells you everything." },
  { name: "Devon K.", city: "Atlanta, GA", rating: 5, text: "The quality of conversations here is on another level. Real people, real talk." },
];

interface LocalNumberData {
  city: string | null;
  state: string | null;
  phoneNumber: string | null;
  regionName: string | null;
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

function CallLink({ phone, children, style, testId }: { phone: string; children: React.ReactNode; style?: React.CSSProperties; testId?: string }) {
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

  const { data: stats } = useQuery<{ activeCalls: number; users: number; profiles: number; messages: number }>({
    queryKey: ["/api/stats"],
  });

  const { data: localData, isLoading: localLoading } = useQuery<LocalNumberData>({
    queryKey: ["/api/local-number"],
    staleTime: Infinity,
    retry: 1,
  });

  const displayPhone = areaCodeResult || localData?.phoneNumber || DEFAULT_PHONE;
  const displayPhoneFormatted = formatPhoneDisplay(displayPhone);
  const cityLabel = localData?.city && localData?.state
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
      const res = await fetch(`/api/local-number?areacode=${encodeURIComponent(areaCode)}`);
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
        background: "linear-gradient(135deg, #0D0A1E 0%, #130D2E 40%, #1A0D2E 100%)",
        color: "#F1F0FF",
        fontFamily: "'Inter', system-ui, sans-serif",
        minHeight: "100vh",
        backgroundAttachment: "fixed",
      }}
    >
      {/* NAV */}
      <nav
        style={{
          position: "sticky",
          top: 0,
          zIndex: 50,
          backdropFilter: "blur(20px)",
          background: "rgba(13, 10, 30, 0.85)",
          borderBottom: "1px solid rgba(139, 92, 246, 0.2)",
        }}
      >
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: "50%",
                background: "linear-gradient(135deg, #8B5CF6, #EC4899)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Phone className="w-4 h-4 text-white" />
            </div>
            <span
              style={{
                fontSize: "1.25rem",
                fontWeight: 700,
                background: "linear-gradient(90deg, #A78BFA, #F472B6)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                letterSpacing: "-0.02em",
              }}
            >
              TalkSpark
            </span>
          </div>

          <div className="hidden md:flex items-center gap-8">
            {NAV_LINKS.map((link) => (
              <button
                key={link.label}
                onClick={() => scrollTo(link.href)}
                style={{
                  background: "none",
                  border: "none",
                  color: "rgba(241, 240, 255, 0.7)",
                  fontSize: "0.9rem",
                  cursor: "pointer",
                  transition: "color 0.2s",
                  fontWeight: 500,
                }}
                onMouseEnter={(e) => (e.currentTarget.style.color = "#F1F0FF")}
                onMouseLeave={(e) => (e.currentTarget.style.color = "rgba(241, 240, 255, 0.7)")}
                data-testid={`nav-${link.label.toLowerCase().replace(/\s+/g, "-")}`}
              >
                {link.label}
              </button>
            ))}
          </div>

          <CallLink
            phone={displayPhone}
            testId="nav-call-now"
            style={{
              background: "linear-gradient(135deg, #8B5CF6, #EC4899)",
              color: "#fff",
              borderRadius: "2rem",
              padding: "0.5rem 1.25rem",
              fontSize: "0.875rem",
              fontWeight: 600,
              textDecoration: "none",
              display: "flex",
              alignItems: "center",
              gap: "0.4rem",
              boxShadow: "0 0 20px rgba(139, 92, 246, 0.4)",
            }}
          >
            <Phone className="w-4 h-4" /> Call Free
          </CallLink>
        </div>
      </nav>

      {/* HERO */}
      <section style={{ position: "relative", overflow: "hidden", paddingTop: "6rem", paddingBottom: "5rem" }}>
        <div style={{ position: "absolute", top: "-10rem", right: "-10rem", width: "40rem", height: "40rem", borderRadius: "50%", background: "radial-gradient(circle, rgba(139, 92, 246, 0.15) 0%, transparent 70%)", pointerEvents: "none" }} />
        <div style={{ position: "absolute", bottom: "-8rem", left: "-8rem", width: "30rem", height: "30rem", borderRadius: "50%", background: "radial-gradient(circle, rgba(236, 72, 153, 0.12) 0%, transparent 70%)", pointerEvents: "none" }} />

        <div className="max-w-6xl mx-auto px-6 text-center">
          {/* live badge */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem", background: "rgba(139, 92, 246, 0.15)", border: "1px solid rgba(139, 92, 246, 0.3)", borderRadius: "2rem", padding: "0.35rem 1rem", fontSize: "0.8rem", color: "#C4B5FD", marginBottom: "2rem", fontWeight: 500 }}
          >
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#4ADE80", display: "inline-block", animation: "pulse 2s infinite" }} />
            {stats?.activeCalls ?? 0} people on the line right now
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            style={{ fontSize: "clamp(2.5rem, 6vw, 4.5rem)", fontWeight: 800, lineHeight: 1.1, letterSpacing: "-0.03em", marginBottom: "1.5rem", fontFamily: "system-ui, sans-serif", textTransform: "none" }}
          >
            Real voices.{" "}
            <span style={{ background: "linear-gradient(90deg, #A78BFA, #F472B6, #FB923C)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
              Real people.
            </span>
            <br />
            Real connections.
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            style={{ fontSize: "1.2rem", color: "rgba(241, 240, 255, 0.65)", maxWidth: "42rem", margin: "0 auto 2.5rem", lineHeight: 1.7, fontWeight: 400, textTransform: "none" }}
          >
            Skip the apps. Call in, record your voice, and connect with real people in your area — live, right now. It's dating the way it was always meant to be.
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
                  <div style={{ height: 80 }} />
                </motion.div>
              ) : (
                <motion.div
                  key="loaded"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "1rem" }}
                >
                  {/* City detection label */}
                  {cityLabel && (
                    <div
                      style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem", background: "rgba(236,72,153,0.12)", border: "1px solid rgba(236,72,153,0.25)", borderRadius: "2rem", padding: "0.3rem 0.9rem", fontSize: "0.8rem", color: "#F9A8D4", fontWeight: 500 }}
                      data-testid="text-detected-city"
                    >
                      <MapPin className="w-3.5 h-3.5" />
                      Calling from {cityLabel}
                    </div>
                  )}

                  {/* The big number */}
                  <div
                    style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.5rem" }}
                  >
                    <p style={{ fontSize: "0.75rem", color: "rgba(241,240,255,0.4)", textTransform: "uppercase", letterSpacing: "0.12em", fontWeight: 600, margin: 0 }}>
                      {localData?.phoneNumber ? "Your local number" : "National number"}
                    </p>
                    <CallLink
                      phone={displayPhone}
                      testId="hero-local-number"
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "0.6rem",
                        background: "linear-gradient(135deg, #8B5CF6 0%, #EC4899 100%)",
                        color: "#fff",
                        borderRadius: "3rem",
                        padding: "1rem 2.75rem",
                        fontSize: "clamp(1.1rem, 3vw, 1.4rem)",
                        fontWeight: 800,
                        textDecoration: "none",
                        boxShadow: "0 8px 32px rgba(139, 92, 246, 0.5)",
                        letterSpacing: "0.02em",
                      }}
                    >
                      <Phone className="w-5 h-5 flex-shrink-0" />
                      {displayPhoneFormatted}
                    </CallLink>
                    <p style={{ fontSize: "0.78rem", color: "rgba(241,240,255,0.35)", margin: 0, textTransform: "none" }}>
                      Free for women · Free trial for men · Must be 18+
                    </p>
                  </div>

                  {/* secondary CTA */}
                  <button
                    onClick={() => scrollTo("#how-it-works")}
                    style={{ background: "rgba(241, 240, 255, 0.07)", border: "1px solid rgba(241, 240, 255, 0.15)", color: "rgba(241, 240, 255, 0.85)", borderRadius: "3rem", padding: "0.75rem 1.75rem", fontSize: "0.95rem", fontWeight: 600, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "0.4rem", textTransform: "none" }}
                    data-testid="hero-how-it-works"
                    onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(241, 240, 255, 0.12)")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(241, 240, 255, 0.07)")}
                  >
                    <Play className="w-4 h-4" /> See How It Works
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>

          {/* Area code lookup */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.5 }}
            style={{ display: "inline-flex", flexDirection: "column", alignItems: "center", gap: "0.6rem", marginTop: "1rem" }}
          >
            <p style={{ fontSize: "0.8rem", color: "rgba(241,240,255,0.35)", textTransform: "none", margin: 0 }}>
              Not seeing your area? Enter your area code:
            </p>
            <div
              style={{ display: "inline-flex", alignItems: "center", gap: "0.75rem", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(139, 92, 246, 0.25)", borderRadius: "3rem", padding: "0.4rem 0.4rem 0.4rem 1.25rem" }}
            >
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
                style={{ background: "linear-gradient(135deg, #8B5CF6, #EC4899)", color: "#fff", border: "none", borderRadius: "2rem", padding: "0.55rem 1.1rem", fontSize: "0.8rem", fontWeight: 600, cursor: areaCode.length < 3 ? "not-allowed" : "pointer", display: "flex", alignItems: "center", gap: "0.3rem", opacity: areaCode.length < 3 ? 0.6 : 1 }}
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

      {/* LIVE STATS BAR */}
      <div style={{ background: "rgba(139, 92, 246, 0.08)", borderTop: "1px solid rgba(139, 92, 246, 0.15)", borderBottom: "1px solid rgba(139, 92, 246, 0.15)", padding: "1.5rem 0" }}>
        <div className="max-w-6xl mx-auto px-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
            {[
              { label: "Live on the Line", value: stats?.activeCalls ?? 0 },
              { label: "Registered Members", value: stats?.users ?? 0 },
              { label: "Voice Profiles", value: stats?.profiles ?? 0 },
              { label: "Messages Sent", value: stats?.messages ?? 0 },
            ].map((stat, i) => (
              <div key={i} data-testid={`stat-${stat.label.toLowerCase().replace(/\s+/g, "-")}`}>
                <div style={{ fontSize: "clamp(1.5rem, 3vw, 2rem)", fontWeight: 800, background: "linear-gradient(90deg, #A78BFA, #F472B6)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", fontFamily: "system-ui, sans-serif", textTransform: "none", letterSpacing: "-0.02em" }}>
                  {stat.value.toLocaleString()}
                </div>
                <div style={{ fontSize: "0.8rem", color: "rgba(241,240,255,0.5)", marginTop: "0.25rem", textTransform: "none", fontWeight: 400 }}>
                  {stat.label}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* HOW IT WORKS */}
      <section id="how-it-works" style={{ padding: "6rem 0" }}>
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-16">
            <p style={{ fontSize: "0.8rem", color: "#A78BFA", textTransform: "uppercase", letterSpacing: "0.15em", fontWeight: 600, marginBottom: "0.75rem" }}>Simple by Design</p>
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
                style={{ background: "rgba(255,255,255,0.03)", border: `1px solid ${step.color}33`, borderRadius: "1.25rem", padding: "2rem", position: "relative", overflow: "hidden" }}
                data-testid={`step-card-${i}`}
              >
                <div style={{ position: "absolute", top: "-2rem", right: "-2rem", width: "8rem", height: "8rem", borderRadius: "50%", background: `radial-gradient(circle, ${step.color}20 0%, transparent 70%)` }} />
                <div style={{ width: 56, height: 56, borderRadius: "1rem", background: `linear-gradient(135deg, ${step.color}30, ${step.color}10)`, border: `1px solid ${step.color}40`, display: "flex", alignItems: "center", justifyContent: "center", color: step.color, marginBottom: "1.25rem" }}>
                  {step.icon}
                </div>
                <div style={{ fontSize: "0.75rem", color: step.color, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: "0.5rem" }}>Step {i + 1}</div>
                <h3 style={{ fontSize: "1.3rem", fontWeight: 700, color: "#F1F0FF", marginBottom: "0.75rem", textTransform: "none", fontFamily: "system-ui, sans-serif" }}>{step.title}</h3>
                <p style={{ color: "rgba(241,240,255,0.6)", lineHeight: 1.7, fontSize: "0.95rem", textTransform: "none", fontWeight: 400 }}>{step.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* FOR HER */}
      <section id="for-her" style={{ background: "rgba(236, 72, 153, 0.04)", borderTop: "1px solid rgba(236, 72, 153, 0.12)", borderBottom: "1px solid rgba(236, 72, 153, 0.12)", padding: "6rem 0" }}>
        <div className="max-w-6xl mx-auto px-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-16 items-center">
            <motion.div initial={{ opacity: 0, x: -30 }} whileInView={{ opacity: 1, x: 0 }} transition={{ duration: 0.6 }} viewport={{ once: true }}>
              <p style={{ fontSize: "0.8rem", color: "#F472B6", textTransform: "uppercase", letterSpacing: "0.15em", fontWeight: 600, marginBottom: "0.75rem" }}>For Women</p>
              <h2 style={{ fontSize: "clamp(2rem, 4vw, 2.8rem)", fontWeight: 800, color: "#F1F0FF", letterSpacing: "-0.03em", textTransform: "none", fontFamily: "system-ui, sans-serif", marginBottom: "1.25rem", lineHeight: 1.15 }}>
                Always free.{" "}
                <span style={{ background: "linear-gradient(90deg, #F472B6, #A78BFA)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>Always in control.</span>
              </h2>
              <p style={{ color: "rgba(241,240,255,0.65)", lineHeight: 1.8, fontSize: "1rem", marginBottom: "2rem", textTransform: "none", fontWeight: 400 }}>
                TalkSpark is completely free for women. Browse voice profiles at your own pace, send voice messages to anyone who catches your ear, and go live only when you're ready. You set the pace — always.
              </p>
              <ul style={{ listStyle: "none", padding: 0, margin: "0 0 2rem", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                {["100% free, forever", "You control who you hear from", "Block anyone instantly", "No photos — just authentic voices"].map((item, i) => (
                  <li key={i} style={{ display: "flex", alignItems: "center", gap: "0.75rem", color: "rgba(241,240,255,0.8)", fontSize: "0.95rem", textTransform: "none", fontWeight: 400 }}>
                    <CheckCircle className="w-5 h-5 flex-shrink-0" style={{ color: "#F472B6" }} />
                    {item}
                  </li>
                ))}
              </ul>
              <CallLink
                phone={displayPhone}
                testId="her-call-free"
                style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem", background: "linear-gradient(135deg, #EC4899, #8B5CF6)", color: "#fff", borderRadius: "3rem", padding: "0.875rem 2rem", fontWeight: 700, textDecoration: "none", fontSize: "1rem", boxShadow: "0 6px 24px rgba(236, 72, 153, 0.4)" }}
              >
                <Phone className="w-4 h-4" /> Call {displayPhoneFormatted} Free
              </CallLink>
            </motion.div>

            <motion.div initial={{ opacity: 0, x: 30 }} whileInView={{ opacity: 1, x: 0 }} transition={{ duration: 0.6 }} viewport={{ once: true }} style={{ background: "rgba(236,72,153,0.06)", border: "1px solid rgba(236,72,153,0.2)", borderRadius: "1.5rem", padding: "2.5rem" }}>
              <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>🎧</div>
              <blockquote style={{ margin: 0 }}>
                <p style={{ fontSize: "1.15rem", lineHeight: 1.75, color: "rgba(241,240,255,0.85)", fontStyle: "italic", marginBottom: "1.5rem", textTransform: "none", fontWeight: 400 }}>
                  "I was done with dating apps. The voice thing changed everything for me. You hear someone laugh and you just know."
                </p>
                <footer>
                  <strong style={{ color: "#F472B6", textTransform: "none", fontWeight: 600, fontSize: "0.95rem" }}>— Sarah M., Los Angeles</strong>
                  <div style={{ display: "flex", gap: "0.25rem", marginTop: "0.4rem" }}>
                    {[...Array(5)].map((_, i) => <Star key={i} className="w-4 h-4" style={{ color: "#FBBF24", fill: "#FBBF24" }} />)}
                  </div>
                </footer>
              </blockquote>
            </motion.div>
          </div>
        </div>
      </section>

      {/* FOR HIM */}
      <section id="for-him" style={{ padding: "6rem 0" }}>
        <div className="max-w-6xl mx-auto px-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-16 items-center">
            <motion.div
              initial={{ opacity: 0, x: -30 }} whileInView={{ opacity: 1, x: 0 }} transition={{ duration: 0.6 }} viewport={{ once: true }}
              style={{ background: "rgba(139,92,246,0.06)", border: "1px solid rgba(139,92,246,0.2)", borderRadius: "1.5rem", padding: "2.5rem" }}
              className="md:order-first"
            >
              <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>📞</div>
              <blockquote style={{ margin: 0 }}>
                <p style={{ fontSize: "1.15rem", lineHeight: 1.75, color: "rgba(241,240,255,0.85)", fontStyle: "italic", marginBottom: "1.5rem", textTransform: "none", fontWeight: 400 }}>
                  "I've tried every dating app. Nothing moves as fast as this. I was talking to someone within five minutes of my first call."
                </p>
                <footer>
                  <strong style={{ color: "#A78BFA", textTransform: "none", fontWeight: 600, fontSize: "0.95rem" }}>— James K., Chicago</strong>
                  <div style={{ display: "flex", gap: "0.25rem", marginTop: "0.4rem" }}>
                    {[...Array(5)].map((_, i) => <Star key={i} className="w-4 h-4" style={{ color: "#FBBF24", fill: "#FBBF24" }} />)}
                  </div>
                </footer>
              </blockquote>
            </motion.div>

            <motion.div initial={{ opacity: 0, x: 30 }} whileInView={{ opacity: 1, x: 0 }} transition={{ duration: 0.6 }} viewport={{ once: true }}>
              <p style={{ fontSize: "0.8rem", color: "#A78BFA", textTransform: "uppercase", letterSpacing: "0.15em", fontWeight: 600, marginBottom: "0.75rem" }}>For Men</p>
              <h2 style={{ fontSize: "clamp(2rem, 4vw, 2.8rem)", fontWeight: 800, color: "#F1F0FF", letterSpacing: "-0.03em", textTransform: "none", fontFamily: "system-ui, sans-serif", marginBottom: "1.25rem", lineHeight: 1.15 }}>
                Start free.{" "}
                <span style={{ background: "linear-gradient(90deg, #A78BFA, #F472B6)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>Keep it real.</span>
              </h2>
              <p style={{ color: "rgba(241,240,255,0.65)", lineHeight: 1.8, fontSize: "1rem", marginBottom: "2rem", textTransform: "none", fontWeight: 400 }}>
                Get a free trial the moment you call. No credit card, no forms, no profile to fill out. Just record your greeting, start browsing, and find someone you actually want to talk to.
              </p>
              <ul style={{ listStyle: "none", padding: 0, margin: "0 0 2rem", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                {["Free trial on your first call", "Hear local women's profiles instantly", "Send voice messages anytime", "Upgrade only when you're ready"].map((item, i) => (
                  <li key={i} style={{ display: "flex", alignItems: "center", gap: "0.75rem", color: "rgba(241,240,255,0.8)", fontSize: "0.95rem", textTransform: "none", fontWeight: 400 }}>
                    <CheckCircle className="w-5 h-5 flex-shrink-0" style={{ color: "#A78BFA" }} />
                    {item}
                  </li>
                ))}
              </ul>
              <CallLink
                phone={displayPhone}
                testId="him-call-free"
                style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem", background: "linear-gradient(135deg, #8B5CF6, #EC4899)", color: "#fff", borderRadius: "3rem", padding: "0.875rem 2rem", fontWeight: 700, textDecoration: "none", fontSize: "1rem", boxShadow: "0 6px 24px rgba(139, 92, 246, 0.4)" }}
              >
                <Phone className="w-4 h-4" /> Start Free Trial
              </CallLink>
            </motion.div>
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section style={{ background: "rgba(139, 92, 246, 0.04)", borderTop: "1px solid rgba(139, 92, 246, 0.12)", borderBottom: "1px solid rgba(139, 92, 246, 0.12)", padding: "6rem 0" }}>
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-16">
            <p style={{ fontSize: "0.8rem", color: "#A78BFA", textTransform: "uppercase", letterSpacing: "0.15em", fontWeight: 600, marginBottom: "0.75rem" }}>Why TalkSpark</p>
            <h2 style={{ fontSize: "clamp(2rem, 4vw, 3rem)", fontWeight: 800, letterSpacing: "-0.03em", textTransform: "none", color: "#F1F0FF", fontFamily: "system-ui, sans-serif" }}>
              Built for connection. Not distraction.
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
                style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(139, 92, 246, 0.15)", borderRadius: "1rem", padding: "1.75rem", transition: "border-color 0.3s, background 0.3s", cursor: "default" }}
                data-testid={`feature-card-${i}`}
                onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(139, 92, 246, 0.08)"; e.currentTarget.style.borderColor = "rgba(139, 92, 246, 0.35)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.03)"; e.currentTarget.style.borderColor = "rgba(139, 92, 246, 0.15)"; }}
              >
                <div style={{ width: 44, height: 44, borderRadius: "0.75rem", background: "rgba(139, 92, 246, 0.15)", border: "1px solid rgba(139, 92, 246, 0.25)", display: "flex", alignItems: "center", justifyContent: "center", color: "#A78BFA", marginBottom: "1rem" }}>
                  {feature.icon}
                </div>
                <h3 style={{ fontSize: "1rem", fontWeight: 700, color: "#F1F0FF", marginBottom: "0.5rem", textTransform: "none", fontFamily: "system-ui, sans-serif" }}>{feature.title}</h3>
                <p style={{ fontSize: "0.875rem", color: "rgba(241,240,255,0.55)", lineHeight: 1.65, textTransform: "none", fontWeight: 400 }}>{feature.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* PRICING */}
      <section id="pricing" style={{ padding: "6rem 0" }}>
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-16">
            <p style={{ fontSize: "0.8rem", color: "#A78BFA", textTransform: "uppercase", letterSpacing: "0.15em", fontWeight: 600, marginBottom: "0.75rem" }}>Transparent Pricing</p>
            <h2 style={{ fontSize: "clamp(2rem, 4vw, 3rem)", fontWeight: 800, letterSpacing: "-0.03em", textTransform: "none", color: "#F1F0FF", fontFamily: "system-ui, sans-serif", marginBottom: "1rem" }}>
              Pick your plan. Cancel anytime.
            </h2>
            <p style={{ color: "rgba(241,240,255,0.5)", textTransform: "none", fontWeight: 400 }}>Women are always free. Men get a free trial on every first call.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-stretch">
            {PRICING.map((plan, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: i * 0.1 }}
                viewport={{ once: true }}
                style={{ background: plan.popular ? "linear-gradient(145deg, rgba(139,92,246,0.15), rgba(236,72,153,0.1))" : "rgba(255,255,255,0.03)", border: plan.popular ? "1px solid rgba(139,92,246,0.5)" : "1px solid rgba(255,255,255,0.08)", borderRadius: "1.25rem", padding: "2rem", position: "relative", display: "flex", flexDirection: "column", boxShadow: plan.popular ? "0 0 40px rgba(139,92,246,0.2)" : "none" }}
                data-testid={`pricing-card-${plan.name.toLowerCase()}`}
              >
                {plan.popular && (
                  <div style={{ position: "absolute", top: "-1px", left: "50%", transform: "translateX(-50%)", background: "linear-gradient(90deg, #8B5CF6, #EC4899)", color: "#fff", fontSize: "0.7rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", padding: "0.25rem 1rem", borderRadius: "0 0 0.5rem 0.5rem" }}>
                    Most Popular
                  </div>
                )}
                <div style={{ marginBottom: "0.5rem" }}>
                  <span style={{ fontSize: "0.7rem", color: plan.color, textTransform: "uppercase", letterSpacing: "0.12em", fontWeight: 600 }}>{plan.subtitle}</span>
                </div>
                <h3 style={{ fontSize: "1.4rem", fontWeight: 800, color: "#F1F0FF", marginBottom: "0.5rem", textTransform: "none", fontFamily: "system-ui, sans-serif" }}>{plan.name}</h3>
                <div style={{ display: "flex", alignItems: "baseline", gap: "0.25rem", marginBottom: "0.25rem" }}>
                  <span style={{ fontSize: "2.5rem", fontWeight: 800, background: `linear-gradient(90deg, ${plan.color}, #F472B6)`, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", fontFamily: "system-ui, sans-serif" }}>{plan.price}</span>
                  <span style={{ color: "rgba(241,240,255,0.4)", fontSize: "0.875rem", textTransform: "none" }}>{plan.per}</span>
                </div>
                <div style={{ color: plan.color, fontSize: "0.8rem", fontWeight: 600, marginBottom: "1.5rem" }}>{plan.minutes} talk time</div>
                <ul style={{ listStyle: "none", padding: 0, margin: "0 0 2rem", display: "flex", flexDirection: "column", gap: "0.65rem", flex: 1 }}>
                  {plan.features.map((f, j) => (
                    <li key={j} style={{ display: "flex", alignItems: "center", gap: "0.6rem", color: "rgba(241,240,255,0.7)", fontSize: "0.875rem", textTransform: "none", fontWeight: 400 }}>
                      <CheckCircle className="w-4 h-4 flex-shrink-0" style={{ color: plan.color }} />
                      {f}
                    </li>
                  ))}
                </ul>
                <CallLink
                  phone={displayPhone}
                  testId={`pricing-cta-${plan.name.toLowerCase()}`}
                  style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "0.5rem", background: plan.popular ? "linear-gradient(135deg, #8B5CF6, #EC4899)" : "rgba(255,255,255,0.07)", border: plan.popular ? "none" : "1px solid rgba(255,255,255,0.12)", color: "#fff", borderRadius: "3rem", padding: "0.875rem", fontWeight: 700, textDecoration: "none", fontSize: "0.95rem", boxShadow: plan.popular ? "0 4px 20px rgba(139,92,246,0.4)" : "none", textTransform: "none" }}
                >
                  <Phone className="w-4 h-4" /> {plan.cta}
                </CallLink>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* TESTIMONIALS */}
      <section style={{ background: "rgba(236,72,153,0.03)", borderTop: "1px solid rgba(236,72,153,0.1)", padding: "6rem 0" }}>
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-16">
            <p style={{ fontSize: "0.8rem", color: "#F472B6", textTransform: "uppercase", letterSpacing: "0.15em", fontWeight: 600, marginBottom: "0.75rem" }}>Real Stories</p>
            <h2 style={{ fontSize: "clamp(2rem, 4vw, 3rem)", fontWeight: 800, letterSpacing: "-0.03em", textTransform: "none", color: "#F1F0FF", fontFamily: "system-ui, sans-serif" }}>
              Don't take our word for it
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {TESTIMONIALS.map((t, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: i * 0.1 }}
                viewport={{ once: true }}
                style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(236,72,153,0.15)", borderRadius: "1.25rem", padding: "2rem" }}
                data-testid={`testimonial-card-${i}`}
              >
                <div style={{ display: "flex", gap: "0.25rem", marginBottom: "1rem" }}>
                  {[...Array(t.rating)].map((_, j) => <Star key={j} className="w-4 h-4" style={{ color: "#FBBF24", fill: "#FBBF24" }} />)}
                </div>
                <p style={{ color: "rgba(241,240,255,0.8)", lineHeight: 1.75, fontSize: "0.95rem", fontStyle: "italic", marginBottom: "1.25rem", textTransform: "none", fontWeight: 400 }}>"{t.text}"</p>
                <div>
                  <div style={{ fontWeight: 600, color: "#F1F0FF", textTransform: "none", fontSize: "0.9rem" }}>{t.name}</div>
                  <div style={{ fontSize: "0.8rem", color: "rgba(241,240,255,0.4)", textTransform: "none" }}>{t.city}</div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* FINAL CTA */}
      <section style={{ padding: "7rem 0" }}>
        <div className="max-w-4xl mx-auto px-6 text-center">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.6 }}
            viewport={{ once: true }}
            style={{ background: "linear-gradient(135deg, rgba(139,92,246,0.15) 0%, rgba(236,72,153,0.12) 100%)", border: "1px solid rgba(139,92,246,0.3)", borderRadius: "2rem", padding: "4rem 3rem", position: "relative", overflow: "hidden" }}
          >
            <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", width: "30rem", height: "30rem", borderRadius: "50%", background: "radial-gradient(circle, rgba(139,92,246,0.15) 0%, transparent 70%)", pointerEvents: "none" }} />
            <h2 style={{ fontSize: "clamp(2rem, 4vw, 3.2rem)", fontWeight: 800, letterSpacing: "-0.03em", textTransform: "none", color: "#F1F0FF", fontFamily: "system-ui, sans-serif", marginBottom: "1rem" }}>
              Your next great conversation is{" "}
              <span style={{ background: "linear-gradient(90deg, #A78BFA, #F472B6)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>one call away.</span>
            </h2>
            <p style={{ color: "rgba(241,240,255,0.6)", fontSize: "1.1rem", lineHeight: 1.7, marginBottom: "2.5rem", textTransform: "none", fontWeight: 400 }}>
              Pick up the phone. That's it. No account. No setup. Just you and a world of real voices waiting to connect.
            </p>
            {cityLabel && (
              <div style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem", background: "rgba(236,72,153,0.12)", border: "1px solid rgba(236,72,153,0.25)", borderRadius: "2rem", padding: "0.3rem 0.9rem", fontSize: "0.8rem", color: "#F9A8D4", marginBottom: "1.5rem" }}>
                <MapPin className="w-3.5 h-3.5" />
                Serving {cityLabel} and surrounding areas
              </div>
            )}
            <div>
              <CallLink
                phone={displayPhone}
                testId="final-cta-call"
                style={{ display: "inline-flex", alignItems: "center", gap: "0.75rem", background: "linear-gradient(135deg, #8B5CF6, #EC4899)", color: "#fff", borderRadius: "3rem", padding: "1.1rem 3rem", fontSize: "1.2rem", fontWeight: 700, textDecoration: "none", boxShadow: "0 10px 40px rgba(139,92,246,0.5)", textTransform: "none" }}
              >
                <Phone className="w-5 h-5" /> Call {displayPhoneFormatted} Free
              </CallLink>
            </div>
            <p style={{ marginTop: "1.25rem", fontSize: "0.8rem", color: "rgba(241,240,255,0.35)", textTransform: "none", fontWeight: 400 }}>
              All members must be 18 years of age or older · Available nationwide
            </p>
          </motion.div>
        </div>
      </section>

      {/* FOOTER */}
      <footer style={{ borderTop: "1px solid rgba(255,255,255,0.06)", padding: "3rem 0" }}>
        <div className="max-w-6xl mx-auto px-6">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
              <div style={{ width: 32, height: 32, borderRadius: "50%", background: "linear-gradient(135deg, #8B5CF6, #EC4899)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Phone className="w-3.5 h-3.5 text-white" />
              </div>
              <span style={{ fontSize: "1.1rem", fontWeight: 700, background: "linear-gradient(90deg, #A78BFA, #F472B6)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>TalkSpark</span>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-6">
              {["Privacy Policy", "Terms of Use", "Safety Tips", "Customer Support", "FAQ"].map((link) => (
                <a key={link} href="#" style={{ color: "rgba(241,240,255,0.4)", textDecoration: "none", fontSize: "0.8rem", transition: "color 0.2s", textTransform: "none", fontWeight: 400 }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = "rgba(241,240,255,0.8)")}
                  onMouseLeave={(e) => (e.currentTarget.style.color = "rgba(241,240,255,0.4)")}
                  data-testid={`footer-link-${link.toLowerCase().replace(/\s+/g, "-")}`}
                >
                  {link}
                </a>
              ))}
            </div>
            <p style={{ fontSize: "0.75rem", color: "rgba(241,240,255,0.25)", textTransform: "none", fontWeight: 400, textAlign: "center" }}>
              © 2026 TalkSpark. All rights reserved.<br />All members 18+ only.
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
