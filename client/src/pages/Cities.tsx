import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Phone, Radio } from "lucide-react";
import { SiteNav, SiteFooter, PageHeader, SiteSettings, formatPhone, DEFAULT_SITE_NAME, DEFAULT_PHONE } from "@/components/SiteLayout";

interface Region {
  id: string;
  name: string;
  slug: string;
  phoneNumber: string;
  description: string | null;
  isActive: boolean;
  activeCalls?: number;
}

export default function Cities() {
  const [mobileOpen, setMobileOpen] = useState(false);

  const { data: siteData } = useQuery<SiteSettings>({
    queryKey: ["/api/site-settings"],
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  const { data: regions, isLoading: regionsLoading } = useQuery<Region[]>({
    queryKey: ["/api/regions"],
    staleTime: 2 * 60 * 1000,
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

  const activeRegions = regions?.filter(r => r.isActive) ?? [];
  const totalActive = activeRegions.reduce((sum, r) => sum + (r.activeCalls ?? 0), 0);

  return (
    <div style={{ fontFamily: "'Inter', system-ui, sans-serif", background: "#0d0d0d", color: "#fff", minHeight: "100vh" }}>
      <SiteNav siteName={siteName} onMenuToggle={() => setMobileOpen(v => !v)} mobileOpen={mobileOpen} />

      <PageHeader
        eyebrow="Coverage"
        title="Cities & Local Numbers"
        subtitle={`${siteName} serves callers across the country with local access numbers. Dial your nearest number for the best experience.`}
      />

      <section style={{ padding: "3.5rem 1.5rem 5rem" }}>
        <div style={{ maxWidth: "760px", margin: "0 auto" }}>

          {/* Live count bar */}
          {totalActive > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: "0.65rem", background: "rgba(22,163,74,0.1)", border: "1px solid rgba(22,163,74,0.25)", borderRadius: "8px", padding: "0.75rem 1.1rem", marginBottom: "2rem" }}
              data-testid="cities-live-bar">
              <Radio className="w-4 h-4 text-green-400 flex-shrink-0" />
              <p style={{ fontSize: "0.85rem", color: "rgba(255,255,255,0.7)", margin: 0 }}>
                <strong style={{ color: "#4ade80" }}>{totalActive} {totalActive === 1 ? "caller" : "callers"}</strong> live on the line right now across all areas.
              </p>
            </div>
          )}

          {/* Regions list */}
          {regionsLoading ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              {[1, 2, 3, 4].map(i => (
                <div key={i} style={{ height: 80, background: "#111", borderRadius: "10px", border: "1px solid #1e1e1e", animation: "pulse 2s infinite" }} />
              ))}
            </div>
          ) : activeRegions.length > 0 ? (
            <>
              <h2 style={{ fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", color: "#3b82f6", marginBottom: "1.25rem" }}>
                Active Markets — {activeRegions.length} {activeRegions.length === 1 ? "area" : "areas"}
              </h2>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: "0.75rem", marginBottom: "3rem" }}>
                {activeRegions.map(r => (
                  <div key={r.id}
                    style={{ background: "#111", border: "1px solid #1e1e1e", borderRadius: "10px", padding: "1.1rem 1.25rem", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem" }}
                    data-testid={`city-card-${r.slug}`}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.25rem" }}>
                        <p style={{ fontSize: "0.95rem", fontWeight: 700, color: "#fff", margin: 0, truncate: "true", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {r.name}
                        </p>
                        {(r.activeCalls ?? 0) > 0 && (
                          <span style={{ fontSize: "0.65rem", fontWeight: 700, background: "rgba(22,163,74,0.15)", color: "#4ade80", border: "1px solid rgba(22,163,74,0.3)", borderRadius: "4px", padding: "0.1rem 0.4rem", flexShrink: 0 }}>
                            LIVE
                          </span>
                        )}
                      </div>
                      {r.description && (
                        <p style={{ fontSize: "0.78rem", color: "rgba(255,255,255,0.4)", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {r.description}
                        </p>
                      )}
                    </div>
                    <a href={"tel:" + r.phoneNumber.replace(/\D/g, "")}
                      style={{ display: "flex", alignItems: "center", gap: "0.4rem", background: "#1a1a1a", border: "1px solid #2a2a2a", borderRadius: "7px", padding: "0.45rem 0.9rem", textDecoration: "none", flexShrink: 0, transition: "border-color 0.15s" }}
                      onMouseEnter={e => (e.currentTarget.style.borderColor = "#3b82f6")}
                      onMouseLeave={e => (e.currentTarget.style.borderColor = "#2a2a2a")}
                      data-testid={`city-dial-${r.slug}`}>
                      <Phone className="w-3.5 h-3.5 text-blue-400" />
                      <span style={{ fontSize: "0.82rem", fontWeight: 600, color: "#60a5fa" }}>{formatPhone(r.phoneNumber)}</span>
                    </a>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div style={{ textAlign: "center", padding: "3rem 0", color: "rgba(255,255,255,0.3)", fontSize: "0.9rem" }}>
              No regional numbers configured yet.
            </div>
          )}

          {/* Fallback number callout */}
          <div style={{ background: "#111", border: "1px solid #1e1e1e", borderRadius: "12px", padding: "1.75rem", textAlign: "center" }}>
            <p style={{ fontSize: "0.78rem", color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600, marginBottom: "0.5rem" }}>
              National Access Number
            </p>
            <p style={{ fontSize: "0.9rem", color: "rgba(255,255,255,0.55)", lineHeight: 1.65, marginBottom: "1.25rem" }}>
              Don't see your city? Use our national access number — you'll still be connected to {isMM ? "guys" : "callers"} in your area.
            </p>
            <a href={"tel:" + phone.replace(/\D/g, "")}
              style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem", background: "#1d4ed8", color: "#fff", textDecoration: "none", fontSize: "1rem", fontWeight: 800, padding: "0.65rem 1.5rem", borderRadius: "8px" }}
              data-testid="cities-fallback-dial">
              <Phone className="w-4 h-4" /> {formatPhone(phone)}
            </a>
          </div>
        </div>
      </section>

      <SiteFooter siteName={siteName} footerBlurb={footerBlurb} csPhone={csPhone} csEmail={csEmail} />
    </div>
  );
}
