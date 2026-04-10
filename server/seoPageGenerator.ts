import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import type { Region, SiteSettings } from "@shared/schema";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const REGIONS_DIR = path.join(__dirname, "../client/public/regions");

function ensureDir() {
  if (!fs.existsSync(REGIONS_DIR)) fs.mkdirSync(REGIONS_DIR, { recursive: true });
}

// ── US State name lookup ───────────────────────────────────────────────────

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

function getStateName(abbr: string | null | undefined): string {
  if (!abbr) return "";
  return STATE_NAMES[abbr.toUpperCase()] ?? abbr;
}

function formatPhone(raw: string | null | undefined): string {
  if (!raw) return "";
  const d = raw.replace(/\D/g, "");
  if (d.length === 10) return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
  if (d.length === 11 && d[0] === "1") return `${d.slice(1, 4)}-${d.slice(4, 7)}-${d.slice(7)}`;
  return raw;
}

// ── Content config (MM vs MW) ──────────────────────────────────────────────

interface ContentConfig {
  pronoun: string;         // "guys" or "men and women"
  audienceDesc: string;    // short audience description
  metaDesc: (city: string, state: string, phone: string, siteName: string) => string;
  h1: (city: string, stateCode: string, siteName: string) => string;
  tagline: (city: string, siteName: string) => string;
  features: string[];
  h2s: Array<{ heading: string; body: (city: string, state: string, siteName: string) => string }>;
  faqs: Array<{ q: (city: string) => string; a: (city: string, siteName: string) => string }>;
  ctaText: string;
}

function getContentConfig(siteCategory: string): ContentConfig {
  const isMM = siteCategory !== "MW";

  if (isMM) {
    return {
      pronoun: "guys",
      audienceDesc: "men seeking men",
      metaDesc: (city, state, phone, siteName) =>
        `Connect with real local guys near ${city}, ${state} right now on ${siteName}. Call the free chat line and meet men in your area — no credit card required. ${phone ? `Your local number: ${phone}.` : ""}`,
      h1: (city, stateCode, siteName) =>
        `${siteName} in ${city}, ${stateCode} — Talk to Real Local Guys`,
      tagline: (city, siteName) =>
        `${siteName} connects men with men in ${city} and surrounding areas. Real guys, live chat, anytime.`,
      features: [
        "Free minutes to get started — no credit card required",
        "Real local callers in your area, live right now",
        "Private, anonymous phone chat — your number is never shared",
        "Record a personal greeting to introduce yourself",
        "Listen to greetings from guys nearby before connecting",
        "Exchange voice messages anytime, day or night",
        "Simple membership plans with no hidden fees",
        "Available 24/7 — someone is always on the line",
      ],
      h2s: [
        {
          heading: (city: string, _s: string, siteName: string) => `Meet Real Local Guys in ${city} on ${siteName}`,
          body: (city, state, siteName) =>
            `${siteName} is the go-to phone chat line for men seeking men in ${city}, ${state}. Whether you're looking for conversation, friendship, or something more — real guys in your area are on the line right now. Pick up the phone, record your greeting, and start connecting instantly.`,
        },
        {
          heading: (_c: string, _s: string, _n: string) => "How the Chat Line Works",
          body: (city, _state, siteName) =>
            `Getting started on ${siteName} is simple. Call your local ${city} access number and you'll be guided through recording a short personal greeting. From there, you can browse greetings from other guys nearby, send voice messages, or connect live. There's no app to download, no profile to fill out — just pick up the phone.`,
        },
        {
          heading: (city: string, _s: string, siteName: string) => `Your Privacy Is Protected on ${siteName}`,
          body: (_city, _state, siteName) =>
            `${siteName} is 100% anonymous. Your phone number is never shared with other callers. You choose your own screen name when you call, and you're in complete control of who you talk to and when. Block anyone with a single keystroke and move on — your experience is always in your hands.`,
        },
        {
          heading: (city: string, state: string, _n: string) => `${city}, ${state} Is on the Line Right Now`,
          body: (city, state, siteName) =>
            `${siteName} has an active community of callers across ${state}, with guys in ${city} and the surrounding area connecting every day. Whether it's early morning or late at night, there are real men on the line. Jump in, leave a message, or go live — it's your call.`,
        },
      ],
      faqs: [
        {
          q: (city) => `Is the chat line really free in ${city}?`,
          a: (_city, siteName) =>
            `Yes — ${siteName} gives all new callers free minutes to get started. You can record your greeting, browse local guys' messages, and even connect live before spending a dime. After your free minutes, affordable membership plans keep you connected.`,
        },
        {
          q: (_city) => "Do I need to download an app?",
          a: (_city, siteName) =>
            `No app required. ${siteName} is a phone-based chat line — all you need is your phone. Just call your local access number and you're in. It works on any phone, smartphone or landline.`,
        },
        {
          q: (city) => `Will other callers see my phone number in ${city}?`,
          a: (_city, siteName) =>
            `Never. ${siteName} keeps your personal phone number completely private. Other callers only see the screen name you choose when you set up your profile. You are in control of your anonymity at all times.`,
        },
        {
          q: (_city) => "What happens after my free trial minutes run out?",
          a: (_city, siteName) =>
            `Once your free trial minutes are used, you can choose a membership plan that fits your budget. Plans are flexible and affordable — check the website for current rates. There are no hidden fees and no long-term contracts.`,
        },
        {
          q: (city) => `How do I meet guys near ${city} specifically?`,
          a: (city, siteName) =>
            `When you call your ${city} access number, you're automatically placed into the local community for your area. The greetings you hear and the messages you receive are from guys in and around ${city}. ${siteName} routes callers by their local access number to keep the community local and relevant.`,
        },
      ],
      ctaText: "Call Free Now",
    };
  } else {
    return {
      pronoun: "singles",
      audienceDesc: "men and women",
      metaDesc: (city, state, phone, siteName) =>
        `Meet real local singles near ${city}, ${state} on ${siteName}. Call the free chat line and connect with men and women in your area — no credit card needed. ${phone ? `Your local number: ${phone}.` : ""}`,
      h1: (city, stateCode, siteName) =>
        `${siteName} in ${city}, ${stateCode} — Talk to Real Local Singles`,
      tagline: (city, siteName) =>
        `${siteName} connects singles in ${city} and surrounding areas. Real people, live conversation, any time.`,
      features: [
        "Free minutes to get started — no credit card required",
        "Real local singles in your area, live right now",
        "Private, anonymous phone chat — your number is never shared",
        "Record a personal greeting to introduce yourself",
        "Browse greetings from men and women nearby",
        "Exchange voice messages anytime, day or night",
        "Simple membership plans with no hidden fees",
        "Available 24/7 — someone is always on the line",
      ],
      h2s: [
        {
          heading: (city: string, _s: string, siteName: string) => `Meet Real Local Singles in ${city} on ${siteName}`,
          body: (city, state, siteName) =>
            `${siteName} is the live phone chat line for singles in ${city}, ${state}. Men and women who are looking to connect — for conversation, dates, or something more — are on the line right now. Call your local number, record your greeting, and start meeting people in your area instantly.`,
        },
        {
          heading: (_c: string, _s: string, _n: string) => "How the Chat Line Works",
          body: (city, _state, siteName) =>
            `Starting a conversation on ${siteName} is easy. Call your local ${city} number and you'll be guided to record a short greeting. Then browse greetings from local singles, send voice messages, or go live with someone who catches your attention. No app needed, no profile forms — just pick up the phone and connect.`,
        },
        {
          heading: (_c: string, _s: string, siteName: string) => `100% Private and Anonymous`,
          body: (_city, _state, siteName) =>
            `Your phone number is never shared on ${siteName}. You pick your own screen name, and you decide who you talk to and when. Block anyone instantly and move on. Your privacy is protected every step of the way.`,
        },
        {
          heading: (city: string, state: string, _n: string) => `${city}, ${state} Singles Are Waiting`,
          body: (city, state, siteName) =>
            `${siteName} has an active community of callers across ${state}. There are real singles in ${city} and the surrounding area connecting every single day. Morning or midnight, someone is on the line. Pick up, leave a message, or connect live — there's always someone waiting.`,
        },
      ],
      faqs: [
        {
          q: (city) => `Is the chat line free to try in ${city}?`,
          a: (_city, siteName) =>
            `Yes — ${siteName} offers free trial minutes for all new callers. You can browse local greetings, leave messages, and even connect live before paying anything. Affordable membership plans are available after your trial.`,
        },
        {
          q: (_city) => "Do I need a smartphone or app?",
          a: (_city, siteName) =>
            `No app needed. ${siteName} works on any phone — smartphone, basic cell phone, or landline. Just call your local access number and you're connected instantly.`,
        },
        {
          q: (city) => `Is my phone number private when I call the ${city} line?`,
          a: (_city, siteName) =>
            `Absolutely. ${siteName} never shares your personal phone number with other callers. You're identified only by the screen name you choose — full anonymity is built in.`,
        },
        {
          q: (_city) => "What happens when my free minutes run out?",
          a: (_city, siteName) =>
            `You can choose a membership plan to keep chatting. Plans are flexible and there are no contracts. Visit the website to see current pricing and find the plan that works for you.`,
        },
        {
          q: (city) => `How does ${siteName} match me with local singles near ${city}?`,
          a: (city, siteName) =>
            `When you dial the ${city} local access number, you're placed directly into the ${city}-area community. The greetings you hear and messages you receive are from singles in your local area — ${siteName} uses local access numbers to keep the community geographically relevant.`,
        },
      ],
      ctaText: "Call Free Now",
    };
  }
}

// ── Main generator ─────────────────────────────────────────────────────────

export function generateRegionPage(
  region: Region,
  siteSettings: SiteSettings,
  linkedRegions: Region[] = [],
  siteUrl = "https://example.com",
  allRegions: Region[] = [],
): string {
  const cfg = getContentConfig(siteSettings.siteCategory);
  const city = region.name;
  const stateCode = region.stateAbbreviation ?? "";
  const stateName = getStateName(stateCode);
  const phone = formatPhone(region.phoneNumber);
  const phoneRaw = region.phoneNumber?.replace(/\D/g, "") ?? "";
  const siteName = siteSettings.siteName;
  const color = "#2563EB";
  const colorLight = "#3B82F6";

  const pageUrl = `${siteUrl}/regions/${region.slug}.html`;
  const metaTitle = `${siteName} in ${city}, ${stateCode} | Local Chat Line | Free Trial`;
  const metaDesc = cfg.metaDesc(city, stateName || stateCode, phone, siteName);
  const h1Text = cfg.h1(city, stateCode, siteName);
  const keywords = [
    `${siteName.toLowerCase()} ${city.toLowerCase()}`,
    `chat line ${city.toLowerCase()} ${stateCode.toLowerCase()}`,
    `phone chat ${city.toLowerCase()}`,
    `local chat line ${city.toLowerCase()} ${stateCode.toLowerCase()}`,
    `free trial chat line ${city.toLowerCase()}`,
    `meet ${cfg.pronoun} ${city.toLowerCase()} ${stateCode.toLowerCase()}`,
    `${city.toLowerCase()} phone chat`,
    `${city.toLowerCase()} ${stateCode.toLowerCase()} chat line`,
  ].join(", ");

  // JSON-LD structured data
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    "name": `${siteName} — ${city}, ${stateCode}`,
    "description": metaDesc,
    "url": pageUrl,
    "telephone": phoneRaw ? `+1${phoneRaw}` : undefined,
    "address": {
      "@type": "PostalAddress",
      "addressLocality": city,
      "addressRegion": stateCode,
      "addressCountry": "US",
    },
    "areaServed": {
      "@type": "City",
      "name": city,
    },
    "hasOfferCatalog": {
      "@type": "OfferCatalog",
      "name": `${siteName} Chat Line Services`,
      "itemListElement": cfg.features.map((f, i) => ({
        "@type": "Offer",
        "position": i + 1,
        "name": f,
      })),
    },
  };

  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": cfg.faqs.map(faq => ({
      "@type": "Question",
      "name": faq.q(city),
      "acceptedAnswer": {
        "@type": "Answer",
        "text": faq.a(city, siteName),
      },
    })),
  };

  // Nearby cities from linked regions
  const nearbyCities = linkedRegions
    .filter(r => r.isActive)
    .map(r => ({ name: r.name, stateCode: r.stateAbbreviation ?? stateCode, slug: r.slug }));

  // Sitemap — all active generated pages
  const allActiveRegions = allRegions.filter(r => r.isActive);
  const sitemapLinks = allActiveRegions
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(r => {
      const isCurrent = r.slug === region.slug;
      const label = `${r.name}${r.stateAbbreviation ? ", " + r.stateAbbreviation : ""}`;
      if (isCurrent) {
        return `<span class="sitemap-link current">${label} (this page)</span>`;
      }
      return `<a href="/regions/${r.slug}.html" class="sitemap-link">${label}</a>`;
    })
    .join("\n        ");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escHtml(metaTitle)}</title>
  <meta name="description" content="${escAttr(metaDesc)}" />
  <meta name="keywords" content="${escAttr(keywords)}" />
  <link rel="canonical" href="${escAttr(pageUrl)}" />
  <meta name="robots" content="index, follow" />

  <!-- Open Graph -->
  <meta property="og:type" content="website" />
  <meta property="og:url" content="${escAttr(pageUrl)}" />
  <meta property="og:title" content="${escAttr(metaTitle)}" />
  <meta property="og:description" content="${escAttr(metaDesc)}" />
  <meta property="og:site_name" content="${escAttr(siteName)}" />

  <!-- Twitter Card -->
  <meta name="twitter:card" content="summary" />
  <meta name="twitter:title" content="${escAttr(metaTitle)}" />
  <meta name="twitter:description" content="${escAttr(metaDesc)}" />

  <!-- Structured Data -->
  <script type="application/ld+json">${JSON.stringify(jsonLd)}</script>
  <script type="application/ld+json">${JSON.stringify(faqJsonLd)}</script>

  <!-- Fonts -->
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet" />

  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    html { scroll-behavior: smooth; }
    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
      background: #0a0a0a;
      color: #f0f0f0;
      line-height: 1.6;
    }
    a { color: inherit; text-decoration: none; }
    img { max-width: 100%; display: block; }

    /* Nav */
    .nav {
      position: sticky; top: 0; z-index: 100;
      background: rgba(10,10,10,0.95); backdrop-filter: blur(12px);
      border-bottom: 1px solid rgba(255,255,255,0.07);
      padding: 0 24px; height: 60px;
      display: flex; align-items: center;
    }
    .nav-inner {
      max-width: 1100px; width: 100%; margin: 0 auto;
      display: flex; align-items: center; justify-content: space-between;
    }
    .nav-logo { font-size: 1.15rem; font-weight: 900; letter-spacing: -0.02em; color: #fff; }
    .nav-cta {
      background: ${color}; color: #fff;
      font-size: 0.875rem; font-weight: 700;
      padding: 8px 20px; border-radius: 8px;
      transition: background 0.2s;
    }
    .nav-cta:hover { background: ${colorLight}; }

    /* Hero */
    .hero {
      background: linear-gradient(160deg, #0f0f1a 0%, #0a0a0a 60%);
      border-bottom: 1px solid rgba(255,255,255,0.06);
      padding: 72px 24px 64px;
      text-align: center;
    }
    .hero-eyebrow {
      display: inline-block;
      font-size: 0.75rem; font-weight: 700; letter-spacing: 0.16em;
      text-transform: uppercase; color: ${colorLight};
      background: ${color}18; border: 1px solid ${color}30;
      padding: 4px 14px; border-radius: 50px;
      margin-bottom: 22px;
    }
    .hero h1 {
      font-size: clamp(2rem, 5.5vw, 3.4rem);
      font-weight: 900; line-height: 1.1; letter-spacing: -0.02em;
      max-width: 820px; margin: 0 auto 18px; color: #fff;
    }
    .hero h1 .accent { color: ${colorLight}; }
    .hero-sub {
      font-size: 1.1rem; color: rgba(255,255,255,0.5);
      max-width: 560px; margin: 0 auto 36px;
    }
    .hero-phone-box {
      display: inline-flex; align-items: center; gap: 10px;
      background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1);
      padding: 14px 28px; border-radius: 12px;
      font-size: 1.3rem; font-weight: 800; margin-bottom: 28px;
      letter-spacing: 0.02em;
    }
    .hero-phone-box a { color: ${colorLight}; }
    .hero-phone-box a:hover { text-decoration: underline; }
    .hero-ctas { display: flex; gap: 12px; justify-content: center; flex-wrap: wrap; }
    .btn-primary {
      display: inline-flex; align-items: center; gap: 6px;
      background: ${color}; color: #fff;
      font-weight: 700; font-size: 1rem;
      padding: 14px 32px; border-radius: 10px;
      transition: background 0.2s, transform 0.15s;
    }
    .btn-primary:hover { background: ${colorLight}; transform: translateY(-1px); }
    .btn-secondary {
      display: inline-flex; align-items: center;
      background: rgba(255,255,255,0.07); color: rgba(255,255,255,0.8);
      font-weight: 600; font-size: 1rem;
      padding: 14px 32px; border-radius: 10px;
      border: 1px solid rgba(255,255,255,0.1);
      transition: background 0.2s;
    }
    .btn-secondary:hover { background: rgba(255,255,255,0.12); }

    /* Stats bar */
    .stats-bar {
      display: flex; justify-content: center; gap: 0; flex-wrap: wrap;
      border-top: 1px solid rgba(255,255,255,0.05);
      border-bottom: 1px solid rgba(255,255,255,0.05);
      background: rgba(255,255,255,0.02);
    }
    .stat-item {
      padding: 20px 32px; text-align: center;
      border-right: 1px solid rgba(255,255,255,0.05);
    }
    .stat-item:last-child { border-right: none; }
    .stat-value { font-size: 1.4rem; font-weight: 900; color: ${colorLight}; display: block; }
    .stat-label { font-size: 0.78rem; color: rgba(255,255,255,0.35); font-weight: 500; margin-top: 2px; }

    /* Features */
    .section { max-width: 1100px; margin: 0 auto; padding: 72px 24px; }
    .section-label {
      font-size: 0.75rem; font-weight: 700; letter-spacing: 0.15em;
      text-transform: uppercase; color: ${colorLight}; margin-bottom: 10px;
    }
    .section h2 {
      font-size: clamp(1.5rem, 3.5vw, 2.2rem);
      font-weight: 800; letter-spacing: -0.02em; margin-bottom: 16px; color: #fff;
    }
    .section > p { color: rgba(255,255,255,0.5); font-size: 1.05rem; max-width: 640px; line-height: 1.75; margin-bottom: 40px; }
    .features-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
      gap: 14px;
    }
    .feature-card {
      background: rgba(255,255,255,0.03);
      border: 1px solid rgba(255,255,255,0.07);
      border-radius: 12px; padding: 20px 22px;
      display: flex; align-items: flex-start; gap: 12px;
    }
    .feature-check {
      width: 24px; height: 24px; flex-shrink: 0;
      background: ${color}22; color: ${colorLight};
      border-radius: 6px; display: flex; align-items: center; justify-content: center;
      font-size: 0.85rem; font-weight: 900; margin-top: 1px;
    }
    .feature-card p { font-size: 0.93rem; color: rgba(255,255,255,0.65); margin: 0; }

    /* Content blocks */
    .content-blocks { border-top: 1px solid rgba(255,255,255,0.05); }
    .content-block {
      max-width: 1100px; margin: 0 auto; padding: 60px 24px;
      border-bottom: 1px solid rgba(255,255,255,0.05);
    }
    .content-block h2 {
      font-size: clamp(1.4rem, 3vw, 2rem);
      font-weight: 800; letter-spacing: -0.02em;
      margin-bottom: 14px; color: #fff; line-height: 1.2;
    }
    .content-block p { color: rgba(255,255,255,0.55); font-size: 1.02rem; line-height: 1.8; max-width: 740px; }

    /* Nearby cities */
    .nearby {
      background: rgba(255,255,255,0.02);
      border-top: 1px solid rgba(255,255,255,0.05);
      border-bottom: 1px solid rgba(255,255,255,0.05);
      padding: 48px 24px;
    }
    .nearby-inner { max-width: 1100px; margin: 0 auto; }
    .nearby h3 { font-size: 1rem; font-weight: 700; color: rgba(255,255,255,0.7); margin-bottom: 16px; }
    .nearby-links { display: flex; flex-wrap: wrap; gap: 10px; }
    .nearby-link {
      font-size: 0.84rem; color: rgba(255,255,255,0.45);
      padding: 6px 14px; border-radius: 8px;
      background: rgba(255,255,255,0.04);
      border: 1px solid rgba(255,255,255,0.07);
      transition: color 0.2s, background 0.2s;
    }
    .nearby-link:hover { color: #fff; background: rgba(255,255,255,0.09); }

    /* FAQ */
    .faq-section { background: #080808; }
    .faq-inner { max-width: 860px; margin: 0 auto; padding: 80px 24px; }
    .faq-inner > h2 {
      font-size: clamp(1.5rem, 3.5vw, 2.1rem);
      font-weight: 800; letter-spacing: -0.02em;
      margin-bottom: 40px; text-align: center; color: #fff;
    }
    .faq-item { border-top: 1px solid rgba(255,255,255,0.07); padding: 26px 0; }
    .faq-item:last-child { border-bottom: 1px solid rgba(255,255,255,0.07); }
    .faq-q { font-size: 1rem; font-weight: 700; margin-bottom: 10px; color: #fff; }
    .faq-a { color: rgba(255,255,255,0.5); font-size: 0.95rem; line-height: 1.8; }

    /* CTA banner */
    .cta-banner {
      background: linear-gradient(135deg, ${color}20 0%, rgba(10,10,10,1) 60%);
      border-top: 1px solid ${color}30;
      text-align: center; padding: 80px 24px;
    }
    .cta-banner h2 {
      font-size: clamp(1.7rem, 4vw, 2.5rem);
      font-weight: 900; letter-spacing: -0.02em;
      margin-bottom: 14px; color: #fff;
    }
    .cta-banner p { color: rgba(255,255,255,0.45); font-size: 1.05rem; max-width: 520px; margin: 0 auto 32px; }
    .cta-phone {
      font-size: 1.3rem; font-weight: 900; color: ${colorLight};
      margin-bottom: 24px; display: block;
    }

    /* Sitemap */
    .sitemap {
      background: rgba(255,255,255,0.015);
      border-top: 1px solid rgba(255,255,255,0.06);
      padding: 48px 24px;
    }
    .sitemap-inner { max-width: 1100px; margin: 0 auto; }
    .sitemap-title {
      font-size: 0.7rem; font-weight: 700; letter-spacing: 0.18em;
      text-transform: uppercase; color: rgba(255,255,255,0.18);
      margin-bottom: 20px;
    }
    .sitemap-links { display: flex; flex-wrap: wrap; gap: 8px; }
    .sitemap-link {
      font-size: 0.8rem; color: rgba(255,255,255,0.3);
      padding: 4px 10px; border-radius: 6px;
      border: 1px solid rgba(255,255,255,0.05);
      transition: color 0.15s;
    }
    a.sitemap-link:hover { color: rgba(255,255,255,0.6); }
    .sitemap-link.current { color: rgba(255,255,255,0.5); font-weight: 600; }

    /* Footer */
    footer {
      text-align: center; padding: 24px;
      font-size: 0.8rem; color: rgba(255,255,255,0.18);
      border-top: 1px solid rgba(255,255,255,0.05);
    }
    footer a { color: rgba(255,255,255,0.28); }
    footer a:hover { color: rgba(255,255,255,0.5); }

    @media (max-width: 640px) {
      .features-grid { grid-template-columns: 1fr; }
      .stat-item { padding: 16px 20px; }
      .hero { padding: 56px 20px 48px; }
    }
  </style>
</head>
<body>

  <!-- Navigation -->
  <nav class="nav">
    <div class="nav-inner">
      <a href="/" class="nav-logo">${escHtml(siteName)}</a>
      <a href="/" class="nav-cta">${escHtml(cfg.ctaText)}</a>
    </div>
  </nav>

  <!-- Hero -->
  <section class="hero">
    <span class="hero-eyebrow">${escHtml(siteName)} · ${escHtml(city)}, ${escHtml(stateCode)}</span>
    <h1>${escHtml(h1Text).replace(escHtml(siteName), `<span class="accent">${escHtml(siteName)}</span>`)}</h1>
    <p class="hero-sub">${escHtml(cfg.tagline(city, siteName))}</p>
    ${phone ? `
    <div class="hero-phone-box">
      <span>📞</span>
      <span>Free Local Number: <a href="tel:${phoneRaw}">${escHtml(phone)}</a></span>
    </div>` : ""}
    <div class="hero-ctas">
      <a href="tel:${phoneRaw}" class="btn-primary">📞 ${escHtml(cfg.ctaText)}</a>
      <a href="/" class="btn-secondary">Learn More</a>
    </div>
  </section>

  <!-- Stats bar -->
  <div class="stats-bar">
    <div class="stat-item"><span class="stat-value">Free</span><span class="stat-label">Trial Minutes</span></div>
    <div class="stat-item"><span class="stat-value">24/7</span><span class="stat-label">Always Live</span></div>
    <div class="stat-item"><span class="stat-value">100%</span><span class="stat-label">Anonymous</span></div>
    <div class="stat-item"><span class="stat-value">Local</span><span class="stat-label">${escHtml(city)} Area</span></div>
  </div>

  <!-- Features -->
  <div class="section">
    <p class="section-label">${escHtml(siteName)} Features</p>
    <h2>Everything you need to connect in ${escHtml(city)}</h2>
    <p>Your local access number puts you directly in touch with real people in the ${escHtml(city)} area — no apps, no profiles, just pick up the phone.</p>
    <div class="features-grid">
      ${cfg.features.map(f => `
      <div class="feature-card">
        <div class="feature-check">✓</div>
        <p>${escHtml(f)}</p>
      </div>`).join("")}
    </div>
  </div>

  <!-- Content H2 blocks -->
  <div class="content-blocks">
    ${cfg.h2s.map(block => `
    <div class="content-block">
      <h2>${escHtml(block.heading(city, stateName || stateCode, siteName))}</h2>
      <p>${escHtml(block.body(city, stateName || stateCode, siteName))}</p>
    </div>`).join("")}
  </div>

  <!-- Nearby cities (SEO long-tail) -->
  ${nearbyCities.length > 0 ? `
  <div class="nearby">
    <div class="nearby-inner">
      <h3>Also available near ${escHtml(city)}, ${escHtml(stateCode)}</h3>
      <div class="nearby-links">
        ${nearbyCities.map(c => `<a href="/regions/${encodeURIComponent(c.slug)}.html" class="nearby-link">${escHtml(c.name)}, ${escHtml(c.stateCode)}</a>`).join("\n        ")}
      </div>
    </div>
  </div>` : ""}

  <!-- FAQ -->
  <div class="faq-section">
    <div class="faq-inner">
      <h2>Frequently Asked Questions — ${escHtml(city)}, ${escHtml(stateCode)}</h2>
      ${cfg.faqs.map(faq => `
      <div class="faq-item">
        <p class="faq-q">${escHtml(faq.q(city))}</p>
        <p class="faq-a">${escHtml(faq.a(city, siteName))}</p>
      </div>`).join("")}
    </div>
  </div>

  <!-- CTA banner -->
  <div class="cta-banner">
    <h2>Ready to connect in ${escHtml(city)}?</h2>
    <p>Real local ${escHtml(cfg.pronoun)} in ${escHtml(city)}, ${escHtml(stateCode)} are on the line right now. Your first call is free.</p>
    ${phone ? `<a href="tel:${phoneRaw}" class="cta-phone">📞 ${escHtml(phone)}</a>` : ""}
    <a href="tel:${phoneRaw}" class="btn-primary" style="font-size:1.05rem;padding:16px 40px;">
      ${escHtml(cfg.ctaText)} →
    </a>
  </div>

  <!-- Sitemap -->
  ${allActiveRegions.length > 1 ? `
  <div class="sitemap">
    <div class="sitemap-inner">
      <p class="sitemap-title">All Local Numbers</p>
      <div class="sitemap-links">
        ${sitemapLinks}
        <a href="/" class="sitemap-link">${escHtml(siteName)} Home</a>
      </div>
    </div>
  </div>` : ""}

  <!-- Footer -->
  <footer>
    <p>
      &copy; ${new Date().getFullYear()} ${escHtml(siteName)} &mdash; ${escHtml(city)}, ${escHtml(stateName || stateCode)} &mdash;
      <a href="/">Home</a> &middot;
      <a href="/privacy-policy">Privacy Policy</a> &middot;
      <a href="/terms-of-service">Terms of Service</a>
    </p>
  </footer>

</body>
</html>`;
}

// ── Write / delete helpers ─────────────────────────────────────────────────

export function writeRegionPage(
  region: Region,
  siteSettings: SiteSettings,
  linkedRegions: Region[] = [],
  siteUrl?: string,
  allRegions: Region[] = [],
): string {
  ensureDir();
  const resolvedUrl = siteUrl ?? getSiteUrl();
  const html = generateRegionPage(region, siteSettings, linkedRegions, resolvedUrl, allRegions);
  const filePath = path.join(REGIONS_DIR, `${region.slug}.html`);
  fs.writeFileSync(filePath, html, "utf-8");
  return filePath;
}

export function deleteRegionPage(slug: string): void {
  const filePath = path.join(REGIONS_DIR, `${slug}.html`);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
}

export function regionPageExists(slug: string): boolean {
  return fs.existsSync(path.join(REGIONS_DIR, `${slug}.html`));
}

// ── Sitemap + robots ───────────────────────────────────────────────────────

export function writeSitemap(allRegions: Region[], siteUrl: string): void {
  const publicDir = path.join(__dirname, "../client/public");
  if (!fs.existsSync(publicDir)) fs.mkdirSync(publicDir, { recursive: true });

  const activeRegions = allRegions.filter(r => r.isActive);
  const now = new Date().toISOString().split("T")[0];

  const urls = [
    `  <url>\n    <loc>${siteUrl}/</loc>\n    <changefreq>weekly</changefreq>\n    <priority>1.0</priority>\n    <lastmod>${now}</lastmod>\n  </url>`,
    ...activeRegions.map(r =>
      `  <url>\n    <loc>${siteUrl}/regions/${r.slug}.html</loc>\n    <changefreq>monthly</changefreq>\n    <priority>0.8</priority>\n    <lastmod>${now}</lastmod>\n  </url>`,
    ),
  ];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>`;
  fs.writeFileSync(path.join(publicDir, "sitemap.xml"), xml, "utf-8");
}

export function writeRobotsTxt(siteUrl: string): void {
  const publicDir = path.join(__dirname, "../client/public");
  if (!fs.existsSync(publicDir)) fs.mkdirSync(publicDir, { recursive: true });

  const content = `User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /admin\n\nSitemap: ${siteUrl}/sitemap.xml\n`;
  fs.writeFileSync(path.join(publicDir, "robots.txt"), content, "utf-8");
}

// ── Helpers ────────────────────────────────────────────────────────────────

function getSiteUrl(): string {
  if (process.env.SITE_URL) return process.env.SITE_URL.replace(/\/$/, "");
  if (process.env.REPLIT_DEV_DOMAIN) return `https://${process.env.REPLIT_DEV_DOMAIN}`;
  return "https://example.com";
}

function escHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escAttr(str: string): string {
  return str.replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
