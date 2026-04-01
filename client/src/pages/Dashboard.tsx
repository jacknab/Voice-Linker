import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import {
  Phone, LogOut, Loader2, User, Clock, Shield, Star, Zap,
  KeyRound, ChevronRight, Eye, EyeOff, CheckCircle2, PhoneCall,
  AlertTriangle, Link2, CheckCircle, History, PhoneIncoming, Timer, Plus, Trash2, PhoneForwarded,
  X, RefreshCw,
} from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

const DEFAULT_SITE_NAME = "Phone Booth";
const MAX_LINK_ATTEMPTS = 3;

interface WebUser {
  id: string;
  email: string;
  createdAt: string | null;
  linkedPhoneNumber: string | null;
  linkedMembershipNumber: string | null;
  linkAttempts: number;
  isLocked: boolean;
}

interface SiteSettings {
  siteName: string;
  fallbackPhoneNumber: string;
  customerServiceEmail: string | null;
  customerServicePhone: string | null;
}

interface LocalNumber {
  city: string | null;
  state: string | null;
  phoneNumber: string | null;
}

interface MembershipSettings {
  freeTrialMinutes: number;
  plan1Name: string; plan1Minutes: number; plan1PriceCents: number;
  plan2Name: string; plan2Minutes: number; plan2PriceCents: number;
  plan3Name: string; plan3Minutes: number; plan3PriceCents: number;
  bonusPlanKey: string | null;
  billingMode: string;
}

interface PhoneMembership {
  phoneNumber: string;
  membershipTier: string | null;
  remainingSeconds: number | null;
  membershipNumber: string | null;
  mailboxNumber: string | null;
}

interface CallHistoryEntry {
  id: string;
  callSid: string;
  durationSeconds: number;
  startedAt: string | null;
  completedAt: string | null;
  toPhoneNumber: string | null;
}

interface AltPhone {
  id: string;
  webUserId: string;
  phoneNumber: string;
  createdAt: string | null;
}

function formatMemberSince(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

function formatMinutes(minutes: number): string {
  if (minutes >= 10080) return `${Math.round(minutes / 10080 * 10) / 10} weeks`;
  if (minutes >= 1440) return `${Math.round(minutes / 1440 * 10) / 10} days`;
  if (minutes >= 60) return `${Math.round(minutes / 60)} hrs`;
  return `${minutes} min`;
}

function formatSeconds(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m} min`;
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m < 60) return `${m}m ${s}s`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return `${h}h ${rm}m`;
}

function formatCallDate(dateStr: string | null): string {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatCallTime(dateStr: string | null): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
}

function formatPrice(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function formatPhone(phone: string): string {
  const d = phone.replace(/\D/g, "");
  if (d.length === 11 && d.startsWith("1")) {
    return `+1 (${d.slice(1, 4)}) ${d.slice(4, 7)}-${d.slice(7)}`;
  }
  if (d.length === 10) return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
  return phone;
}

const PLAN_ICONS = [Star, Zap, Clock];
const PLAN_COLORS = ["#f59e0b", "#1d4ed8", "#6b7280"];
const PLAN_KEYS = ["plan1", "plan2", "plan3"];

// ─── Link Membership Modal ────────────────────────────────────────────────────
// Two-step flow:
//   Step 1 — Enter phone number → verify it has an active membership
//   Step 2 — Show 3-digit code → user calls the access number and enters it
function LinkMembershipModal({
  accessNumber,
  onSuccess,
}: {
  accessNumber: string;
  onSuccess: () => void;
}) {
  const queryClient = useQueryClient();
  const [isOpen, setIsOpen] = useState(false);

  // Step 1: phone check
  const [step, setStep] = useState<"phone" | "code">("phone");
  const [phoneInput, setPhoneInput] = useState("");
  const [isChecking, setIsChecking] = useState(false);
  const [checkError, setCheckError] = useState<string | null>(null);
  const [verifiedPhone, setVerifiedPhone] = useState<string | null>(null);

  // Step 2: code
  const [code, setCode] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<Date | null>(null);
  const [timeLeft, setTimeLeft] = useState(0);
  const [isGenerating, setIsGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  const [linked, setLinked] = useState(false);

  const resetAll = () => {
    setStep("phone");
    setPhoneInput("");
    setIsChecking(false);
    setCheckError(null);
    setVerifiedPhone(null);
    setCode(null);
    setExpiresAt(null);
    setGenError(null);
    setLinked(false);
  };

  const openModal = () => {
    resetAll();
    setIsOpen(true);
  };

  const closeModal = () => {
    setIsOpen(false);
    resetAll();
  };

  // Step 1: check phone against system
  const checkPhone = async () => {
    setIsChecking(true);
    setCheckError(null);
    try {
      const res = await fetch("/api/auth/check-phone", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phoneNumber: phoneInput }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Verification failed.");
      setVerifiedPhone(data.phoneNumber);
      setStep("code");
      generateCode();
    } catch (err: any) {
      setCheckError(err.message || "Verification failed.");
    } finally {
      setIsChecking(false);
    }
  };

  // Step 2: generate link code
  const generateCode = async () => {
    setIsGenerating(true);
    setGenError(null);
    setCode(null);
    setExpiresAt(null);
    try {
      const res = await fetch("/api/auth/generate-link-code", { method: "POST", credentials: "include" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to generate code.");
      setCode(data.code);
      const exp = new Date(data.expiresAt);
      setExpiresAt(exp);
      setTimeLeft(Math.max(0, Math.floor((exp.getTime() - Date.now()) / 1000)));
    } catch (err: any) {
      setGenError(err.message || "Failed to generate code.");
    } finally {
      setIsGenerating(false);
    }
  };

  // Countdown timer
  useEffect(() => {
    if (!isOpen || !expiresAt) return;
    const tick = setInterval(() => {
      const left = Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000));
      setTimeLeft(left);
    }, 1000);
    return () => clearInterval(tick);
  }, [isOpen, expiresAt]);

  // Poll for successful link every 3 seconds (once on code step)
  useEffect(() => {
    if (!isOpen || step !== "code" || !code || linked) return;
    const poll = setInterval(async () => {
      try {
        const res = await fetch("/api/auth/me", { credentials: "include" });
        if (!res.ok) return;
        const data = await res.json();
        if (data.linkedPhoneNumber) {
          setLinked(true);
          clearInterval(poll);
          await queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
          await queryClient.invalidateQueries({ queryKey: ["/api/auth/membership"] });
          setTimeout(() => {
            closeModal();
            onSuccess();
          }, 1800);
        }
      } catch {}
    }, 3000);
    return () => clearInterval(poll);
  }, [isOpen, step, code, linked]);

  const mins = Math.floor(timeLeft / 60);
  const secs = timeLeft % 60;
  const countdownStr = `${mins}:${String(secs).padStart(2, "0")}`;
  const isExpired = timeLeft === 0 && !!expiresAt && !linked;

  // Shared styles
  const S = {
    label: { color: "#555", fontSize: "0.7rem", fontWeight: 600 as const, textTransform: "uppercase" as const, letterSpacing: "0.08em", margin: "0 0 0.35rem" },
    input: {
      width: "100%", background: "#0d1a2e", border: "1px solid #1e3a5f", borderRadius: "8px",
      padding: "0.75rem 1rem", color: "#fff", fontSize: "1rem", outline: "none",
      boxSizing: "border-box" as const,
    },
    primaryBtn: {
      background: "#1d4ed8", color: "#fff", border: "none", borderRadius: "8px",
      padding: "0.7rem 1.5rem", fontWeight: 700, fontSize: "0.875rem", cursor: "pointer",
      display: "inline-flex", alignItems: "center", gap: "0.5rem", width: "100%",
      justifyContent: "center",
    },
  };

  return (
    <>
      {/* ── Unlinked card with Link Membership button ── */}
      <div
        data-testid="card-link-phone"
        style={{ background: "#0d1a2e", border: "1px solid #1e3a5f", borderRadius: "14px", padding: "1.75rem", marginBottom: "1.5rem" }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", gap: "1rem" }}>
          <div style={{ width: 44, height: 44, background: "#1d4ed820", border: "1px solid #1d4ed840", borderRadius: "10px", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: "0.1rem" }}>
            <Link2 size={20} color="#60a5fa" />
          </div>
          <div style={{ flex: 1 }}>
            <h3 style={{ color: "#fff", fontSize: "1rem", fontWeight: 700, margin: "0 0 0.3rem" }}>Link Your Membership</h3>
            <p style={{ color: "#93c5fd", fontSize: "0.82rem", margin: "0 0 1.25rem", lineHeight: 1.6 }}>
              Connect your phone membership to this web account to view your balance, call history, and manage your subscription online.
            </p>
            <button onClick={openModal} data-testid="button-link-membership" style={{ background: "#1d4ed8", color: "#fff", border: "none", borderRadius: "8px", padding: "0.65rem 1.5rem", fontWeight: 700, fontSize: "0.875rem", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "0.5rem" }}>
              <PhoneCall size={15} /> Link Membership
            </button>
          </div>
        </div>
      </div>

      {/* ── Modal overlay ── */}
      {isOpen && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem" }}
          onClick={e => { if (e.target === e.currentTarget) closeModal(); }}
        >
          <div style={{ background: "#0a0f1e", border: "1px solid #1e3a5f", borderRadius: "18px", padding: "2rem", width: "100%", maxWidth: "420px", position: "relative" }}>
            {/* Close */}
            <button onClick={closeModal} style={{ position: "absolute", top: "1rem", right: "1rem", background: "none", border: "none", cursor: "pointer", color: "#555", padding: "0.25rem" }}>
              <X size={20} />
            </button>

            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "1.5rem" }}>
              <div style={{ width: 42, height: 42, background: "#1d4ed820", border: "1px solid #1d4ed840", borderRadius: "10px", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <PhoneCall size={20} color="#60a5fa" />
              </div>
              <div>
                <h3 style={{ color: "#fff", fontSize: "1.05rem", fontWeight: 700, margin: 0 }}>Link Your Membership</h3>
                <p style={{ color: "#555", fontSize: "0.75rem", margin: 0 }}>Phone-verified account linking</p>
              </div>
            </div>

            {/* ── Success ── */}
            {linked ? (
              <div style={{ textAlign: "center", padding: "1.5rem 0" }}>
                <div style={{ width: 56, height: 56, background: "#14532d30", border: "1px solid #166534", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 1rem" }}>
                  <CheckCircle size={28} color="#22c55e" />
                </div>
                <p style={{ color: "#22c55e", fontSize: "1rem", fontWeight: 700, margin: "0 0 0.35rem" }}>Membership Linked!</p>
                <p style={{ color: "#666", fontSize: "0.82rem", margin: 0 }}>Your phone number has been connected to this account.</p>
              </div>

            ) : step === "phone" ? (
              /* ── Step 1: Phone number entry ── */
              <>
                {/* Step indicator */}
                <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1.5rem" }}>
                  {["Verify Phone", "Call & Confirm"].map((label, i) => (
                    <div key={label} style={{ flex: 1, textAlign: "center" }}>
                      <div style={{ height: 3, borderRadius: 2, background: i === 0 ? "#1d4ed8" : "#1e3a5f", marginBottom: "0.35rem" }} />
                      <span style={{ fontSize: "0.68rem", color: i === 0 ? "#60a5fa" : "#2a4a7a", fontWeight: 600 }}>{label}</span>
                    </div>
                  ))}
                </div>

                <p style={{ color: "#93c5fd", fontSize: "0.82rem", margin: "0 0 1.25rem", lineHeight: 1.6 }}>
                  Enter the phone number you used to call the system and purchase your membership. We'll confirm your membership is active before proceeding.
                </p>

                <div style={{ marginBottom: "1rem" }}>
                  <p style={S.label}>Your Membership Phone Number</p>
                  <input
                    data-testid="input-link-phone"
                    type="tel"
                    value={phoneInput}
                    onChange={e => { setPhoneInput(e.target.value); setCheckError(null); }}
                    onKeyDown={e => { if (e.key === "Enter" && phoneInput.replace(/\D/g, "").length >= 10) checkPhone(); }}
                    placeholder="(555) 000-0000"
                    style={S.input}
                    autoFocus
                  />
                </div>

                {checkError && (
                  <div style={{ background: "#2d0a0a", border: "1px solid #7f1d1d", borderRadius: "8px", padding: "0.75rem 1rem", marginBottom: "1rem", display: "flex", gap: "0.5rem", alignItems: "flex-start" }}>
                    <AlertTriangle size={15} color="#f87171" style={{ flexShrink: 0, marginTop: "0.1rem" }} />
                    <p style={{ color: "#f87171", fontSize: "0.82rem", margin: 0, lineHeight: 1.5 }}>{checkError}</p>
                  </div>
                )}

                <button
                  data-testid="button-check-phone"
                  onClick={checkPhone}
                  disabled={isChecking || phoneInput.replace(/\D/g, "").length < 10}
                  style={{ ...S.primaryBtn, opacity: (isChecking || phoneInput.replace(/\D/g, "").length < 10) ? 0.6 : 1 }}
                >
                  {isChecking ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />}
                  {isChecking ? "Checking…" : "Check Membership"}
                </button>
              </>

            ) : (
              /* ── Step 2: Code display ── */
              <>
                {/* Step indicator */}
                <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1.5rem" }}>
                  {["Verify Phone", "Call & Confirm"].map((label, i) => (
                    <div key={label} style={{ flex: 1, textAlign: "center" }}>
                      <div style={{ height: 3, borderRadius: 2, background: "#1d4ed8", marginBottom: "0.35rem" }} />
                      <span style={{ fontSize: "0.68rem", color: "#60a5fa", fontWeight: 600 }}>{label}</span>
                    </div>
                  ))}
                </div>

                {/* Verified phone badge */}
                {verifiedPhone && (
                  <div style={{ background: "#052e16", border: "1px solid #166534", borderRadius: "8px", padding: "0.6rem 1rem", marginBottom: "1.25rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <CheckCircle2 size={14} color="#22c55e" />
                    <span style={{ color: "#22c55e", fontSize: "0.8rem", fontWeight: 600 }}>Active membership confirmed for {verifiedPhone}</span>
                  </div>
                )}

                {isGenerating ? (
                  <div style={{ textAlign: "center", padding: "2rem 0" }}>
                    <Loader2 size={30} color="#1d4ed8" className="animate-spin" style={{ margin: "0 auto 1rem" }} />
                    <p style={{ color: "#666", fontSize: "0.85rem", margin: 0 }}>Generating your link code…</p>
                  </div>
                ) : genError ? (
                  <div style={{ textAlign: "center", padding: "1rem 0" }}>
                    <p style={{ color: "#f87171", fontSize: "0.85rem", margin: "0 0 1rem" }}>{genError}</p>
                    <button onClick={generateCode} style={{ background: "#1d4ed8", color: "#fff", border: "none", borderRadius: "8px", padding: "0.6rem 1.25rem", fontWeight: 700, fontSize: "0.85rem", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "0.5rem" }}>
                      <RefreshCw size={14} /> Try Again
                    </button>
                  </div>
                ) : code ? (
                  <>
                    {/* Instructions */}
                    <div style={{ background: "#0d1a2e", border: "1px solid #1e3a5f", borderRadius: "10px", padding: "1rem 1.25rem", marginBottom: "1.5rem" }}>
                      <p style={{ color: "#93c5fd", fontSize: "0.82rem", margin: 0, lineHeight: 1.7 }}>
                        <strong style={{ color: "#60a5fa" }}>Step 1.</strong> Call your access number below.<br />
                        <strong style={{ color: "#60a5fa" }}>Step 2.</strong> When the system answers, enter the 3-digit code followed by <strong>#</strong>.<br />
                        <strong style={{ color: "#60a5fa" }}>Step 3.</strong> This page will update automatically once verified.
                      </p>
                    </div>

                    {/* Access number */}
                    <div style={{ marginBottom: "1.25rem" }}>
                      <p style={S.label}>Your Access Number</p>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                        <Phone size={15} color="#60a5fa" />
                        <span style={{ color: "#fff", fontSize: "1.05rem", fontWeight: 700, letterSpacing: "0.03em" }}>{accessNumber}</span>
                      </div>
                    </div>

                    {/* Code display */}
                    <div style={{ marginBottom: "1.25rem" }}>
                      <p style={S.label}>Your 3-Digit Link Code</p>
                      <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
                        <div style={{ background: isExpired ? "#1a1a1a" : "#0d1a2e", border: `2px solid ${isExpired ? "#333" : "#1d4ed8"}`, borderRadius: "12px", padding: "0.875rem 1.5rem", flex: 1, textAlign: "center" }}>
                          <span style={{ color: isExpired ? "#444" : "#fff", fontSize: "2.5rem", fontWeight: 800, letterSpacing: "0.35em", fontFamily: "monospace" }}>{code}</span>
                        </div>
                        {isExpired && (
                          <button onClick={generateCode} title="Generate new code" style={{ background: "#1a2a4a", border: "1px solid #1e3a5f", borderRadius: "8px", padding: "0.65rem", cursor: "pointer", color: "#60a5fa", display: "flex", alignItems: "center" }}>
                            <RefreshCw size={16} />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Timer */}
                    {!isExpired ? (
                      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                        <Timer size={14} color={timeLeft < 60 ? "#ef4444" : "#22c55e"} />
                        <span style={{ color: timeLeft < 60 ? "#ef4444" : "#22c55e", fontSize: "0.82rem", fontWeight: 600 }}>Code expires in {countdownStr}</span>
                        <span style={{ color: "#333", fontSize: "0.78rem", marginLeft: "auto" }}>Waiting for verification…</span>
                      </div>
                    ) : (
                      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                        <AlertTriangle size={14} color="#f87171" />
                        <span style={{ color: "#f87171", fontSize: "0.82rem" }}>Code expired — click the refresh icon to get a new one.</span>
                      </div>
                    )}

                    {/* Back link */}
                    <button onClick={() => { setStep("phone"); setCode(null); setExpiresAt(null); setGenError(null); }} style={{ background: "none", border: "none", color: "#555", fontSize: "0.75rem", cursor: "pointer", marginTop: "1.25rem", padding: 0, textDecoration: "underline" }}>
                      ← Use a different phone number
                    </button>
                  </>
                ) : null}
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}

// ─── Membership Info Card ─────────────────────────────────────────────────────
function MembershipInfoCard({ membership, siteName }: { membership: PhoneMembership; siteName: string }) {
  const tierColors: Record<string, string> = {
    premium: "#f59e0b",
    standard: "#1d4ed8",
    basic: "#6b7280",
  };
  const tierKey = (membership.membershipTier || "").toLowerCase();
  const tierColor = tierColors[tierKey] || "#888";
  const hasTime = typeof membership.remainingSeconds === "number" && membership.remainingSeconds > 0;

  return (
    <div data-testid="card-membership-info" style={{ background: "#111", border: "1px solid #1e1e1e", borderRadius: "14px", padding: "1.5rem", marginBottom: "1.5rem" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", marginBottom: "1.25rem" }}>
        <CheckCircle size={16} color="#22c55e" />
        <span style={{ color: "#555", fontSize: "0.72rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em" }}>Linked Membership</span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "1rem" }}>
        <div>
          <p style={{ color: "#555", fontSize: "0.72rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", margin: "0 0 0.3rem" }}>Phone Number</p>
          <p style={{ color: "#ccc", fontSize: "0.9rem", fontWeight: 600, margin: 0 }} data-testid="text-linked-phone">
            {formatPhone(membership.phoneNumber)}
          </p>
        </div>

        <div>
          <p style={{ color: "#555", fontSize: "0.72rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", margin: "0 0 0.3rem" }}>Membership Tier</p>
          <p data-testid="text-membership-tier" style={{ margin: 0 }}>
            {membership.membershipTier ? (
              <span style={{ background: `${tierColor}18`, border: `1px solid ${tierColor}40`, borderRadius: "6px", padding: "0.15rem 0.5rem", color: tierColor, fontSize: "0.82rem", fontWeight: 700 }}>
                {membership.membershipTier}
              </span>
            ) : (
              <span style={{ color: "#666", fontSize: "0.85rem" }}>No active plan</span>
            )}
          </p>
        </div>

        <div>
          <p style={{ color: "#555", fontSize: "0.72rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", margin: "0 0 0.3rem" }}>Remaining Time</p>
          {hasTime ? (
            <p style={{ color: "#22c55e", fontSize: "1rem", fontWeight: 800, margin: 0 }} data-testid="text-remaining-time">
              {formatSeconds(membership.remainingSeconds!)}
            </p>
          ) : (
            <p style={{ color: "#666", fontSize: "0.85rem", margin: 0 }} data-testid="text-remaining-time">
              No time remaining
            </p>
          )}
        </div>

        {membership.membershipNumber && (
          <div>
            <p style={{ color: "#555", fontSize: "0.72rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", margin: "0 0 0.3rem" }}>Member ID</p>
            <p style={{ color: "#888", fontSize: "0.8rem", fontFamily: "monospace", letterSpacing: "0.05em", margin: 0 }} data-testid="text-membership-number">
              {membership.membershipNumber}
            </p>
            <p style={{ color: "#444", fontSize: "0.68rem", margin: "0.2rem 0 0" }}>10-digit member identifier</p>
          </div>
        )}

        {membership.mailboxNumber && (
          <div>
            <p style={{ color: "#555", fontSize: "0.72rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", margin: "0 0 0.3rem" }}>Mailbox Number</p>
            <p style={{ color: "#f5a623", fontSize: "1.25rem", fontFamily: "monospace", fontWeight: 800, letterSpacing: "0.15em", margin: 0 }} data-testid="text-mailbox-number">
              {membership.mailboxNumber}
            </p>
            <p style={{ color: "#444", fontSize: "0.68rem", margin: "0.2rem 0 0" }}>Your personal mailbox</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────
export default function Dashboard() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [activeSection, setActiveSection] = useState<"overview" | "plans" | "history" | "account">("overview");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [pwSuccess, setPwSuccess] = useState(false);

  const { data: siteData } = useQuery<SiteSettings>({ queryKey: ["/api/site-settings"], staleTime: 5 * 60 * 1000 });
  const siteName = siteData?.siteName || DEFAULT_SITE_NAME;

  const { data: me, isLoading } = useQuery<WebUser>({ queryKey: ["/api/auth/me"], retry: false });

  const { data: localNumber } = useQuery<LocalNumber>({ queryKey: ["/api/local-number"], staleTime: 60 * 1000 });

  const { data: membershipSettings } = useQuery<MembershipSettings>({ queryKey: ["/api/membership-settings"], staleTime: 5 * 60 * 1000 });

  const { data: phoneMembership } = useQuery<PhoneMembership>({
    queryKey: ["/api/auth/membership"],
    enabled: !!me?.linkedPhoneNumber,
    retry: false,
  });

  const { data: callHistory, isLoading: historyLoading } = useQuery<CallHistoryEntry[]>({
    queryKey: ["/api/auth/call-history"],
    enabled: !!me?.linkedPhoneNumber && activeSection === "history",
    retry: false,
    staleTime: 60 * 1000,
  });

  const { data: altPhones = [], isLoading: altPhonesLoading } = useQuery<AltPhone[]>({
    queryKey: ["/api/auth/alt-phones"],
    enabled: !!me?.linkedPhoneNumber,
    retry: false,
    staleTime: 60 * 1000,
  });

  const [altPhoneInput, setAltPhoneInput] = useState("");

  const addAltPhoneMutation = useMutation({
    mutationFn: (phoneNumber: string) => apiRequest("POST", "/api/auth/alt-phones", { phoneNumber }),
    onSuccess: () => {
      setAltPhoneInput("");
      queryClient.invalidateQueries({ queryKey: ["/api/auth/alt-phones"] });
      toast({ title: "Number added", description: "The alternate number has been linked to your membership." });
    },
    onError: async (err: any) => {
      let message = "Failed to add alternate number.";
      try { const b = await err.response?.json?.(); if (b?.error) message = b.error; } catch {}
      toast({ title: "Error", description: message, variant: "destructive" });
    },
  });

  const removeAltPhoneMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/auth/alt-phones/${id}`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/alt-phones"] });
      toast({ title: "Number removed", description: "The alternate number has been unlinked." });
    },
    onError: async (err: any) => {
      let message = "Failed to remove alternate number.";
      try { const b = await err.response?.json?.(); if (b?.error) message = b.error; } catch {}
      toast({ title: "Error", description: message, variant: "destructive" });
    },
  });

  const logoutMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/auth/logout", {}),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      setLocation("/login");
    },
  });

  const changePasswordMutation = useMutation({
    mutationFn: (data: { currentPassword: string; newPassword: string }) =>
      apiRequest("POST", "/api/auth/change-password", data),
    onSuccess: () => {
      setPwSuccess(true);
      setCurrentPassword(""); setNewPassword(""); setConfirmPassword("");
      setTimeout(() => setPwSuccess(false), 4000);
    },
    onError: async (err: any) => {
      let message = "Failed to change password.";
      try { const b = await err.response?.json?.(); if (b?.error) message = b.error; } catch {}
      toast({ title: "Error", description: message, variant: "destructive" });
    },
  });

  // If locked, sign out immediately and show message
  useEffect(() => {
    if (me?.isLocked) {
      logoutMutation.mutate();
      toast({
        title: "Account locked",
        description: "Your account has been locked after too many failed phone linking attempts. Please contact support.",
        variant: "destructive",
      });
    }
  }, [me?.isLocked]);

  const handleChangePassword = (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      toast({ title: "Passwords don't match", description: "Please confirm your new password.", variant: "destructive" });
      return;
    }
    if (newPassword.length < 8) {
      toast({ title: "Password too short", description: "Password must be at least 8 characters.", variant: "destructive" });
      return;
    }
    changePasswordMutation.mutate({ currentPassword, newPassword });
  };

  if (isLoading) {
    return (
      <div style={{ fontFamily: "'Inter', system-ui, sans-serif", background: "#0d0d0d", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Loader2 size={32} color="#1d4ed8" className="animate-spin" />
      </div>
    );
  }

  if (!me) { setLocation("/login"); return null; }

  const accessNumber = localNumber?.phoneNumber || siteData?.fallbackPhoneNumber || "800-730-2508";

  const plans = membershipSettings ? [
    { key: "plan1", name: membershipSettings.plan1Name, minutes: membershipSettings.plan1Minutes, priceCents: membershipSettings.plan1PriceCents },
    { key: "plan2", name: membershipSettings.plan2Name, minutes: membershipSettings.plan2Minutes, priceCents: membershipSettings.plan2PriceCents },
    { key: "plan3", name: membershipSettings.plan3Name, minutes: membershipSettings.plan3Minutes, priceCents: membershipSettings.plan3PriceCents },
  ] : [];

  const navItems = [
    { key: "overview", label: "Overview" },
    { key: "plans", label: "Plans" },
    ...(me?.linkedPhoneNumber ? [{ key: "history", label: "Call History" }] : []),
    { key: "account", label: "Account" },
  ] as { key: "overview" | "plans" | "history" | "account"; label: string }[];

  return (
    <div style={{ fontFamily: "'Inter', system-ui, sans-serif", background: "#0d0d0d", minHeight: "100vh", display: "flex", flexDirection: "column" }}>

      {/* Top Nav */}
      <nav style={{ background: "#000", borderBottom: "1px solid #1a1a1a", position: "sticky", top: 0, zIndex: 10 }}>
        <div style={{ maxWidth: "1100px", margin: "0 auto", padding: "0 1.5rem", display: "flex", alignItems: "center", justifyContent: "space-between", minHeight: "64px" }}>
          <Link href="/" style={{ display: "flex", alignItems: "center", gap: "0.5rem", textDecoration: "none" }}>
            <div style={{ width: 36, height: 36, background: "#1d4ed8", borderRadius: "8px", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Phone size={16} color="#fff" />
            </div>
            <span style={{ fontSize: "1rem", fontWeight: 800, color: "#fff" }}>{siteName}</span>
          </Link>
          <button
            onClick={() => logoutMutation.mutate()}
            disabled={logoutMutation.isPending}
            data-testid="button-logout"
            style={{ display: "flex", alignItems: "center", gap: "0.4rem", background: "none", border: "1px solid #2a2a2a", borderRadius: "8px", color: "#aaa", cursor: "pointer", fontSize: "0.82rem", padding: "0.45rem 0.875rem", transition: "all 0.15s" }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = "#444"; e.currentTarget.style.color = "#fff"; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = "#2a2a2a"; e.currentTarget.style.color = "#aaa"; }}
          >
            {logoutMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <LogOut size={14} />}
            Sign out
          </button>
        </div>
      </nav>

      <div style={{ flex: 1, maxWidth: "1100px", margin: "0 auto", padding: "2rem 1.5rem", width: "100%", boxSizing: "border-box" }}>

        {/* Page header */}
        <div style={{ marginBottom: "2rem" }}>
          <h1 style={{ color: "#fff", fontSize: "1.5rem", fontWeight: 800, margin: 0, letterSpacing: "-0.02em" }}>Member Dashboard</h1>
          <p style={{ color: "#666", fontSize: "0.875rem", marginTop: "0.25rem" }}>Manage your {siteName} account</p>
        </div>

        {/* Tab Nav */}
        <div style={{ display: "flex", gap: "0.25rem", background: "#111", border: "1px solid #1e1e1e", borderRadius: "10px", padding: "0.3rem", marginBottom: "2rem", width: "fit-content" }}>
          {navItems.map(item => (
            <button
              key={item.key}
              onClick={() => setActiveSection(item.key)}
              data-testid={`tab-${item.key}`}
              style={{ background: activeSection === item.key ? "#1d4ed8" : "none", border: "none", borderRadius: "7px", color: activeSection === item.key ? "#fff" : "#888", cursor: "pointer", fontSize: "0.82rem", fontWeight: 600, padding: "0.45rem 1.1rem", transition: "all 0.15s" }}
            >
              {item.label}
            </button>
          ))}
        </div>

        {/* ── OVERVIEW ── */}
        {activeSection === "overview" && (
          <div>
            {/* Phone linking or membership info */}
            {!me.linkedPhoneNumber ? (
              <LinkMembershipModal
                accessNumber={accessNumber}
                onSuccess={() => queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] })}
              />
            ) : phoneMembership ? (
              <MembershipInfoCard membership={phoneMembership} siteName={siteName} />
            ) : (
              <div style={{ background: "#111", border: "1px solid #1e1e1e", borderRadius: "14px", padding: "1.25rem 1.5rem", marginBottom: "1.5rem", display: "flex", alignItems: "center", gap: "0.75rem" }}>
                <CheckCircle size={16} color="#22c55e" />
                <p style={{ color: "#ccc", fontSize: "0.85rem", margin: 0 }}>
                  Phone linked: <strong>{formatPhone(me.linkedPhoneNumber)}</strong>
                </p>
              </div>
            )}

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "1rem" }}>

              {/* Account card */}
              <div data-testid="card-account-info" style={{ background: "#111", border: "1px solid #1e1e1e", borderRadius: "14px", padding: "1.5rem" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginBottom: "1.25rem" }}>
                  <div style={{ width: 48, height: 48, background: "#1d4ed8", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <User size={22} color="#fff" />
                  </div>
                  <div>
                    <p style={{ color: "#555", fontSize: "0.72rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", margin: 0 }}>Your Account</p>
                    <p style={{ color: "#fff", fontSize: "0.9rem", fontWeight: 700, margin: "0.15rem 0 0", wordBreak: "break-all" }} data-testid="text-user-email">{me.email}</p>
                  </div>
                </div>
                <div style={{ borderTop: "1px solid #1e1e1e", paddingTop: "1rem", display: "flex", flexDirection: "column", gap: "0.6rem" }}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: "#666", fontSize: "0.8rem" }}>Member since</span>
                    <span style={{ color: "#ccc", fontSize: "0.8rem", fontWeight: 600 }} data-testid="text-member-since">{formatMemberSince(me.createdAt)}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: "#666", fontSize: "0.8rem" }}>Phone linked</span>
                    <span style={{ color: me.linkedPhoneNumber ? "#22c55e" : "#666", fontSize: "0.8rem", fontWeight: 600 }}>
                      {me.linkedPhoneNumber ? "Yes" : "Not yet"}
                    </span>
                  </div>
                  {me.linkedMembershipNumber && (
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ color: "#666", fontSize: "0.8rem" }}>Membership #</span>
                      <span style={{ color: "#60a5fa", fontSize: "0.8rem", fontWeight: 700, fontFamily: "monospace", letterSpacing: "0.05em" }} data-testid="text-membership-number">
                        {me.linkedMembershipNumber}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Access number card */}
              <div data-testid="card-access-number" style={{ background: "#111", border: "1px solid #1e1e1e", borderRadius: "14px", padding: "1.5rem" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", marginBottom: "1rem" }}>
                  <PhoneCall size={18} color="#1d4ed8" />
                  <p style={{ color: "#555", fontSize: "0.72rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", margin: 0 }}>
                    {localNumber?.city && localNumber?.state ? `${localNumber.city}, ${localNumber.state} Access Number` : "Your Access Number"}
                  </p>
                </div>
                <p data-testid="text-access-number" style={{ color: "#fff", fontSize: "1.75rem", fontWeight: 800, letterSpacing: "0.02em", margin: "0 0 0.5rem" }}>
                  {accessNumber}
                </p>
                <p style={{ color: "#555", fontSize: "0.78rem", margin: "0 0 1rem" }}>Call this number to connect with {siteName}</p>
                <div style={{ background: "#0d0d0d", border: "1px solid #1e1e1e", borderRadius: "8px", padding: "0.75rem 1rem" }}>
                  <p style={{ color: "#888", fontSize: "0.75rem", margin: 0, lineHeight: 1.5 }}>
                    Call in using the phone number you linked to manage minutes and membership.
                  </p>
                </div>
              </div>

              {/* Quick links */}
              <div style={{ background: "#111", border: "1px solid #1e1e1e", borderRadius: "14px", padding: "1.5rem" }}>
                <p style={{ color: "#555", fontSize: "0.72rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", margin: "0 0 1rem" }}>Quick Actions</p>
                {[
                  { label: "View membership plans", section: "plans" as const, icon: Star },
                  { label: "Change your password", section: "account" as const, icon: KeyRound },
                ].map(({ label, section, icon: Icon }) => (
                  <button key={section} onClick={() => setActiveSection(section)} data-testid={`link-quick-${section}`}
                    style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", background: "none", border: "none", borderBottom: "1px solid #1a1a1a", padding: "0.75rem 0", cursor: "pointer", gap: "0.5rem" }}
                    onMouseEnter={e => (e.currentTarget.style.opacity = "0.7")}
                    onMouseLeave={e => (e.currentTarget.style.opacity = "1")}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                      <Icon size={15} color="#1d4ed8" />
                      <span style={{ color: "#ccc", fontSize: "0.85rem" }}>{label}</span>
                    </div>
                    <ChevronRight size={14} color="#555" />
                  </button>
                ))}
                {siteData?.customerServiceEmail && (
                  <a href={`mailto:${siteData.customerServiceEmail}`} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", textDecoration: "none", padding: "0.75rem 0" }} data-testid="link-support-email">
                    <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                      <Shield size={15} color="#1d4ed8" />
                      <span style={{ color: "#ccc", fontSize: "0.85rem" }}>Contact support</span>
                    </div>
                    <ChevronRight size={14} color="#555" />
                  </a>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── PLANS ── */}
        {activeSection === "plans" && (
          <div>
            <div style={{ marginBottom: "1.5rem" }}>
              <h2 style={{ color: "#fff", fontSize: "1.1rem", fontWeight: 700, margin: "0 0 0.25rem" }}>Membership Plans</h2>
              <p style={{ color: "#666", fontSize: "0.85rem", margin: 0 }}>
                Buy time by calling your access number and following the prompts to purchase a plan.
              </p>
            </div>
            {membershipSettings && (
              <div style={{ marginBottom: "1.5rem", background: "#0d1a2e", border: "1px solid #1e3a5f", borderRadius: "12px", padding: "1rem 1.25rem", display: "flex", alignItems: "center", gap: "0.75rem" }}>
                <PhoneCall size={16} color="#60a5fa" />
                <p style={{ color: "#93c5fd", fontSize: "0.82rem", margin: 0 }}>
                  <strong>Free trial:</strong> New callers get {membershipSettings.freeTrialMinutes} minutes free — no credit card required.
                </p>
              </div>
            )}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "1rem" }}>
              {plans.map((plan, i) => {
                const Icon = PLAN_ICONS[i];
                const color = PLAN_COLORS[i];
                const isBonus = membershipSettings?.bonusPlanKey === PLAN_KEYS[i];
                return (
                  <div key={plan.key} data-testid={`card-plan-${plan.key}`} style={{ background: "#111", border: `1px solid ${i === 0 ? "#2a3a5a" : "#1e1e1e"}`, borderRadius: "14px", padding: "1.5rem", position: "relative", overflow: "hidden" }}>
                    {i === 0 && <div style={{ position: "absolute", top: "1rem", right: "1rem", background: "#1d4ed8", borderRadius: "6px", padding: "0.2rem 0.5rem", fontSize: "0.68rem", fontWeight: 700, color: "#fff", textTransform: "uppercase" }}>Most Popular</div>}
                    {isBonus && <div style={{ position: "absolute", top: i === 0 ? "2.4rem" : "1rem", right: "1rem", background: "#166534", borderRadius: "6px", padding: "0.2rem 0.5rem", fontSize: "0.68rem", fontWeight: 700, color: "#4ade80", textTransform: "uppercase" }}>2× Bonus</div>}
                    <div style={{ width: 40, height: 40, borderRadius: "10px", background: `${color}18`, border: `1px solid ${color}33`, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: "1rem" }}>
                      <Icon size={18} color={color} />
                    </div>
                    <p style={{ color: "#fff", fontSize: "1.05rem", fontWeight: 700, margin: "0 0 0.25rem" }}>{plan.name}</p>
                    <p style={{ color: "#888", fontSize: "0.78rem", margin: "0 0 1rem" }}>{formatMinutes(plan.minutes)} of talk time</p>
                    <div style={{ borderTop: "1px solid #1e1e1e", paddingTop: "1rem", display: "flex", alignItems: "baseline", gap: "0.3rem" }}>
                      <span style={{ color: "#fff", fontSize: "1.6rem", fontWeight: 800 }}>{formatPrice(plan.priceCents)}</span>
                      <span style={{ color: "#555", fontSize: "0.8rem" }}>/ purchase</span>
                    </div>
                    <p style={{ color: "#555", fontSize: "0.73rem", margin: "0.5rem 0 0" }}>{(plan.priceCents / plan.minutes * 60).toFixed(1)}¢ per hour</p>
                  </div>
                );
              })}
            </div>
            <div style={{ marginTop: "1.5rem", background: "#111", border: "1px solid #1e1e1e", borderRadius: "12px", padding: "1.25rem" }}>
              <p style={{ color: "#666", fontSize: "0.8rem", margin: 0, lineHeight: 1.6 }}>
                <strong style={{ color: "#888" }}>How to purchase:</strong> Call {accessNumber}, sign in using your linked phone number, then choose "Manage Membership" from the main menu.
                {membershipSettings?.billingMode === "per_day"
                  ? " Minutes are deducted nightly as long as you have an active membership."
                  : " Minutes are deducted during calls as you use them."}
              </p>
            </div>
          </div>
        )}

        {/* ── HISTORY ── */}
        {activeSection === "history" && (
          <div>
            <div style={{ marginBottom: "1.5rem", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "0.75rem" }}>
              <div>
                <h2 style={{ color: "#fff", fontSize: "1.1rem", fontWeight: 700, margin: "0 0 0.25rem" }}>Call History</h2>
                <p style={{ color: "#666", fontSize: "0.85rem", margin: 0 }}>
                  Completed membership calls for {me.linkedPhoneNumber ? formatPhone(me.linkedPhoneNumber) : "your linked number"}
                </p>
              </div>
              {callHistory && (
                <div style={{ background: "#111", border: "1px solid #1e1e1e", borderRadius: "8px", padding: "0.4rem 0.875rem" }}>
                  <span style={{ color: "#888", fontSize: "0.78rem" }}>
                    <strong style={{ color: "#ccc" }}>{callHistory.length}</strong> {callHistory.length === 1 ? "call" : "calls"} total
                  </span>
                </div>
              )}
            </div>

            {historyLoading ? (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "4rem", gap: "0.75rem" }}>
                <Loader2 size={22} color="#1d4ed8" className="animate-spin" />
                <span style={{ color: "#666", fontSize: "0.875rem" }}>Loading call history…</span>
              </div>
            ) : !callHistory || callHistory.length === 0 ? (
              <div style={{ background: "#111", border: "1px solid #1e1e1e", borderRadius: "14px", padding: "3rem 2rem", textAlign: "center" }}>
                <div style={{ width: 48, height: 48, background: "#1a1a1a", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 1rem" }}>
                  <History size={22} color="#555" />
                </div>
                <p style={{ color: "#555", fontSize: "0.9rem", margin: 0 }}>No completed membership calls found yet.</p>
                <p style={{ color: "#444", fontSize: "0.78rem", margin: "0.5rem 0 0" }}>
                  Call your access number to get started — your history will appear here.
                </p>
              </div>
            ) : (
              <div>
                {/* Summary stats */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "0.75rem", marginBottom: "1.5rem" }}>
                  {[
                    {
                      label: "Total Calls",
                      value: callHistory.length.toString(),
                      icon: PhoneIncoming,
                      color: "#1d4ed8",
                    },
                    {
                      label: "Total Talk Time",
                      value: formatDuration(callHistory.reduce((sum, c) => sum + c.durationSeconds, 0)),
                      icon: Timer,
                      color: "#f59e0b",
                    },
                    {
                      label: "Avg Duration",
                      value: formatDuration(Math.round(callHistory.reduce((sum, c) => sum + c.durationSeconds, 0) / callHistory.length)),
                      icon: Clock,
                      color: "#22c55e",
                    },
                  ].map(({ label, value, icon: Icon, color }) => (
                    <div key={label} style={{ background: "#111", border: "1px solid #1e1e1e", borderRadius: "12px", padding: "1rem 1.25rem", display: "flex", alignItems: "center", gap: "0.75rem" }}>
                      <div style={{ width: 36, height: 36, borderRadius: "8px", background: `${color}18`, border: `1px solid ${color}33`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                        <Icon size={16} color={color} />
                      </div>
                      <div>
                        <p style={{ color: "#555", fontSize: "0.68rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", margin: 0 }}>{label}</p>
                        <p style={{ color: "#fff", fontSize: "1rem", fontWeight: 700, margin: "0.1rem 0 0" }} data-testid={`stat-${label.replace(/\s+/g, "-").toLowerCase()}`}>{value}</p>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Call list */}
                <div style={{ background: "#111", border: "1px solid #1e1e1e", borderRadius: "14px", overflow: "hidden" }}>
                  {/* Table header */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 120px 120px 100px", gap: "1rem", padding: "0.75rem 1.25rem", borderBottom: "1px solid #1e1e1e", background: "#0d0d0d" }}>
                    {["Date", "Time", "Duration", "Status"].map(h => (
                      <span key={h} style={{ color: "#555", fontSize: "0.68rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>{h}</span>
                    ))}
                  </div>

                  {callHistory.map((call, idx) => (
                    <div
                      key={call.id}
                      data-testid={`row-call-${call.id}`}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1fr 120px 120px 100px",
                        gap: "1rem",
                        padding: "0.875rem 1.25rem",
                        borderBottom: idx < callHistory.length - 1 ? "1px solid #161616" : "none",
                        alignItems: "center",
                        transition: "background 0.1s",
                      }}
                      onMouseEnter={e => (e.currentTarget.style.background = "#161616")}
                      onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                        <div style={{ width: 28, height: 28, borderRadius: "7px", background: "#1d4ed820", border: "1px solid #1d4ed830", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                          <PhoneIncoming size={12} color="#60a5fa" />
                        </div>
                        <span style={{ color: "#ccc", fontSize: "0.85rem", fontWeight: 600 }}>
                          {formatCallDate(call.startedAt)}
                        </span>
                      </div>
                      <span style={{ color: "#888", fontSize: "0.82rem" }}>
                        {formatCallTime(call.startedAt)}
                      </span>
                      <span style={{ color: "#fff", fontSize: "0.85rem", fontWeight: 600, fontFamily: "monospace" }}>
                        {formatDuration(call.durationSeconds)}
                      </span>
                      <span style={{ background: "#052e16", border: "1px solid #166534", borderRadius: "5px", padding: "0.15rem 0.45rem", color: "#4ade80", fontSize: "0.7rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", width: "fit-content" }}>
                        Completed
                      </span>
                    </div>
                  ))}
                </div>

                <p style={{ color: "#444", fontSize: "0.73rem", textAlign: "center", marginTop: "1rem" }}>
                  Showing {callHistory.length} most recent completed call{callHistory.length !== 1 ? "s" : ""} · Free trial and zero-duration calls are excluded
                </p>
              </div>
            )}
          </div>
        )}

        {/* ── ACCOUNT ── */}
        {activeSection === "account" && (
          <div style={{ maxWidth: "480px" }}>
            <div style={{ marginBottom: "1.5rem" }}>
              <h2 style={{ color: "#fff", fontSize: "1.1rem", fontWeight: 700, margin: "0 0 0.25rem" }}>Account Settings</h2>
              <p style={{ color: "#666", fontSize: "0.85rem", margin: 0 }}>Update your login credentials</p>
            </div>
            <div style={{ background: "#111", border: "1px solid #1e1e1e", borderRadius: "14px", padding: "1.75rem" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", marginBottom: "1.5rem" }}>
                <KeyRound size={16} color="#1d4ed8" />
                <p style={{ color: "#fff", fontSize: "0.95rem", fontWeight: 700, margin: 0 }}>Change Password</p>
              </div>
              {pwSuccess && (
                <div data-testid="alert-password-success" style={{ background: "#052e16", border: "1px solid #166534", borderRadius: "8px", padding: "0.75rem 1rem", marginBottom: "1.25rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <CheckCircle2 size={15} color="#4ade80" />
                  <span style={{ color: "#4ade80", fontSize: "0.82rem" }}>Password changed successfully.</span>
                </div>
              )}
              <form onSubmit={handleChangePassword} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                {[
                  { label: "Current Password", value: currentPassword, setter: setCurrentPassword, show: showCurrent, toggle: () => setShowCurrent(v => !v), testId: "input-current-password", autoComplete: "current-password" },
                  { label: "New Password", value: newPassword, setter: setNewPassword, show: showNew, toggle: () => setShowNew(v => !v), testId: "input-new-password", autoComplete: "new-password" },
                  { label: "Confirm New Password", value: confirmPassword, setter: setConfirmPassword, show: showConfirm, toggle: () => setShowConfirm(v => !v), testId: "input-confirm-password", autoComplete: "new-password" },
                ].map(({ label, value, setter, show, toggle, testId, autoComplete }) => (
                  <div key={testId}>
                    <label style={{ color: "#ccc", fontSize: "0.8rem", fontWeight: 600, display: "block", marginBottom: "0.4rem" }}>{label}</label>
                    <div style={{ position: "relative" }}>
                      <input
                        type={show ? "text" : "password"}
                        value={value}
                        onChange={e => setter(e.target.value)}
                        placeholder="••••••••"
                        required
                        autoComplete={autoComplete}
                        data-testid={testId}
                        style={{ width: "100%", background: "#1a1a1a", border: "1px solid #2a2a2a", borderRadius: "8px", color: "#fff", fontSize: "0.875rem", padding: "0.65rem 2.5rem 0.65rem 0.875rem", outline: "none", boxSizing: "border-box" }}
                        onFocus={e => (e.target.style.borderColor = "#1d4ed8")}
                        onBlur={e => (e.target.style.borderColor = "#2a2a2a")}
                      />
                      <button type="button" onClick={toggle} data-testid={`button-toggle-${testId}`}
                        style={{ position: "absolute", right: "0.75rem", top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "#555", padding: 0, display: "flex" }}>
                        {show ? <EyeOff size={15} /> : <Eye size={15} />}
                      </button>
                    </div>
                  </div>
                ))}
                <button type="submit" disabled={changePasswordMutation.isPending} data-testid="button-change-password"
                  style={{ background: "#1d4ed8", color: "#fff", border: "none", borderRadius: "8px", padding: "0.7rem", fontWeight: 700, fontSize: "0.875rem", cursor: changePasswordMutation.isPending ? "not-allowed" : "pointer", opacity: changePasswordMutation.isPending ? 0.7 : 1, display: "flex", alignItems: "center", justifyContent: "center", gap: "0.5rem", marginTop: "0.25rem" }}>
                  {changePasswordMutation.isPending && <Loader2 size={15} className="animate-spin" />}
                  Update Password
                </button>
              </form>
            </div>
            {/* ── Alternate Phone Numbers ── */}
            {me.linkedPhoneNumber && (
              <div style={{ background: "#111", border: "1px solid #1e1e1e", borderRadius: "14px", padding: "1.75rem", marginTop: "1rem" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", marginBottom: "1.25rem" }}>
                  <PhoneForwarded size={16} color="#1d4ed8" />
                  <p style={{ color: "#fff", fontSize: "0.95rem", fontWeight: 700, margin: 0 }}>Alternate Calling Numbers</p>
                </div>
                <p style={{ color: "#666", fontSize: "0.82rem", margin: "0 0 1.25rem", lineHeight: 1.5 }}>
                  Add up to 2 extra phone numbers that can call in and be recognized as your membership automatically.
                </p>

                {/* Primary number — always shown, read-only */}
                <div style={{ marginBottom: "0.75rem" }}>
                  <p style={{ color: "#555", fontSize: "0.7rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", margin: "0 0 0.5rem" }}>Primary Number</p>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", background: "#0d0d0d", border: "1px solid #1e1e1e", borderRadius: "8px", padding: "0.65rem 1rem" }}>
                    <Phone size={13} color="#22c55e" />
                    <span style={{ color: "#ccc", fontSize: "0.875rem", fontFamily: "monospace" }} data-testid="text-primary-phone">{formatPhone(me.linkedPhoneNumber)}</span>
                    <span style={{ marginLeft: "auto", color: "#22c55e", fontSize: "0.72rem", fontWeight: 600 }}>Primary</span>
                  </div>
                </div>

                {/* Existing alt phones */}
                {altPhonesLoading ? (
                  <div style={{ display: "flex", justifyContent: "center", padding: "0.75rem" }}>
                    <Loader2 size={18} color="#555" className="animate-spin" />
                  </div>
                ) : (
                  <div style={{ marginBottom: "1rem" }}>
                    {altPhones.length > 0 && (
                      <div style={{ marginBottom: "0.75rem" }}>
                        <p style={{ color: "#555", fontSize: "0.7rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", margin: "0 0 0.5rem" }}>Alternate Numbers</p>
                        {altPhones.map((ap, idx) => (
                          <div key={ap.id} data-testid={`row-alt-phone-${ap.id}`}
                            style={{ display: "flex", alignItems: "center", gap: "0.75rem", background: "#0d0d0d", border: "1px solid #1e1e1e", borderRadius: "8px", padding: "0.65rem 1rem", marginBottom: "0.5rem" }}>
                            <Phone size={13} color="#1d4ed8" />
                            <span style={{ color: "#ccc", fontSize: "0.875rem", fontFamily: "monospace" }} data-testid={`text-alt-phone-${ap.id}`}>{formatPhone(ap.phoneNumber)}</span>
                            <span style={{ color: "#555", fontSize: "0.72rem", marginLeft: "auto" }}>Alt {idx + 1}</span>
                            <button
                              onClick={() => removeAltPhoneMutation.mutate(ap.id)}
                              disabled={removeAltPhoneMutation.isPending}
                              data-testid={`button-remove-alt-phone-${ap.id}`}
                              title="Remove this number"
                              style={{ background: "none", border: "none", cursor: removeAltPhoneMutation.isPending ? "not-allowed" : "pointer", color: "#555", padding: 0, display: "flex", alignItems: "center" }}
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Add alt phone form — only if under the 2-number limit */}
                    {altPhones.length < 2 ? (
                      <div>
                        {altPhones.length === 0 && (
                          <p style={{ color: "#555", fontSize: "0.72rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", margin: "0.75rem 0 0.5rem" }}>Alternate Numbers</p>
                        )}
                        <form
                          onSubmit={(e) => { e.preventDefault(); if (altPhoneInput.trim()) addAltPhoneMutation.mutate(altPhoneInput.trim()); }}
                          style={{ display: "flex", gap: "0.5rem" }}
                        >
                          <input
                            type="tel"
                            value={altPhoneInput}
                            onChange={e => setAltPhoneInput(e.target.value)}
                            placeholder="Enter phone number"
                            data-testid="input-alt-phone"
                            style={{ flex: 1, background: "#1a1a1a", border: "1px solid #2a2a2a", borderRadius: "8px", color: "#fff", fontSize: "0.875rem", padding: "0.65rem 0.875rem", outline: "none" }}
                            onFocus={e => (e.target.style.borderColor = "#1d4ed8")}
                            onBlur={e => (e.target.style.borderColor = "#2a2a2a")}
                          />
                          <button
                            type="submit"
                            disabled={addAltPhoneMutation.isPending || !altPhoneInput.trim()}
                            data-testid="button-add-alt-phone"
                            style={{ background: "#1d4ed8", color: "#fff", border: "none", borderRadius: "8px", padding: "0.65rem 1rem", fontWeight: 700, fontSize: "0.85rem", cursor: addAltPhoneMutation.isPending || !altPhoneInput.trim() ? "not-allowed" : "pointer", opacity: addAltPhoneMutation.isPending || !altPhoneInput.trim() ? 0.6 : 1, display: "flex", alignItems: "center", gap: "0.4rem", whiteSpace: "nowrap" }}
                          >
                            {addAltPhoneMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                            Add Number
                          </button>
                        </form>
                      </div>
                    ) : (
                      <p style={{ color: "#555", fontSize: "0.8rem", margin: "0.25rem 0 0" }}>Maximum of 2 alternate numbers reached. Remove one to add another.</p>
                    )}
                  </div>
                )}
              </div>
            )}

            <div style={{ background: "#111", border: "1px solid #1e1e1e", borderRadius: "14px", padding: "1.25rem 1.5rem", marginTop: "1rem" }}>
              <p style={{ color: "#555", fontSize: "0.72rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", margin: "0 0 0.5rem" }}>Login Email</p>
              <p style={{ color: "#ccc", fontSize: "0.9rem", margin: 0 }} data-testid="text-account-email">{me.email}</p>
              <p style={{ color: "#555", fontSize: "0.75rem", margin: "0.4rem 0 0" }}>To change your email, contact support.</p>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <footer style={{ borderTop: "1px solid #141414", padding: "1.25rem 1.5rem", textAlign: "center" }}>
        <p style={{ color: "#444", fontSize: "0.75rem", margin: 0 }}>
          &copy; {new Date().getFullYear()} {siteName}
          {siteData?.customerServiceEmail && (
            <> · <a href={`mailto:${siteData.customerServiceEmail}`} style={{ color: "#555", textDecoration: "none" }}>{siteData.customerServiceEmail}</a></>
          )}
        </p>
      </footer>
    </div>
  );
}
