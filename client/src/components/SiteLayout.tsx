import { useState } from "react";
import { Phone, Menu, X } from "lucide-react";
import { Link } from "wouter";

export const DEFAULT_PHONE = "000-000-0000";
export const DEFAULT_SITE_NAME = "Phone Booth";

export interface SiteSettings {
  siteName: string;
  fallbackPhoneNumber: string;
  customerServiceEmail: string | null;
  customerServicePhone: string | null;
  siteCategory: string;
}

export function formatPhone(raw: string | null | undefined): string {
  if (!raw) return DEFAULT_PHONE;
  const d = raw.replace(/\D/g, "");
  if (d.length === 10) return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
  if (d.length === 11 && d[0] === "1") return `${d.slice(1, 4)}-${d.slice(4, 7)}-${d.slice(7)}`;
  return raw;
}

interface FooterLink { label: string; href: string }

export function SiteNav({ siteName, onMenuToggle, mobileOpen }: {
  siteName: string;
  onMenuToggle: () => void;
  mobileOpen: boolean;
}) {
  return (
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

        <button className="md:hidden" onClick={onMenuToggle}
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
  );
}

export function SiteFooter({ siteName, footerBlurb, csPhone, csEmail }: {
  siteName: string;
  footerBlurb: string;
  csPhone: string | null;
  csEmail: string | null;
}) {
  const cols: { heading: string; links: FooterLink[] }[] = [
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
  ];

  return (
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
          {cols.map(col => (
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
  );
}

export function PageHeader({ eyebrow, title, subtitle, cta }: {
  eyebrow: string;
  title: string;
  subtitle?: string;
  cta?: React.ReactNode;
}) {
  return (
    <section style={{ background: "#111", borderBottom: "1px solid #1a1a1a", padding: "3.5rem 1.5rem 3rem" }}>
      <div style={{ maxWidth: "760px", margin: "0 auto" }}>
        <p style={{ fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", color: "#3b82f6", marginBottom: "0.75rem" }}>
          {eyebrow}
        </p>
        <h1 style={{ fontSize: "clamp(1.8rem, 4vw, 2.8rem)", fontWeight: 900, letterSpacing: "-0.02em", lineHeight: 1.1, marginBottom: subtitle ? "1rem" : 0, color: "#fff" }}>
          {title}
        </h1>
        {subtitle && (
          <p style={{ fontSize: "1rem", color: "rgba(255,255,255,0.55)", lineHeight: 1.7, marginBottom: cta ? "1.75rem" : 0 }}>
            {subtitle}
          </p>
        )}
        {cta}
      </div>
    </section>
  );
}
