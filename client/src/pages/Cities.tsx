import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Phone } from "lucide-react";
import { SiteNav, SiteFooter, PageHeader, SiteSettings, formatPhone, DEFAULT_SITE_NAME, DEFAULT_PHONE } from "@/components/SiteLayout";

interface Region {
  id: string;
  name: string;
  slug: string;
  stateAbbreviation: string | null;
  phoneNumber: string;
  description: string | null;
  isActive: boolean;
  activeCalls?: number;
}

const STATE_NAMES: Record<string, string> = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California",
  CO: "Colorado", CT: "Connecticut", DE: "Delaware", FL: "Florida", GA: "Georgia",
  HI: "Hawaii", ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa",
  KS: "Kansas", KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland",
  MA: "Massachusetts", MI: "Michigan", MN: "Minnesota", MS: "Mississippi",
  MO: "Missouri", MT: "Montana", NE: "Nebraska", NV: "Nevada", NH: "New Hampshire",
  NJ: "New Jersey", NM: "New Mexico", NY: "New York", NC: "North Carolina",
  ND: "North Dakota", OH: "Ohio", OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania",
  RI: "Rhode Island", SC: "South Carolina", SD: "South Dakota", TN: "Tennessee",
  TX: "Texas", UT: "Utah", VT: "Vermont", VA: "Virginia", WA: "Washington",
  WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming", DC: "Washington D.C.",
};

function getStateLabel(abbr: string | null): string {
  if (!abbr) return "Other";
  return STATE_NAMES[abbr.toUpperCase()] ?? abbr;
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

  // Determine unique states to pick the layout
  const uniqueStates = new Set(activeRegions.map(r => r.stateAbbreviation ?? "__none__"));
  const stateCount = Array.from(uniqueStates).filter(s => s !== "__none__").length;

  // Layout modes:
  //   "single"  → 1 state (or all no-state): current card grid
  //   "grouped" → 2–4 states: cards grouped under state headings
  //   "dense"   → 5+ states: compact multi-column list, white-bg section
  const layoutMode: "single" | "grouped" | "dense" =
    stateCount >= 5 ? "dense" :
    stateCount >= 2 ? "grouped" :
    "single";

  // Group regions by state for grouped/dense layouts
  const byState = activeRegions.reduce<Record<string, Region[]>>((acc, r) => {
    const key = r.stateAbbreviation ?? "__none__";
    if (!acc[key]) acc[key] = [];
    acc[key].push(r);
    return acc;
  }, {});

  // Sort state keys alphabetically (no-state bucket goes last)
  const sortedStateKeys = Object.keys(byState).sort((a, b) => {
    if (a === "__none__") return 1;
    if (b === "__none__") return -1;
    return getStateLabel(a).localeCompare(getStateLabel(b));
  });

  return (
    <div style={{ fontFamily: "'Inter', system-ui, sans-serif", background: "#0d0d0d", color: "#fff", minHeight: "100vh" }}>
      <SiteNav siteName={siteName} onMenuToggle={() => setMobileOpen(v => !v)} mobileOpen={mobileOpen} />

      <PageHeader
        eyebrow="Coverage"
        title="Cities & Local Numbers"
        subtitle={`${siteName} serves callers across the country with local access numbers. Dial your nearest number for the best experience.`}
      />

      {/* ── Dense layout (5+ states) ─────────────────────────────────────────── */}
      {layoutMode === "dense" && (
        <section style={{ padding: "3.5rem 1.5rem 5rem" }}>
          <div style={{ maxWidth: "1100px", margin: "0 auto" }}>
            {regionsLoading ? (
              <SkeletonGrid />
            ) : activeRegions.length > 0 ? (
              <div style={{ background: "#fff", borderRadius: "12px", padding: "2.5rem 2rem 3rem" }}>
                <h2 style={{ fontSize: "1.6rem", fontWeight: 700, color: "#111", marginBottom: "0.6rem" }}>
                  Your local {siteName} phone numbers
                </h2>
                <p style={{ fontSize: "1rem", color: "#444", marginBottom: "2rem" }}>
                  {siteName} is available in the following cities:
                </p>
                {/* 4-column grid, alphabetical per state group */}
                {sortedStateKeys.map(stateKey => (
                  <div key={stateKey} style={{ marginBottom: "2rem" }}>
                    {sortedStateKeys.length > 1 && (
                      <h3 style={{ fontSize: "1rem", fontWeight: 700, color: "#111", borderBottom: "2px solid #e5e7eb", paddingBottom: "0.35rem", marginBottom: "0.75rem" }}>
                        {stateKey === "__none__" ? "Other" : getStateLabel(stateKey)}
                      </h3>
                    )}
                    <div style={{ columns: "4 180px", columnGap: "1.5rem" }}>
                      {byState[stateKey]
                        .slice()
                        .sort((a, b) => a.name.localeCompare(b.name))
                        .map(r => (
                          <p key={r.id} style={{ margin: "0 0 0.35rem 0", breakInside: "avoid", fontSize: "0.88rem", color: "#111" }}>
                            <strong>{r.name}:</strong>{" "}
                            <a
                              href={"tel:" + r.phoneNumber.replace(/\D/g, "")}
                              style={{ color: "#1d4ed8", textDecoration: "underline" }}
                              data-testid={`city-dial-${r.slug}`}
                            >
                              {formatPhone(r.phoneNumber)}
                            </a>
                          </p>
                        ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState />
            )}

            <FallbackCallout phone={phone} isMM={isMM} />
          </div>
        </section>
      )}

      {/* ── Single-state layout (≤1 state): original card grid ──────────────── */}
      {layoutMode === "single" && (
        <section style={{ padding: "3.5rem 1.5rem 5rem" }}>
          <div style={{ maxWidth: "760px", margin: "0 auto" }}>
            {regionsLoading ? (
              <SkeletonGrid />
            ) : activeRegions.length > 0 ? (
              <>
                <h2 style={{ fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", color: "#3b82f6", marginBottom: "1.25rem" }}>
                  Active Markets — {activeRegions.length} {activeRegions.length === 1 ? "area" : "areas"}
                </h2>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: "0.75rem", marginBottom: "3rem" }}>
                  {activeRegions.map(r => (
                    <CityCard key={r.id} region={r} />
                  ))}
                </div>
              </>
            ) : (
              <EmptyState />
            )}
            <FallbackCallout phone={phone} isMM={isMM} />
          </div>
        </section>
      )}

      {/* ── Grouped layout (2–4 states): cards grouped under state headings ──── */}
      {layoutMode === "grouped" && (
        <section style={{ padding: "3.5rem 1.5rem 5rem" }}>
          <div style={{ maxWidth: "900px", margin: "0 auto" }}>
            {regionsLoading ? (
              <SkeletonGrid />
            ) : activeRegions.length > 0 ? (
              <>
                {sortedStateKeys.map(stateKey => (
                  <div key={stateKey} style={{ marginBottom: "3rem" }}>
                    <h2 style={{ fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", color: "#3b82f6", marginBottom: "1.1rem" }}>
                      {stateKey === "__none__" ? "Other" : getStateLabel(stateKey)}
                    </h2>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: "0.75rem" }}>
                      {byState[stateKey]
                        .slice()
                        .sort((a, b) => a.name.localeCompare(b.name))
                        .map(r => (
                          <CityCard key={r.id} region={r} />
                        ))}
                    </div>
                  </div>
                ))}
                <div style={{ marginBottom: "3rem" }} />
              </>
            ) : (
              <EmptyState />
            )}
            <FallbackCallout phone={phone} isMM={isMM} />
          </div>
        </section>
      )}

      <SiteFooter siteName={siteName} footerBlurb={footerBlurb} csPhone={csPhone} csEmail={csEmail} />
    </div>
  );
}

// ── Shared sub-components ────────────────────────────────────────────────────

function CityCard({ region: r }: { region: Region }) {
  return (
    <div
      style={{ background: "#111", border: "1px solid #1e1e1e", borderRadius: "10px", padding: "1.1rem 1.25rem", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem" }}
      data-testid={`city-card-${r.slug}`}
    >
      <div style={{ minWidth: 0 }}>
        <p style={{ fontSize: "0.95rem", fontWeight: 700, color: "#fff", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {r.name}
        </p>
        {r.description && (
          <p style={{ fontSize: "0.78rem", color: "rgba(255,255,255,0.4)", margin: "0.2rem 0 0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {r.description}
          </p>
        )}
      </div>
      <a
        href={"tel:" + r.phoneNumber.replace(/\D/g, "")}
        style={{ display: "flex", alignItems: "center", gap: "0.4rem", background: "#1a1a1a", border: "1px solid #2a2a2a", borderRadius: "7px", padding: "0.45rem 0.9rem", textDecoration: "none", flexShrink: 0, transition: "border-color 0.15s" }}
        onMouseEnter={e => (e.currentTarget.style.borderColor = "#3b82f6")}
        onMouseLeave={e => (e.currentTarget.style.borderColor = "#2a2a2a")}
        data-testid={`city-dial-${r.slug}`}
      >
        <Phone className="w-3.5 h-3.5 text-blue-400" />
        <span style={{ fontSize: "0.82rem", fontWeight: 600, color: "#60a5fa" }}>{formatPhone(r.phoneNumber)}</span>
      </a>
    </div>
  );
}

function FallbackCallout({ phone, isMM }: { phone: string; isMM: boolean }) {
  return (
    <div style={{ background: "#111", border: "1px solid #1e1e1e", borderRadius: "12px", padding: "1.75rem", textAlign: "center", marginTop: "2rem" }}>
      <p style={{ fontSize: "0.78rem", color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600, marginBottom: "0.5rem" }}>
        National Access Number
      </p>
      <p style={{ fontSize: "0.9rem", color: "rgba(255,255,255,0.55)", lineHeight: 1.65, marginBottom: "1.25rem" }}>
        Don't see your city? Use our national access number — you'll still be connected to {isMM ? "guys" : "callers"} in your area.
      </p>
      <a
        href={"tel:" + phone.replace(/\D/g, "")}
        style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem", background: "#1d4ed8", color: "#fff", textDecoration: "none", fontSize: "1rem", fontWeight: 800, padding: "0.65rem 1.5rem", borderRadius: "8px" }}
        data-testid="cities-fallback-dial"
      >
        <Phone className="w-4 h-4" /> {formatPhone(phone)}
      </a>
    </div>
  );
}

function EmptyState() {
  return (
    <div style={{ textAlign: "center", padding: "3rem 0", color: "rgba(255,255,255,0.3)", fontSize: "0.9rem" }}>
      No regional numbers configured yet.
    </div>
  );
}

function SkeletonGrid() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
      {[1, 2, 3, 4].map(i => (
        <div key={i} style={{ height: 80, background: "#111", borderRadius: "10px", border: "1px solid #1e1e1e", animation: "pulse 2s infinite" }} />
      ))}
    </div>
  );
}
