import fs from "fs";
import path from "path";
import type { Region, SiteSettings } from "@shared/schema";

export const REGIONS_DIR = path.join(process.cwd(), "client/public/regions");

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
  pronoun: string;
  audienceDesc: string;
  metaDesc: (city: string, state: string, phone: string, siteName: string) => string;
  h1: (city: string, stateCode: string, siteName: string) => string;
  tagline: (city: string, state: string, siteName: string) => string;
  features: string[];
  h2s: Array<{
    heading: (city: string, state: string, siteName: string) => string;
    body: (city: string, state: string, siteName: string) => string;
  }>;
  howToSteps: Array<{ name: string; text: (city: string, siteName: string) => string }>;
  faqs: Array<{
    q: (city: string, state: string, siteName: string) => string;
    a: (city: string, state: string, siteName: string) => string;
  }>;
  ctaText: string;
}

function getContentConfig(siteCategory: string): ContentConfig {
  const isMM = siteCategory !== "MW";

  if (isMM) {
    return {
      pronoun: "gay men",
      audienceDesc: "gay and bisexual men",
      metaDesc: (city, state, phone, siteName) =>
        `${siteName} is the free gay chat line for men in ${city}, ${state}. Talk to real local gay men right now — no app, no credit card required. ${phone ? `Local number: ${phone}. ` : ""}Free trial minutes for every new caller. Call and connect instantly.`,
      h1: (city, stateCode, siteName) =>
        `${city}, ${stateCode} Gay Chat Line — Talk to Gay Men Now | ${siteName}`,
      tagline: (city, state, siteName) =>
        `The free gay chat line and gay party line for men in ${city}, ${state}. Real gay men, live voice conversations, 24 hours a day.`,
      features: [
        "Free trial minutes for all new callers — no credit card required",
        "Talk to real gay men in your area right now, 24/7",
        "100% private and anonymous — your number is never shared",
        "Record a personal greeting to introduce yourself to local gay men",
        "Browse greetings from gay men near you before connecting",
        "Leave and receive private voice messages at any time",
        "Go live with someone instantly when you both want to connect",
        "Simple, affordable membership plans with no hidden fees",
        "Block any caller instantly — full control over your experience",
        "Works on any phone — smartphone, basic cell, or landline",
      ],
      h2s: [
        {
          heading: (city, state, siteName) => `${siteName}: The Free Gay Chat Line in ${city}, ${state}`,
          body: (city, state, siteName) =>
            `${siteName} is the premier free gay chat line for men in ${city}, ${state}. Whether you're looking to talk to gay men casually, find friendship, or make a real connection, the ${city} gay chat line is live right now — real guys in your area are on the line waiting to hear from you. Unlike gay dating apps that rely on photos and algorithms, ${siteName} is voice-first. You hear a real man's voice from the very first second, which means you know immediately if there's genuine chemistry. No swiping, no text chains that go nowhere, no fake profiles — just pick up your phone, call the ${city} gay chat line number, and start talking. Gay men across ${state} use ${siteName} every day to connect with people they never would have found on an app.`,
        },
        {
          heading: (_c, _s, _n) => "How the Gay Chat Line Works — Step by Step",
          body: (city, _state, siteName) =>
            `Getting started on ${siteName}'s gay chat line couldn't be simpler. Call your local ${city} gay chat line access number and you'll be guided through the process automatically. First, record a short personal greeting — say your name, a little about yourself, and what you're looking for. Your greeting is how other gay men get to know you before deciding to connect, so keep it genuine. After recording, you're dropped into the live ${city} gay chat line community where you can browse greetings from local gay men, leave private voice messages for anyone who interests you, or request a live two-way connection. When both callers agree to go live, ${siteName} connects you instantly and privately. The entire process — from first call to first real conversation — takes under five minutes. No profile, no photos, no app required.`,
        },
        {
          heading: (city, state, siteName) => `Why Gay Men in ${city} Choose ${siteName}`,
          body: (city, state, siteName) =>
            `Gay men in ${city}, ${state} choose ${siteName} because it delivers something dating apps can't: immediate, authentic voice connection. When you call the ${city} gay chat line, you hear a real man's voice — his personality, energy, and sense of humor — right away. There's no catfishing, no carefully filtered photos, and no text conversations that go nowhere. ${siteName} also offers complete privacy that's especially important for gay men who value discretion. Your personal phone number is never revealed, you're known only by your chosen screen name, and you can block anyone with a single keypress. Whether you're out and proud, privately exploring, or anywhere in between, ${siteName} is a safe, anonymous space to connect with gay men in ${city} on your own terms. The free trial means there's nothing to lose by calling.`,
        },
        {
          heading: (city, state, siteName) => `Gay Men in ${city}, ${state} Are on the Line Right Now`,
          body: (city, state, siteName) =>
            `The ${siteName} gay chat line community in ${city} is active around the clock — morning, night, weekends, weekdays. There are always real gay men on the line, no matter when you call. Unlike gay dating apps that go quiet or show you the same profiles for days, the ${city} gay chat line brings fresh voices and new guys every time you call. The phone-based format means there's no barrier to entry: call your ${city} gay chat line number, and you're immediately connected to a live community of gay men in your area. Voice is harder to fake than a photo, which means the gay men you meet on ${siteName} are more authentic and the conversations are more real. Join the ${city} gay chat line community on ${siteName} today.`,
        },
        {
          heading: (_c, _s, siteName) => `Gay Chat Line Privacy — Your Safety Is Guaranteed`,
          body: (_city, _state, siteName) =>
            `Privacy is one of the most important features of the ${siteName} gay chat line — and it's built in at every level. Your personal phone number is never revealed to other callers under any circumstances. All calls are routed through ${siteName}'s private network, so neither party ever sees the other's real number. You're identified only by the screen name you record in your greeting, which you can change at any time. You have complete control over every interaction on the gay chat line: choose who you respond to, how long you talk, and block anyone permanently with a single keypress. That block is immediate and final — the blocked caller can never reach you again. ${siteName} is designed to give gay and bisexual men a safe, private, anonymous space to connect openly and authentically.`,
        },
      ],
      howToSteps: [
        { name: "Call your local gay chat line number", text: (city, siteName) => `Dial the ${city} gay chat line access number for ${siteName}. New callers are guided through setup automatically — no experience needed. You'll be talking to gay men in your area in minutes.` },
        { name: "Record your greeting", text: (_city, siteName) => `Record a short personal greeting introducing yourself to the gay chat line community. Tell other men a little about who you are and what you're looking for. Genuine, specific greetings get the best responses.` },
        { name: "Browse local gay men's greetings", text: (city, siteName) => `Listen to greetings from real gay men in and around ${city}. Take your time — there's no pressure. When you hear someone who interests you, you're ready for the next step.` },
        { name: "Send a message or connect live", text: (_city, siteName) => `Leave a private voice message for any guy who caught your attention, or request a live two-way connection. When both callers agree, ${siteName} bridges you together instantly and privately.` },
      ],
      faqs: [
        {
          q: (city, state, siteName) => `Is there a free gay chat line in ${city}, ${state}?`,
          a: (city, state, siteName) =>
            `Yes — ${siteName} is a free gay chat line with local access numbers in ${city} and across ${state}. Every new caller gets free trial minutes with no credit card required. During your trial you can record your greeting, browse greetings from gay men in the ${city} area, send voice messages, and connect live with someone. After your trial, affordable month-to-month plans are available with no contracts and no hidden fees.`,
        },
        {
          q: (city, _s, _n) => `How do I talk to gay men in ${city} right now?`,
          a: (city, state, siteName) =>
            `The fastest way to talk to gay men in ${city} right now is to call the ${siteName} gay chat line. Dial your local ${city} access number, record a quick greeting, and you're immediately placed into the live ${city} gay chat line community. Real gay men in your area are on the line right now — no app, no profile, no waiting for a match. Just pick up any phone and call.`,
        },
        {
          q: (_c, _s, _n) => `Do I need an app to use the gay chat line?`,
          a: (city, _state, siteName) =>
            `No app is needed. ${siteName} is an entirely phone-based gay chat line — all you need is any phone (smartphone, basic cell, or landline) to call your local ${city} gay chat line number. There's no account to create, no photos to upload, and no software to install. If you can make a phone call, you can talk to gay men on ${siteName} right now.`,
        },
        {
          q: (_c, _s, _n) => `Will other gay men on the chat line see my real phone number?`,
          a: (_city, _state, siteName) =>
            `Never. ${siteName} routes all gay chat line calls through a private network that completely hides your personal phone number from every other caller. Other men only know you by the screen name in your greeting. Your real identity and contact information stay entirely private — this is one of the core reasons gay men trust ${siteName} as a safe, discreet way to connect.`,
        },
        {
          q: (city, state, siteName) => `How does the ${city} gay chat line connect me with local men?`,
          a: (city, state, siteName) =>
            `${siteName} uses local access numbers to create geographically focused gay chat line communities. When you call the ${city} gay chat line number, you're placed directly into the ${city} and ${state} community. The greetings you hear, the messages you receive, and the live connections you make are all prioritized from gay men in and around ${city}. This local-first approach makes ${siteName} feel like a real ${city} community — not a national app where your area is a filter setting.`,
        },
        {
          q: (_c, _s, _n) => `Is the gay chat line available 24 hours a day?`,
          a: (_city, _state, siteName) =>
            `Yes — ${siteName}'s gay chat line is available 24 hours a day, 7 days a week, 365 days a year. There are always real gay men on the line no matter when you call. The community is most active evenings and weekends, but even late-night calls find active members. Your greeting stays live in the system when you're not on the call, so gay men can leave you messages anytime and you can reply at your convenience.`,
        },
      ],
      ctaText: "Talk to Gay Men Free",
    };
  } else {
    return {
      pronoun: "singles",
      audienceDesc: "men and women",
      metaDesc: (city, state, phone, siteName) =>
        `${siteName} is the free phone chat line for singles in ${city}, ${state}. Connect with real local men and women right now — no app, no credit card needed. ${phone ? `Your local number: ${phone}. ` : ""}New callers get free trial minutes instantly.`,
      h1: (city, stateCode, siteName) =>
        `${siteName} in ${city}, ${stateCode} — Talk to Real Local Singles`,
      tagline: (city, state, siteName) =>
        `The free phone chat line for singles in ${city}, ${state}. Real people, live conversation, 24 hours a day.`,
      features: [
        "Free trial minutes for new callers — no credit card required",
        "Real local singles on the line right now, 24/7",
        "Private and anonymous — your phone number is never shared",
        "Record a personal greeting to introduce yourself",
        "Browse greetings from men and women in your area",
        "Leave and receive voice messages at any time",
        "Go live with someone instantly when you're both interested",
        "Simple, affordable membership plans with no hidden fees",
        "Block any caller instantly for a stress-free experience",
        "Works on any phone — smartphone, cell, or landline",
      ],
      h2s: [
        {
          heading: (city, state, siteName) => `${siteName}: The ${city}, ${state} Chat Line for Singles`,
          body: (city, state, siteName) =>
            `${siteName} is the premier free phone chat line for singles in ${city}, ${state}. Men and women who are looking to connect — whether for casual conversation, friendship, or something more meaningful — are on the line right now. Unlike dating apps that rely on photos, endless swiping, and algorithm-driven matches, ${siteName} is voice-first. You connect through real conversation from the very first moment, which means you know immediately whether there's a genuine connection. Singles across ${state} use ${siteName} every day because it's fast, real, and refreshingly simple. Call your local ${city} number, record your greeting, and start meeting people who are in your area and looking for the same thing you are.`,
        },
        {
          heading: (_c, _s, _n) => "How the Chat Line Works — Step by Step",
          body: (city, _state, siteName) =>
            `Getting started on ${siteName} is easy. Dial your local ${city} access number and you'll be guided through the process automatically. First, record a short personal greeting — say your name, a little about yourself, and what you're hoping to find. Your greeting is your first impression, so be genuine and specific. After recording, you'll be dropped into the live ${city} community where you can browse greetings from other local singles, leave voice messages for anyone who interests you, or request a live two-way connection. If both callers agree to connect, you're bridged together instantly and privately. The whole process takes less than five minutes from the first call to the first real conversation. No app, no profile form, no waiting for a match — just your voice and your phone.`,
        },
        {
          heading: (city, state, siteName) => `Why ${city} Singles Choose ${siteName}`,
          body: (city, state, siteName) =>
            `Singles in ${city}, ${state} choose ${siteName} because it delivers something dating apps simply can't: authentic, real-time voice connection. When you hear someone's voice, you immediately get a sense of their personality, their energy, and whether there's real chemistry — something no photo or text bio can convey. ${siteName} also offers complete privacy. Your phone number is never shared, you're identified only by your chosen screen name, and you can block anyone with a single keypress. For men and women in ${city} who value their privacy — whether they're new to town, returning to dating after a break, or simply prefer to keep their personal life discreet — ${siteName} offers a safe and trustworthy space to connect. The free trial minutes for new callers mean you can experience the ${city} community firsthand with no financial commitment.`,
        },
        {
          heading: (city, state, siteName) => `${city}, ${state} Singles Are on the Line Right Now`,
          body: (city, state, siteName) =>
            `The ${siteName} community in ${city} is active around the clock. Whether you call in the morning, after work, or late at night, you'll find real singles in and around ${city} browsing greetings and waiting to connect. Because ${siteName} uses local access numbers, every person you interact with is part of your geographic community — not someone in another state who happened to match on a national algorithm. This local focus makes connections feel more relevant and more real. You might end up talking to someone who lives in your neighborhood, frequents the same coffee shop, or works a few blocks away. That local proximity turns phone conversations into potential real-world connections far more naturally than any dating app ever could.`,
        },
        {
          heading: (_c, _s, siteName) => `Privacy and Safety on ${siteName}`,
          body: (_city, _state, siteName) =>
            `Privacy is a core feature of how ${siteName} works, not an afterthought. Your personal phone number is never revealed to other callers under any circumstances — all calls are routed through ${siteName}'s private network. Other members only ever know you by the screen name you choose when recording your greeting. You are in complete control of every interaction: you decide who you respond to, how long you talk, and you can block any caller permanently with a single keypress. Once blocked, that person cannot reach you again. ${siteName} also keeps your voice messages and greetings private and secure. The platform is designed specifically so that you can explore connections openly and honestly without any concern about your real identity or contact details being exposed.`,
        },
      ],
      howToSteps: [
        { name: "Dial your local access number", text: (city, siteName) => `Call the ${city} local access number for ${siteName}. New callers are guided through the entire setup process automatically — no experience needed.` },
        { name: "Record your greeting", text: (_city, siteName) => `Record a short personal greeting. Introduce yourself and tell other ${siteName} members what you're looking for. Authentic, genuine greetings get the best responses.` },
        { name: "Browse local singles", text: (city, siteName) => `Listen to greetings from real singles in and around ${city}. Take your time exploring. When someone catches your attention, you're ready for the next step.` },
        { name: "Connect by message or go live", text: (_city, siteName) => `Send a private voice message to anyone who interests you, or request a live connection. ${siteName} bridges you together privately the moment you both agree to connect.` },
      ],
      faqs: [
        {
          q: (city, state, siteName) => `Is ${siteName} really free for singles in ${city}, ${state}?`,
          a: (city, state, siteName) =>
            `Yes — ${siteName} gives all new callers free trial minutes, and no credit card is needed to claim them. During your free trial you can record your greeting, browse greetings from local singles in the ${city} area, send voice messages, and even connect live. After your trial minutes are used, affordable month-to-month membership plans are available. There are no contracts, no hidden fees, and you can cancel at any time. The free trial is a genuine no-risk way to experience the ${siteName} community before deciding whether a membership makes sense for you.`,
        },
        {
          q: (_c, _s, _n) => `Do I need to download an app to use the chat line?`,
          a: (city, _state, siteName) =>
            `No download required. ${siteName} is entirely phone-based — all you need is any phone to call your local ${city} access number and you're immediately connected. There is no account to create online, no profile photo to upload, and no software to install. This makes ${siteName} accessible to everyone regardless of their device or tech comfort level. If you can make a phone call, you can use ${siteName} — it's that simple.`,
        },
        {
          q: (city) => `Will other callers see my real phone number when I call?`,
          a: (_city, _state, siteName) =>
            `No — never. ${siteName} routes all calls through a private network that keeps your personal phone number completely hidden from every other caller. You're known only by the screen name you record in your greeting. Your real identity and contact information remain entirely private throughout every interaction. This system-level privacy protection is one of the main reasons singles trust ${siteName} as a safe space to explore connections without any risk of unwanted contact.`,
        },
        {
          q: (_c, _s, _n) => `What happens when my free trial minutes run out?`,
          a: (_city, _state, siteName) =>
            `When your free trial minutes are used, you can continue chatting by selecting one of ${siteName}'s affordable membership plans. Plans are flexible and available at multiple price points so you can choose what fits your budget and usage. All memberships are month-to-month — no long-term contracts and no cancellation fees. Visit the ${siteName} website for current plan pricing and details.`,
        },
        {
          q: (city, state, siteName) => `How does ${siteName} connect me with singles in the ${city} area specifically?`,
          a: (city, state, siteName) =>
            `${siteName} uses local access numbers to create location-specific communities. When you dial the ${city} local number, you're placed directly into the ${city} and ${state} community. The greetings you hear, the messages you receive, and the live connections you make are all prioritized from singles in and around ${city}. This local-first approach means you're building connections with people who share your city and your daily life — which makes conversations more relevant and meetups in real life much more natural.`,
        },
        {
          q: (_c, _s, _n) => `Is the chat line available at all hours?`,
          a: (_city, _state, siteName) =>
            `Yes — ${siteName} is available 24 hours a day, 7 days a week, every day of the year. There is always someone on the line whenever you call. The community tends to be most active in the evenings and on weekends, but even late-night or early-morning calls will find active members. Your personal greeting stays live in the system when you're not on the call, so others can leave you messages at any time and you can respond at your convenience.`,
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
  const stateDisplay = stateName || stateCode;
  const phone = formatPhone(region.phoneNumber);
  const phoneRaw = region.phoneNumber?.replace(/\D/g, "") ?? "";
  const phoneE164 = phoneRaw ? `+1${phoneRaw}` : "";
  const siteName = siteSettings.siteName;
  const color = "#2563EB";
  const colorLight = "#3B82F6";
  const today = new Date().toISOString().split("T")[0];

  const pageUrl = `${siteUrl}/regions/${region.slug}.html`;
  const isMM = siteSettings.siteCategory !== "MW";
  const metaTitle = isMM
    ? `${city}, ${stateCode} Gay Chat Line — Talk to Gay Men Now | ${siteName} | Free Trial`
    : `${city}, ${stateCode} Chat Line — ${siteName} | Free Trial | Local Phone Chat for Singles`;
  const metaDesc = cfg.metaDesc(city, stateDisplay, phone, siteName);
  const h1Text = cfg.h1(city, stateCode, siteName);

  const keywords = isMM ? [
    `gay chat line ${city.toLowerCase()}`,
    `gay chat line ${city.toLowerCase()} ${stateCode.toLowerCase()}`,
    `gay party line ${city.toLowerCase()}`,
    `free gay chat line ${city.toLowerCase()}`,
    `talk to gay men ${city.toLowerCase()}`,
    `gay men ${city.toLowerCase()} ${stateCode.toLowerCase()}`,
    `gay phone chat ${city.toLowerCase()}`,
    `${city.toLowerCase()} gay chat line`,
    `${city.toLowerCase()} ${stateCode.toLowerCase()} gay chat`,
    `gay chat line ${stateCode.toLowerCase()}`,
    `free gay phone chat ${city.toLowerCase()}`,
    `gay chat line free trial ${city.toLowerCase()}`,
    `${siteName.toLowerCase()} ${city.toLowerCase()}`,
    `m4m chat line ${city.toLowerCase()}`,
  ].join(", ") : [
    `${siteName.toLowerCase()} ${city.toLowerCase()}`,
    `chat line ${city.toLowerCase()} ${stateCode.toLowerCase()}`,
    `free phone chat ${city.toLowerCase()}`,
    `local chat line ${city.toLowerCase()} ${stateCode.toLowerCase()}`,
    `free trial chat line ${city.toLowerCase()}`,
    `singles chat line ${city.toLowerCase()}`,
    `${city.toLowerCase()} ${stateCode.toLowerCase()} phone chat`,
    `${city.toLowerCase()} ${stateCode.toLowerCase()} chat line free`,
    `phone dating ${city.toLowerCase()}`,
    `adult chat line ${city.toLowerCase()} ${stateCode.toLowerCase()}`,
  ].join(", ");

  // ── JSON-LD: LocalBusiness ──────────────────────────────────────────────
  const localBizJsonLd = {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    "@id": pageUrl,
    "name": isMM ? `${siteName} — ${city}, ${stateCode} Gay Chat Line` : `${siteName} — ${city}, ${stateCode}`,
    "description": metaDesc,
    "url": siteUrl,
    "telephone": phoneE164 || undefined,
    "priceRange": "Free–$$",
    "openingHours": "Mo-Su 00:00-23:59",
    "address": {
      "@type": "PostalAddress",
      "addressLocality": city,
      "addressRegion": stateCode,
      "addressCountry": "US",
    },
    "areaServed": [
      { "@type": "City", "name": city },
      { "@type": "State", "name": stateDisplay },
    ],
    "hasOfferCatalog": {
      "@type": "OfferCatalog",
      "name": `${siteName} Local Chat Line Services`,
      "itemListElement": cfg.features.map((f, i) => ({
        "@type": "Offer",
        "position": i + 1,
        "name": f,
        "price": "0",
        "priceCurrency": "USD",
        "availability": "https://schema.org/InStock",
      })),
    },
  };

  // ── JSON-LD: FAQPage ────────────────────────────────────────────────────
  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": cfg.faqs.map(faq => ({
      "@type": "Question",
      "name": faq.q(city, stateDisplay, siteName),
      "acceptedAnswer": {
        "@type": "Answer",
        "text": faq.a(city, stateDisplay, siteName),
      },
    })),
  };

  // ── JSON-LD: HowTo ──────────────────────────────────────────────────────
  const howToJsonLd = {
    "@context": "https://schema.org",
    "@type": "HowTo",
    "name": `How to Use ${siteName} in ${city}, ${stateCode}`,
    "description": `Step-by-step guide to connecting with local ${cfg.pronoun} on ${siteName} in ${city}, ${stateCode}.`,
    "totalTime": "PT5M",
    "supply": [{ "@type": "HowToSupply", "name": "Any telephone — smartphone, cell phone, or landline" }],
    "tool": [{ "@type": "HowToTool", "name": `${siteName} local access number for ${city}` }],
    "step": cfg.howToSteps.map((s, i) => ({
      "@type": "HowToStep",
      "position": i + 1,
      "name": s.name,
      "text": s.text(city, siteName),
    })),
  };

  // ── JSON-LD: BreadcrumbList ─────────────────────────────────────────────
  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "itemListElement": [
      { "@type": "ListItem", "position": 1, "name": "Home", "item": siteUrl },
      { "@type": "ListItem", "position": 2, "name": "Local Numbers", "item": `${siteUrl}/regions/` },
      { "@type": "ListItem", "position": 3, "name": `${city}, ${stateCode}`, "item": pageUrl },
    ],
  };

  // ── JSON-LD: WebPage ────────────────────────────────────────────────────
  const webPageJsonLd = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    "@id": `${pageUrl}#webpage`,
    "url": pageUrl,
    "name": metaTitle,
    "description": metaDesc,
    "datePublished": today,
    "dateModified": today,
    "inLanguage": "en-US",
    "isPartOf": { "@type": "WebSite", "url": siteUrl, "name": siteName },
    "breadcrumb": { "@id": `${pageUrl}#breadcrumb` },
    "potentialAction": {
      "@type": "ReadAction",
      "target": pageUrl,
    },
  };

  // Nearby cities from linked regions
  const nearbyCities = linkedRegions
    .filter(r => r.isActive)
    .map(r => ({ name: r.name, stateCode: r.stateAbbreviation ?? stateCode, slug: r.slug }));

  // Sitemap — all active regions
  const allActiveRegions = allRegions.filter(r => r.isActive);
  const sitemapLinks = allActiveRegions
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(r => {
      const isCurrent = r.slug === region.slug;
      const label = `${r.name}${r.stateAbbreviation ? ", " + r.stateAbbreviation : ""}`;
      if (isCurrent) return `<span class="sitemap-link current">${escHtml(label)} (this page)</span>`;
      return `<a href="/regions/${r.slug}.html" class="sitemap-link">${escHtml(label)}</a>`;
    })
    .join("\n        ");

  return `<!DOCTYPE html>
<html lang="en-US">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />

  <!-- Primary SEO -->
  <title>${escHtml(metaTitle)}</title>
  <meta name="description" content="${escAttr(metaDesc)}" />
  <meta name="keywords" content="${escAttr(keywords)}" />
  <link rel="canonical" href="${escAttr(pageUrl)}" />
  <meta name="robots" content="index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1" />
  <meta name="author" content="${escAttr(siteName)}" />
  <meta name="revisit-after" content="7 days" />

  <!-- Geo / Local SEO -->
  <meta name="geo.region" content="US-${escAttr(stateCode)}" />
  <meta name="geo.placename" content="${escAttr(city)}, ${escAttr(stateCode)}" />
  <meta name="DC.coverage" content="${escAttr(city)}, ${escAttr(stateDisplay)}, United States" />

  <!-- Open Graph -->
  <meta property="og:type" content="website" />
  <meta property="og:url" content="${escAttr(pageUrl)}" />
  <meta property="og:title" content="${escAttr(metaTitle)}" />
  <meta property="og:description" content="${escAttr(metaDesc)}" />
  <meta property="og:site_name" content="${escAttr(siteName)}" />
  <meta property="og:locale" content="en_US" />

  <!-- Twitter Card -->
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${escAttr(metaTitle)}" />
  <meta name="twitter:description" content="${escAttr(metaDesc)}" />

  <!-- Structured Data -->
  <script type="application/ld+json">${JSON.stringify(localBizJsonLd)}</script>
  <script type="application/ld+json">${JSON.stringify(faqJsonLd)}</script>
  <script type="application/ld+json">${JSON.stringify(howToJsonLd)}</script>
  <script type="application/ld+json">${JSON.stringify(breadcrumbJsonLd)}</script>
  <script type="application/ld+json">${JSON.stringify(webPageJsonLd)}</script>

  <!-- Fonts -->
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link rel="preload" as="style" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet" />

  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    html { scroll-behavior: smooth; font-size: 16px; }
    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: #0a0a0a;
      color: #f0f0f0;
      line-height: 1.6;
    }
    a { color: inherit; text-decoration: none; }
    img { max-width: 100%; display: block; }

    /* Nav */
    .nav {
      position: sticky; top: 0; z-index: 100;
      background: rgba(10,10,10,0.96); backdrop-filter: blur(12px);
      border-bottom: 1px solid rgba(255,255,255,0.07);
      padding: 0 24px; height: 60px;
      display: flex; align-items: center;
    }
    .nav-inner {
      max-width: 1100px; width: 100%; margin: 0 auto;
      display: flex; align-items: center; justify-content: space-between;
    }
    .nav-logo { font-size: 1.15rem; font-weight: 900; letter-spacing: -0.02em; color: #fff; }
    .nav-logo span { color: ${colorLight}; }
    .nav-right { display: flex; align-items: center; gap: 20px; }
    .nav-link { font-size: 0.875rem; color: rgba(255,255,255,0.5); font-weight: 500; }
    .nav-link:hover { color: #fff; }
    .nav-cta {
      background: ${color}; color: #fff;
      font-size: 0.875rem; font-weight: 700;
      padding: 8px 20px; border-radius: 8px;
      transition: background 0.2s;
    }
    .nav-cta:hover { background: ${colorLight}; }

    /* Breadcrumb */
    .breadcrumb {
      max-width: 1100px; margin: 0 auto;
      padding: 12px 24px;
      font-size: 0.8rem; color: rgba(255,255,255,0.3);
      display: flex; align-items: center; gap: 6px; flex-wrap: wrap;
    }
    .breadcrumb a { color: rgba(255,255,255,0.4); }
    .breadcrumb a:hover { color: rgba(255,255,255,0.7); }
    .breadcrumb-sep { color: rgba(255,255,255,0.18); }
    .breadcrumb-current { color: rgba(255,255,255,0.55); }

    /* Hero */
    .hero {
      background: linear-gradient(160deg, #0f0f1a 0%, #0a0a0a 60%);
      border-bottom: 1px solid rgba(255,255,255,0.06);
      padding: 60px 24px 64px;
      text-align: center;
    }
    .hero-eyebrow {
      display: inline-block;
      font-size: 0.72rem; font-weight: 700; letter-spacing: 0.16em;
      text-transform: uppercase; color: ${colorLight};
      background: ${color}18; border: 1px solid ${color}30;
      padding: 5px 14px; border-radius: 50px;
      margin-bottom: 22px;
    }
    .hero h1 {
      font-size: clamp(1.9rem, 5vw, 3.2rem);
      font-weight: 900; line-height: 1.1; letter-spacing: -0.02em;
      max-width: 820px; margin: 0 auto 18px; color: #fff;
    }
    .hero h1 .accent { color: ${colorLight}; }
    .hero-sub {
      font-size: 1.08rem; color: rgba(255,255,255,0.5);
      max-width: 600px; margin: 0 auto 36px; line-height: 1.7;
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
      display: flex; justify-content: center; flex-wrap: wrap;
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
    .stat-label { font-size: 0.76rem; color: rgba(255,255,255,0.3); font-weight: 500; margin-top: 3px; }

    /* Sections */
    .section { max-width: 1100px; margin: 0 auto; padding: 72px 24px; }
    .section-label {
      font-size: 0.72rem; font-weight: 700; letter-spacing: 0.15em;
      text-transform: uppercase; color: ${colorLight}; margin-bottom: 10px;
    }
    .section > h2 {
      font-size: clamp(1.5rem, 3.5vw, 2.1rem);
      font-weight: 800; letter-spacing: -0.02em; margin-bottom: 14px; color: #fff;
    }
    .section > p { color: rgba(255,255,255,0.5); font-size: 1.02rem; max-width: 640px; line-height: 1.8; margin-bottom: 40px; }

    /* Features grid */
    .features-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
      gap: 12px;
    }
    .feature-card {
      background: rgba(255,255,255,0.03);
      border: 1px solid rgba(255,255,255,0.07);
      border-radius: 12px; padding: 18px 20px;
      display: flex; align-items: flex-start; gap: 12px;
    }
    .feature-check {
      width: 22px; height: 22px; flex-shrink: 0;
      background: ${color}22; color: ${colorLight};
      border-radius: 6px; display: flex; align-items: center; justify-content: center;
      font-size: 0.8rem; font-weight: 900; margin-top: 1px;
    }
    .feature-card p { font-size: 0.92rem; color: rgba(255,255,255,0.62); margin: 0; }

    /* How-to steps */
    .howto-steps { margin-top: 40px; display: flex; flex-direction: column; gap: 0; }
    .howto-step {
      display: flex; align-items: flex-start; gap: 20px;
      padding: 24px 0; border-bottom: 1px solid rgba(255,255,255,0.05);
    }
    .howto-step:first-child { padding-top: 0; }
    .howto-step:last-child { border-bottom: none; }
    .step-num {
      width: 36px; height: 36px; flex-shrink: 0;
      background: ${color}; color: #fff;
      border-radius: 50%; display: flex; align-items: center; justify-content: center;
      font-size: 0.9rem; font-weight: 900; margin-top: 2px;
    }
    .step-body h3 { font-size: 1rem; font-weight: 700; color: #fff; margin-bottom: 6px; }
    .step-body p { font-size: 0.93rem; color: rgba(255,255,255,0.5); line-height: 1.75; margin: 0; }

    /* Content blocks */
    .content-blocks { border-top: 1px solid rgba(255,255,255,0.05); }
    .content-block {
      max-width: 1100px; margin: 0 auto; padding: 64px 24px;
      border-bottom: 1px solid rgba(255,255,255,0.05);
    }
    .content-block h2 {
      font-size: clamp(1.4rem, 3vw, 2rem);
      font-weight: 800; letter-spacing: -0.02em;
      margin-bottom: 16px; color: #fff; line-height: 1.2;
    }
    .content-block p {
      color: rgba(255,255,255,0.55); font-size: 1.01rem;
      line-height: 1.85; max-width: 780px;
    }

    /* Nearby cities */
    .nearby {
      background: rgba(255,255,255,0.02);
      border-top: 1px solid rgba(255,255,255,0.05);
      border-bottom: 1px solid rgba(255,255,255,0.05);
      padding: 48px 24px;
    }
    .nearby-inner { max-width: 1100px; margin: 0 auto; }
    .nearby h2 { font-size: 1.1rem; font-weight: 700; color: rgba(255,255,255,0.7); margin-bottom: 6px; }
    .nearby-sub { font-size: 0.88rem; color: rgba(255,255,255,0.3); margin-bottom: 18px; }
    .nearby-links { display: flex; flex-wrap: wrap; gap: 10px; }
    .nearby-link {
      font-size: 0.84rem; color: rgba(255,255,255,0.45);
      padding: 6px 14px; border-radius: 8px;
      background: rgba(255,255,255,0.04);
      border: 1px solid rgba(255,255,255,0.07);
      transition: color 0.2s, background 0.2s;
    }
    a.nearby-link:hover { color: #fff; background: rgba(255,255,255,0.09); }

    /* FAQ */
    .faq-section { background: #080808; }
    .faq-inner { max-width: 860px; margin: 0 auto; padding: 80px 24px; }
    .faq-inner > h2 {
      font-size: clamp(1.5rem, 3.5vw, 2.1rem);
      font-weight: 800; letter-spacing: -0.02em;
      margin-bottom: 10px; text-align: center; color: #fff;
    }
    .faq-sub { text-align: center; color: rgba(255,255,255,0.35); font-size: 0.95rem; margin-bottom: 48px; }
    .faq-item { border-top: 1px solid rgba(255,255,255,0.07); padding: 28px 0; }
    .faq-item:last-child { border-bottom: 1px solid rgba(255,255,255,0.07); }
    .faq-q { font-size: 1rem; font-weight: 700; margin-bottom: 12px; color: #fff; }
    .faq-a { color: rgba(255,255,255,0.5); font-size: 0.95rem; line-height: 1.85; }

    /* CTA banner */
    .cta-banner {
      background: linear-gradient(135deg, ${color}22 0%, rgba(10,10,10,1) 60%);
      border-top: 1px solid ${color}33;
      text-align: center; padding: 80px 24px;
    }
    .cta-banner h2 {
      font-size: clamp(1.7rem, 4vw, 2.4rem);
      font-weight: 900; letter-spacing: -0.02em;
      margin-bottom: 14px; color: #fff;
    }
    .cta-banner p { color: rgba(255,255,255,0.45); font-size: 1.05rem; max-width: 520px; margin: 0 auto 28px; line-height: 1.75; }
    .cta-phone {
      font-size: 1.4rem; font-weight: 900; color: ${colorLight};
      margin-bottom: 24px; display: block;
    }
    .cta-phone a { color: ${colorLight}; }
    .cta-phone a:hover { text-decoration: underline; }

    /* Sitemap */
    .sitemap {
      background: rgba(255,255,255,0.015);
      border-top: 1px solid rgba(255,255,255,0.06);
      padding: 48px 24px;
    }
    .sitemap-inner { max-width: 1100px; margin: 0 auto; }
    .sitemap-title {
      font-size: 0.68rem; font-weight: 700; letter-spacing: 0.18em;
      text-transform: uppercase; color: rgba(255,255,255,0.16);
      margin-bottom: 18px;
    }
    .sitemap-links { display: flex; flex-wrap: wrap; gap: 8px; }
    .sitemap-link {
      font-size: 0.8rem; color: rgba(255,255,255,0.28);
      padding: 4px 10px; border-radius: 6px;
      border: 1px solid rgba(255,255,255,0.05);
      transition: color 0.15s;
    }
    a.sitemap-link:hover { color: rgba(255,255,255,0.6); border-color: rgba(255,255,255,0.12); }
    .sitemap-link.current { color: rgba(255,255,255,0.5); font-weight: 600; }

    /* Footer */
    footer {
      text-align: center; padding: 24px;
      font-size: 0.78rem; color: rgba(255,255,255,0.16);
      border-top: 1px solid rgba(255,255,255,0.05);
    }
    footer a { color: rgba(255,255,255,0.26); }
    footer a:hover { color: rgba(255,255,255,0.5); }
    footer .footer-links { display: flex; justify-content: center; gap: 18px; margin-top: 8px; }

    @media (max-width: 640px) {
      .features-grid { grid-template-columns: 1fr; }
      .stat-item { padding: 14px 18px; }
      .hero { padding: 48px 20px 48px; }
      .nav-link { display: none; }
      .howto-step { gap: 14px; }
    }
  </style>
</head>
<body>

  <!-- Navigation -->
  <header>
    <nav class="nav" aria-label="Main navigation">
      <div class="nav-inner">
        <a href="/" class="nav-logo">${escHtml(siteName)}</a>
        <div class="nav-right">
          <a href="/" class="nav-link">Home</a>
          <a href="${phoneRaw ? `tel:${phoneRaw}` : "/"}" class="nav-cta">${escHtml(cfg.ctaText)}</a>
        </div>
      </div>
    </nav>
  </header>

  <!-- Breadcrumb -->
  <nav aria-label="Breadcrumb">
    <ol class="breadcrumb" itemscope itemtype="https://schema.org/BreadcrumbList">
      <li itemprop="itemListElement" itemscope itemtype="https://schema.org/ListItem">
        <a href="/" itemprop="item"><span itemprop="name">Home</span></a>
        <meta itemprop="position" content="1" />
      </li>
      <span class="breadcrumb-sep">›</span>
      <li itemprop="itemListElement" itemscope itemtype="https://schema.org/ListItem">
        <a href="/regions/" itemprop="item"><span itemprop="name">Local Numbers</span></a>
        <meta itemprop="position" content="2" />
      </li>
      <span class="breadcrumb-sep">›</span>
      <li itemprop="itemListElement" itemscope itemtype="https://schema.org/ListItem">
        <span itemprop="name" class="breadcrumb-current">${escHtml(city)}, ${escHtml(stateCode)}</span>
        <meta itemprop="item" content="${escAttr(pageUrl)}" />
        <meta itemprop="position" content="3" />
      </li>
    </ol>
  </nav>

  <!-- Hero -->
  <main>
  <section class="hero" aria-labelledby="hero-h1">
    <p class="hero-eyebrow">${escHtml(siteName)} · ${escHtml(city)}, ${escHtml(stateCode)} · Free Chat Line</p>
    <h1 id="hero-h1">${escHtml(h1Text).replace(escHtml(siteName), `<span class="accent">${escHtml(siteName)}</span>`)}</h1>
    <p class="hero-sub">${escHtml(cfg.tagline(city, stateDisplay, siteName))}</p>
    ${phone ? `
    <div class="hero-phone-box" itemscope itemtype="https://schema.org/LocalBusiness">
      <span aria-hidden="true">📞</span>
      <span>Free local number: <a href="tel:${phoneRaw}" itemprop="telephone">${escHtml(phone)}</a></span>
    </div>` : ""}
    <div class="hero-ctas">
      <a href="${phoneRaw ? `tel:${phoneRaw}` : "/"}" class="btn-primary" aria-label="${escAttr(cfg.ctaText)} — ${escAttr(city)} chat line">📞 ${escHtml(cfg.ctaText)}</a>
      <a href="/" class="btn-secondary">Learn More</a>
    </div>
  </section>

  <!-- Trust / stats bar -->
  <aside class="stats-bar" aria-label="Key facts">
    <div class="stat-item"><span class="stat-value">Free</span><span class="stat-label">Trial Minutes</span></div>
    <div class="stat-item"><span class="stat-value">24/7</span><span class="stat-label">Always Live</span></div>
    <div class="stat-item"><span class="stat-value">100%</span><span class="stat-label">Anonymous</span></div>
    <div class="stat-item"><span class="stat-value">Local</span><span class="stat-label">${escHtml(city)} Area</span></div>
    <div class="stat-item"><span class="stat-value">No&nbsp;App</span><span class="stat-label">Any Phone Works</span></div>
  </aside>

  <!-- Features -->
  <section class="section" aria-labelledby="features-h2">
    <p class="section-label">${escHtml(siteName)} Features</p>
    <h2 id="features-h2">Everything included on the ${escHtml(city)} chat line</h2>
    <p>Your local ${escHtml(city)} access number connects you directly to a live community of real ${escHtml(cfg.pronoun)} in your area. No apps, no profiles — just pick up the phone.</p>
    <div class="features-grid" role="list">
      ${cfg.features.map(f => `
      <article class="feature-card" role="listitem">
        <div class="feature-check" aria-hidden="true">✓</div>
        <p>${escHtml(f)}</p>
      </article>`).join("")}
    </div>
  </section>

  <!-- How It Works -->
  <section class="section" style="padding-top:0;" aria-labelledby="howto-h2">
    <p class="section-label">Getting Started</p>
    <h2 id="howto-h2">How to Use ${escHtml(siteName)} in ${escHtml(city)}, ${escHtml(stateCode)}</h2>
    <p>You can go from never having called to having a real conversation in under five minutes. Here's exactly how it works:</p>
    <ol class="howto-steps">
      ${cfg.howToSteps.map((s, i) => `
      <li class="howto-step">
        <div class="step-num" aria-hidden="true">${i + 1}</div>
        <div class="step-body">
          <h3>${escHtml(s.name)}</h3>
          <p>${escHtml(s.text(city, siteName))}</p>
        </div>
      </li>`).join("")}
    </ol>
  </section>

  <!-- Content H2 blocks -->
  <div class="content-blocks">
    ${cfg.h2s.map(block => `
    <article class="content-block">
      <h2>${escHtml(block.heading(city, stateDisplay, siteName))}</h2>
      <p>${escHtml(block.body(city, stateDisplay, siteName))}</p>
    </article>`).join("")}
  </div>

  <!-- Nearby cities -->
  ${nearbyCities.length > 0 ? `
  <aside class="nearby" aria-label="Also available in nearby cities">
    <div class="nearby-inner">
      <h2>Also available near ${escHtml(city)}, ${escHtml(stateCode)}</h2>
      <p class="nearby-sub">${escHtml(siteName)} has local access numbers throughout ${escHtml(stateDisplay)}. Connect with ${escHtml(cfg.pronoun)} in these nearby communities:</p>
      <nav aria-label="Nearby city chat lines">
        <ul class="nearby-links" style="list-style:none;padding:0;">
          ${nearbyCities.map(c => `<li><a href="/regions/${encodeURIComponent(c.slug)}.html" class="nearby-link">${escHtml(c.name)}, ${escHtml(c.stateCode)}</a></li>`).join("\n          ")}
        </ul>
      </nav>
    </div>
  </aside>` : ""}

  <!-- FAQ -->
  <section class="faq-section" aria-labelledby="faq-h2">
    <div class="faq-inner">
      <h2 id="faq-h2">Frequently Asked Questions</h2>
      <p class="faq-sub">${escHtml(siteName)} in ${escHtml(city)}, ${escHtml(stateCode)} — common questions answered</p>
      ${cfg.faqs.map(faq => `
      <article class="faq-item">
        <h3 class="faq-q">${escHtml(faq.q(city, stateDisplay, siteName))}</h3>
        <p class="faq-a">${escHtml(faq.a(city, stateDisplay, siteName))}</p>
      </article>`).join("")}
    </div>
  </section>

  <!-- CTA banner -->
  <section class="cta-banner" aria-label="Call to action">
    <h2>Ready to connect in ${escHtml(city)}, ${escHtml(stateCode)}?</h2>
    <p>Real local ${escHtml(cfg.pronoun)} in the ${escHtml(city)} area are on the line right now. Your first call is free — no credit card, no commitment.</p>
    ${phone ? `<p class="cta-phone">📞 <a href="tel:${phoneRaw}">${escHtml(phone)}</a></p>` : ""}
    <a href="${phoneRaw ? `tel:${phoneRaw}` : "/"}" class="btn-primary" style="font-size:1.05rem;padding:16px 40px;" aria-label="${escAttr(cfg.ctaText)} — ${escAttr(siteName)} ${escAttr(city)}">
      ${escHtml(cfg.ctaText)} →
    </a>
  </section>
  </main>

  <!-- Sitemap / internal links -->
  ${allActiveRegions.length > 1 ? `
  <nav class="sitemap" aria-label="All local chat line numbers">
    <div class="sitemap-inner">
      <p class="sitemap-title">All Local Numbers — ${escHtml(siteName)}</p>
      <ul class="sitemap-links" style="list-style:none;padding:0;">
        ${sitemapLinks}
        <li><a href="/" class="sitemap-link">${escHtml(siteName)} Home</a></li>
      </ul>
    </div>
  </nav>` : ""}

  <!-- Footer -->
  <footer>
    <p>&copy; <time datetime="${today}">${new Date().getFullYear()}</time> ${escHtml(siteName)} — ${escHtml(city)}, ${escHtml(stateDisplay)}</p>
    <nav class="footer-links" aria-label="Footer links">
      <a href="/">Home</a>
      <a href="/privacy-policy">Privacy Policy</a>
      <a href="/terms-of-service">Terms of Service</a>
      ${allActiveRegions.length > 1 ? `<a href="/regions/">All Local Numbers</a>` : ""}
    </nav>
  </footer>

</body>
</html>`;
}

// ── Home page generator ────────────────────────────────────────────────────

export function generateHomePage(
  siteSettings: SiteSettings,
  allRegions: Region[],
  siteUrl = "https://example.com",
  localData?: {
    phoneNumber?: string | null;
    city?: string | null;
    state?: string | null;
    regionName?: string | null;
  },
): string {
  const cfg = getContentConfig(siteSettings.siteCategory);
  const siteName = siteSettings.siteName;
  const isMM = siteSettings.siteCategory !== "MW";
  const color = "#2563EB";
  const colorLight = "#3B82F6";
  const today = new Date().toISOString().split("T")[0];
  const year = new Date().getFullYear();

  const fallbackPhone = siteSettings.fallbackPhoneNumber ?? "";
  const localPhone = localData?.phoneNumber || fallbackPhone;
  const phone = formatPhone(localPhone);
  const phoneRaw = localPhone.replace(/\D/g, "");
  const cityLabel = localData?.regionName || localData?.city || null;
  const stateLabel = localData?.state || null;
  const cityFull = cityLabel && stateLabel ? `${cityLabel}, ${stateLabel}` : cityLabel;

  const activeRegions = allRegions.filter(r => r.isActive).sort((a, b) => a.name.localeCompare(b.name));

  const metaTitle = isMM
    ? `Gay Chat Line & Gay Party Line | ${siteName} | Free Trial — Talk to Men Now`
    : `${siteName} — Free Phone Chat Line for Singles | Free Trial | Talk to Real People`;

  const metaDesc = isMM
    ? `${siteName} is the #1 free gay chat line and gay party line for men in the US. Talk live to real local guys 24/7 — no app, no credit card, no hassle. Free trial minutes for every new caller. Pick up any phone and call now.`
    : `${siteName} is the free phone chat line connecting singles across the US. Call your local number, record your greeting, and talk to real local men and women — no app, no credit card needed. Free trial for new callers.`;

  const keywords = isMM ? [
    "gay chat line",
    "gay party line",
    "free gay chat line",
    "gay phone chat",
    "gay chatline",
    "free gay party line",
    "men to men chat line",
    "gay male chat line",
    "gay chat line free trial",
    "gay phone dating",
    "gay men chat line",
    "m4m chat line",
    "gay voice chat",
    "gay phone line",
    "men seeking men chat line",
    "adult gay chat line",
    "local gay chat line",
    "gay phone personals",
    "gay chat line number",
    "free gay men chat",
    "gay chat line 24 hours",
    "gay chat line no credit card",
    siteName.toLowerCase(),
  ].join(", ") : [
    siteName.toLowerCase(),
    "phone chat line for singles",
    "free singles chat line",
    "free trial phone chat",
    "local phone chat",
    "men and women chat line",
    "adult phone chat free",
    "local chat line numbers",
    "phone dating service",
    "voice chat line",
  ].join(", ");

  const h1 = isMM
    ? `${siteName} — Gay Chat Line & Gay Party Line. Free Trial. Real Men. 24/7.`
    : `${siteName} — Talk to Real Local Singles. Free Trial. No App.`;

  const tagline = isMM
    ? `The free gay chat line and gay party line for men across the US. Real guys, live conversation, no apps — just pick up any phone and call.`
    : `The free phone chat line for singles across the US. Real people, live conversation, 24 hours a day — just pick up your phone and call.`;

  // Structured data
  const websiteJsonLd = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": `${siteUrl}/#website`,
    "url": siteUrl,
    "name": siteName,
    "description": metaDesc,
    "inLanguage": "en-US",
    "dateModified": today,
    "potentialAction": {
      "@type": "SearchAction",
      "target": { "@type": "EntryPoint", "urlTemplate": `${siteUrl}/regions/` },
      "query-input": "required name=search_term_string",
    },
  };

  const orgJsonLd = {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": `${siteUrl}/#organization`,
    "name": siteName,
    "alternateName": isMM
      ? [`${siteName} Gay Chat Line`, `${siteName} Gay Party Line`, "Free Gay Chat Line", "Gay Phone Chat Line"]
      : [`${siteName} Singles Chat Line`, "Free Phone Chat Line", "Singles Party Line"],
    "url": siteUrl,
    "description": metaDesc,
    "contactPoint": phoneRaw ? [{
      "@type": "ContactPoint",
      "telephone": `+1${phoneRaw}`,
      "contactType": "customer service",
      "availableLanguage": "English",
      "hoursAvailable": { "@type": "OpeningHoursSpecification", "dayOfWeek": ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"], "opens": "00:00", "closes": "23:59" },
    }] : undefined,
  };

  const serviceJsonLd = {
    "@context": "https://schema.org",
    "@type": "Service",
    "name": isMM ? `${siteName} — Free Gay Chat Line & Gay Party Line` : `${siteName} Phone Chat Line`,
    "alternateName": isMM
      ? ["Gay Chat Line", "Gay Party Line", "Free Gay Phone Chat", "Gay Men Chat Line", "M4M Chat Line"]
      : ["Singles Chat Line", "Free Phone Chat Line"],
    "url": siteUrl,
    "description": metaDesc,
    "provider": { "@type": "Organization", "name": siteName, "url": siteUrl },
    "serviceType": isMM ? "Gay Phone Chat Line" : "Singles Phone Chat Line",
    "category": isMM ? "Gay Chat Line" : "Singles Chat Line",
    "areaServed": { "@type": "Country", "name": "United States" },
    "audience": {
      "@type": "Audience",
      "audienceType": isMM ? "Gay and Bisexual Men" : "Singles",
    },
    "offers": {
      "@type": "Offer",
      "name": "Free Trial",
      "price": "0",
      "priceCurrency": "USD",
      "description": isMM
        ? "Free trial minutes for all new gay chat line callers — no credit card required"
        : "Free trial minutes for all new callers — no credit card required",
      "availability": "https://schema.org/InStock",
      "eligibleRegion": { "@type": "Country", "name": "United States" },
    },
    "hasOfferCatalog": {
      "@type": "OfferCatalog",
      "name": `${siteName} Features`,
      "itemListElement": cfg.features.map((f, i) => ({
        "@type": "Offer",
        "position": i + 1,
        "name": f,
        "price": "0",
        "priceCurrency": "USD",
      })),
    },
  };

  const howToJsonLd = {
    "@context": "https://schema.org",
    "@type": "HowTo",
    "name": `How to Use ${siteName}`,
    "description": `Step-by-step guide to connecting with local ${cfg.pronoun} on ${siteName}.`,
    "totalTime": "PT5M",
    "supply": [{ "@type": "HowToSupply", "name": "Any telephone — smartphone, cell phone, or landline" }],
    "step": cfg.howToSteps.map((s, i) => ({
      "@type": "HowToStep",
      "position": i + 1,
      "name": s.name,
      "text": s.text("your city", siteName),
    })),
  };

  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": cfg.faqs.map(faq => ({
      "@type": "Question",
      "name": faq.q("your city", "your state", siteName),
      "acceptedAnswer": {
        "@type": "Answer",
        "text": faq.a("your city", "your state", siteName),
      },
    })),
  };

  const regionLinks = activeRegions.map(r => {
    const sc = r.stateAbbreviation ?? "";
    const ph = formatPhone(r.phoneNumber);
    return `
      <li>
        <a href="/regions/${encodeURIComponent(r.slug)}.html" class="region-card">
          <span class="region-name">${escHtml(r.name)}${sc ? `, ${escHtml(sc)}` : ""}</span>
          ${ph ? `<span class="region-phone">${escHtml(ph)}</span>` : ""}
          <span class="region-arrow">→</span>
        </a>
      </li>`;
  }).join("");

  return `<!DOCTYPE html>
<html lang="en-US">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />

  <!-- Primary SEO -->
  <title>${escHtml(metaTitle)}</title>
  <meta name="description" content="${escAttr(metaDesc)}" />
  <meta name="keywords" content="${escAttr(keywords)}" />
  <link rel="canonical" href="${escAttr(siteUrl)}/" />
  <meta name="robots" content="index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1" />
  <meta name="author" content="${escAttr(siteName)}" />
  <meta name="revisit-after" content="7 days" />

  <!-- Open Graph -->
  <meta property="og:type" content="website" />
  <meta property="og:url" content="${escAttr(siteUrl)}/" />
  <meta property="og:title" content="${escAttr(metaTitle)}" />
  <meta property="og:description" content="${escAttr(metaDesc)}" />
  <meta property="og:site_name" content="${escAttr(siteName)}" />
  <meta property="og:locale" content="en_US" />
  <meta property="og:image" content="${escAttr(siteUrl)}/${isMM ? "hero_mm.png" : "hero_mw.png"}" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta name="twitter:image" content="${escAttr(siteUrl)}/${isMM ? "hero_mm.png" : "hero_mw.png"}" />

  <!-- Twitter Card -->
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${escAttr(metaTitle)}" />
  <meta name="twitter:description" content="${escAttr(metaDesc)}" />

  <!-- Structured Data -->
  <script type="application/ld+json">${JSON.stringify(websiteJsonLd)}</script>
  <script type="application/ld+json">${JSON.stringify(orgJsonLd)}</script>
  <script type="application/ld+json">${JSON.stringify(serviceJsonLd)}</script>
  <script type="application/ld+json">${JSON.stringify(howToJsonLd)}</script>
  <script type="application/ld+json">${JSON.stringify(faqJsonLd)}</script>

  <!-- Preload hero image for LCP performance (Core Web Vitals) -->
  <link rel="preload" as="image" href="/${isMM ? "hero_mm.png" : "hero_mw.png"}" fetchpriority="high" />

  <!-- Fonts -->
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link rel="preload" as="style" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet" />

  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    html { scroll-behavior: smooth; font-size: 16px; }
    body { font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0a0a0a; color: #f0f0f0; line-height: 1.6; }
    a { color: inherit; text-decoration: none; }

    /* ── NAV (matches Landing.tsx) ── */
    .nav { background: #000; position: sticky; top: 0; z-index: 100; border-bottom: 1px solid #1a1a1a; }
    .nav-inner { max-width: 1200px; margin: 0 auto; padding: 0 1.5rem; display: flex; align-items: center; justify-content: space-between; min-height: 79px; }
    .nav-brand { display: flex; align-items: center; gap: 0.625rem; text-decoration: none; }
    .nav-wordmark { font-size: 1.15rem; font-weight: 900; letter-spacing: -0.02em; color: #fff; }
    .nav-wordmark .box { background: linear-gradient(135deg, #3b82f6 0%, #7c3aed 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; }
    .nav-right { display: flex; align-items: center; gap: 1.5rem; font-size: 0.95rem; font-weight: 500; }
    .nav-link { color: #ccc; text-decoration: none; }
    .nav-link:hover { color: #fff; }
    .nav-divider { width: 1px; height: 18px; background: #222; display: inline-block; }
    .nav-btn { background: #1d4ed8; color: #fff; text-decoration: none; font-size: 0.92rem; font-weight: 700; padding: 0.4rem 0.875rem; border-radius: 7px; }
    .nav-btn:hover { background: #1e40af; }

    /* ── HERO (matches Landing.tsx) ── */
    .hero { position: relative; overflow: hidden; min-height: 260px; background-color: #0d0d0d; }
    @media (min-width: 768px) { .hero { min-height: 480px; } }
    .hero-bg { display: block; position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; object-position: right center; filter: saturate(0.9) brightness(0.95); }
    .hero-overlay { position: absolute; inset: 0; background: rgba(0,0,0,0.45); }
    .hero-fade { position: absolute; bottom: 0; left: 0; right: 0; height: 80px; background: linear-gradient(to top, #0d0d0d, transparent); }
    .hero-content { position: relative; z-index: 10; width: 100%; min-height: 260px; display: flex; align-items: flex-start; padding: 2rem 1rem 2.5rem 1rem; }
    @media (min-width: 768px) { .hero-content { min-height: 480px; padding: 3.5rem 4rem 2.5rem; } }
    .hero-box { max-width: 560px; }
    .hero-age { font-size: clamp(0.7rem, 2vw, 0.85rem); color: rgba(255,255,255,0.55); margin-bottom: 0.75rem; font-weight: 400; letter-spacing: 0.04em; }
    .hero h1 { font-size: clamp(1.8rem, 5vw, 2.8rem); font-weight: 800; letter-spacing: -0.01em; line-height: 1.15; margin-bottom: 1rem; color: #fff; text-shadow: 2px 2px 0 #000,-2px -2px 0 #000,2px -2px 0 #000,-2px 2px 0 #000,3px 3px 0 #000; }
    .hero-pill { display: inline-block; background: rgba(255,255,255,0.12); backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); border: 1px solid rgba(255,255,255,0.2); border-radius: 6px; padding: 0.35rem 0.9rem; margin-bottom: 2.5rem; }
    .hero-pill p { font-size: 0.95rem; color: rgba(255,255,255,0.85); font-weight: 400; margin: 0; }
    .hero-city { font-size: clamp(0.95rem, 4vw, 1.64rem); color: rgba(255,255,255,0.75); font-weight: 400; margin-bottom: 0.2rem; text-shadow: 1px 1px 0 #000,-1px -1px 0 #000,1px -1px 0 #000,-1px 1px 0 #000; }
    .hero-city strong { color: #fff; font-weight: 700; }
    .hero-phone { display: inline-block; font-size: clamp(1.75rem, 4vw, 2.7rem); color: #fff; text-decoration: none; letter-spacing: 0.01em; line-height: 1.1; text-shadow: 2px 2px 0 #000,-2px -2px 0 #000,2px -2px 0 #000,-2px 2px 0 #000,3px 3px 0 #000; }
    .hero-phone .light { font-weight: 400; }
    .hero-phone .bold { font-weight: 900; }

    /* ── INTRO ── */
    .intro { background: #f4f4f4; padding: 3.5rem 1.5rem; text-align: center; }
    .intro-inner { max-width: 760px; margin: 0 auto; }
    .intro h2 { font-size: clamp(1.4rem, 3vw, 2rem); font-weight: 800; color: #111; line-height: 1.35; margin-bottom: 1.25rem; }
    .intro p { font-size: 1rem; color: #444; line-height: 1.75; margin-bottom: 1.5rem; }
    .intro-cta { font-size: 1.25rem; font-weight: 800; color: #1d6fa8; text-decoration: none; }

    /* ── TAGLINE BAR ── */
    .tagline-bar { background: #1a1a1a; padding: 1.75rem 1.5rem; text-align: center; border-top: 1px solid #2a2a2a; border-bottom: 1px solid #2a2a2a; }
    .tagline-bar h2 { font-size: clamp(1rem, 2.5vw, 1.4rem); font-weight: 800; letter-spacing: 0.05em; text-transform: uppercase; color: #fff; margin-bottom: 0.4rem; line-height: 1.3; }
    .tagline-bar .city-accent { color: #3b82f6; }
    .tagline-sub { display: flex; align-items: center; justify-content: center; gap: 1.5rem; font-size: 0.9rem; color: rgba(255,255,255,0.6); margin-top: 0.5rem; flex-wrap: wrap; }

    /* ── SECTIONS (SEO content) ── */

    /* Sections */
    .section { max-width: 1100px; margin: 0 auto; padding: 72px 24px; }
    .section-label { font-size: 0.72rem; font-weight: 700; letter-spacing: 0.15em; text-transform: uppercase; color: ${colorLight}; margin-bottom: 10px; }
    .section > h2 { font-size: clamp(1.5rem, 3.5vw, 2.1rem); font-weight: 800; letter-spacing: -0.02em; margin-bottom: 14px; color: #fff; }
    .section > p { color: rgba(255,255,255,0.5); font-size: 1.02rem; max-width: 640px; line-height: 1.8; margin-bottom: 40px; }

    /* Features */
    .features-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 12px; }
    .feature-card { background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.07); border-radius: 12px; padding: 18px 20px; display: flex; align-items: flex-start; gap: 12px; }
    .feature-check { width: 22px; height: 22px; flex-shrink: 0; background: ${color}22; color: ${colorLight}; border-radius: 6px; display: flex; align-items: center; justify-content: center; font-size: 0.8rem; font-weight: 900; margin-top: 1px; }
    .feature-card p { font-size: 0.92rem; color: rgba(255,255,255,0.62); margin: 0; }

    /* How-to */
    .howto-steps { margin-top: 40px; display: flex; flex-direction: column; gap: 0; }
    .howto-step { display: flex; align-items: flex-start; gap: 20px; padding: 24px 0; border-bottom: 1px solid rgba(255,255,255,0.05); }
    .howto-step:first-child { padding-top: 0; }
    .howto-step:last-child { border-bottom: none; }
    .step-num { width: 36px; height: 36px; flex-shrink: 0; background: ${color}; color: #fff; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 0.9rem; font-weight: 900; margin-top: 2px; }
    .step-body h3 { font-size: 1rem; font-weight: 700; color: #fff; margin-bottom: 6px; }
    .step-body p { font-size: 0.93rem; color: rgba(255,255,255,0.5); line-height: 1.75; margin: 0; }

    /* Content blocks */
    .content-blocks { border-top: 1px solid rgba(255,255,255,0.05); }
    .content-block { max-width: 1100px; margin: 0 auto; padding: 64px 24px; border-bottom: 1px solid rgba(255,255,255,0.05); }
    .content-block h2 { font-size: clamp(1.4rem, 3vw, 2rem); font-weight: 800; letter-spacing: -0.02em; margin-bottom: 16px; color: #fff; line-height: 1.2; }
    .content-block p { color: rgba(255,255,255,0.55); font-size: 1.01rem; line-height: 1.85; max-width: 780px; }

    /* Local numbers */
    .local-numbers { background: rgba(255,255,255,0.015); border-top: 1px solid rgba(255,255,255,0.06); padding: 72px 24px; }
    .local-numbers-inner { max-width: 1100px; margin: 0 auto; }
    .local-numbers h2 { font-size: clamp(1.5rem, 3.5vw, 2.1rem); font-weight: 800; letter-spacing: -0.02em; margin-bottom: 10px; color: #fff; }
    .local-numbers > .local-numbers-inner > p { color: rgba(255,255,255,0.4); font-size: 0.95rem; margin-bottom: 32px; }
    .regions-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 8px; list-style: none; padding: 0; margin-top: 28px; }
    .region-card { display: flex; align-items: center; gap: 12px; padding: 14px 18px; border: 1px solid rgba(255,255,255,0.07); border-radius: 10px; background: rgba(255,255,255,0.03); transition: background 0.2s, border-color 0.2s; }
    .region-card:hover { background: rgba(255,255,255,0.06); border-color: rgba(255,255,255,0.14); }
    .region-name { font-weight: 600; color: #fff; flex: 1; font-size: 0.92rem; }
    .region-phone { font-size: 0.82rem; color: ${colorLight}; font-weight: 600; }
    .region-arrow { color: rgba(255,255,255,0.2); font-size: 0.9rem; }
    .view-all-link { display: inline-flex; align-items: center; gap: 6px; margin-top: 24px; font-size: 0.9rem; color: ${colorLight}; font-weight: 600; }
    .view-all-link:hover { text-decoration: underline; }

    /* FAQ */
    .faq-section { background: #080808; }
    .faq-inner { max-width: 860px; margin: 0 auto; padding: 80px 24px; }
    .faq-inner > h2 { font-size: clamp(1.5rem, 3.5vw, 2.1rem); font-weight: 800; letter-spacing: -0.02em; margin-bottom: 10px; text-align: center; color: #fff; }
    .faq-sub { text-align: center; color: rgba(255,255,255,0.35); font-size: 0.95rem; margin-bottom: 48px; }
    .faq-item { border-top: 1px solid rgba(255,255,255,0.07); padding: 28px 0; }
    .faq-item:last-child { border-bottom: 1px solid rgba(255,255,255,0.07); }
    .faq-q { font-size: 1rem; font-weight: 700; margin-bottom: 12px; color: #fff; }
    .faq-a { color: rgba(255,255,255,0.5); font-size: 0.95rem; line-height: 1.85; }

    /* ── BOTTOM CTA (matches Landing.tsx) ── */
    .cta-banner { padding: 5rem 1.5rem; background: #111; text-align: center; border-top: 1px solid #1e1e1e; }
    .cta-banner h2 { font-size: clamp(1.5rem, 3.5vw, 2.2rem); font-weight: 900; letter-spacing: -0.01em; margin-bottom: 0.75rem; color: #fff; text-transform: uppercase; }
    .cta-banner p { font-size: 0.95rem; color: #fff; margin-bottom: 2rem; line-height: 1.65; }
    .btn-primary { display: inline-flex; align-items: center; gap: 0.6rem; background: #1d4ed8; color: #fff; border-radius: 6px; padding: 0.9rem 2.5rem; font-size: 1.1rem; font-weight: 800; text-decoration: none; letter-spacing: 0.01em; }
    .btn-primary:hover { background: #1e40af; }

    /* ── FOOTER (matches Landing.tsx) ── */
    footer { background: #080808; border-top: 1px solid #1a1a1a; padding: 3rem 1.5rem 2rem; }
    .footer-inner { max-width: 1000px; margin: 0 auto; }
    .footer-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 2rem; margin-bottom: 2.5rem; }
    .footer-brand { display: flex; align-items: center; gap: 0.625rem; margin-bottom: 0.75rem; }
    .footer-blurb { font-size: 0.78rem; color: rgba(255,255,255,0.3); line-height: 1.65; }
    .footer-col-heading { font-size: 0.68rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; color: rgba(255,255,255,0.3); margin-bottom: 0.75rem; }
    .footer-links-col { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 0.45rem; }
    .footer-links-col a { font-size: 0.82rem; color: rgba(255,255,255,0.45); text-decoration: none; }
    .footer-links-col a:hover { color: #fff; }
    .footer-bottom { border-top: 1px solid #1a1a1a; padding-top: 1.5rem; display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 0.75rem; }
    .footer-bottom p { font-size: 0.75rem; color: rgba(255,255,255,0.2); }

    @media (max-width: 767px) { .nav-right { display: none; } }
    @media (max-width: 640px) {
      .features-grid { grid-template-columns: 1fr; }
      .regions-grid { grid-template-columns: 1fr; }
      .footer-grid { grid-template-columns: 1fr 1fr; }
    }
  </style>
</head>
<body>

  <!-- Navigation (matches Landing.tsx) -->
  <nav class="nav" aria-label="Main navigation">
    <div class="nav-inner">
      <a href="/" class="nav-brand">
        <svg width="38" height="38" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" style="flex-shrink:0">
          <rect width="64" height="64" rx="14" fill="#0f172a"/>
          <rect x="6" y="6" width="52" height="52" rx="11" fill="url(#mb-grad-ssr)"/>
          <path d="M15 46V18l11 15 6-9 6 9 11-15v28" stroke="#ffffff" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
          <defs>
            <linearGradient id="mb-grad-ssr" x1="6" y1="6" x2="58" y2="58" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stop-color="#1d4ed8"/>
              <stop offset="100%" stop-color="#7c3aed"/>
            </linearGradient>
          </defs>
        </svg>
        <span class="nav-wordmark"><span style="font-weight:900;letter-spacing:-0.02em;color:#fff">Male</span><span class="box" style="font-weight:900;letter-spacing:-0.02em">Box</span></span>
      </a>
      <div class="nav-right">
        <a href="/membership" class="nav-link">Buy Time</a>
        <span class="nav-divider"></span>
        <a href="/faq" class="nav-link">FAQ</a>
        <span class="nav-divider"></span>
        <a href="/login" class="nav-link">Log in</a>
        <a href="/register" class="nav-btn">Register</a>
      </div>
    </div>
  </nav>

  <!-- Hero (matches Landing.tsx) -->
  <main>
  <section class="hero" aria-labelledby="hero-h1">
    <img class="hero-bg" src="${isMM ? "/hero_mm.png" : "/hero_mw.png"}" alt="${isMM ? "Man on the phone" : "Woman smiling on the phone"}" />
    <div class="hero-overlay"></div>
    <div class="hero-fade"></div>
    <div class="hero-content">
      <div class="hero-box">
        <p class="hero-age">All users must be 18 years or older</p>
        <h1 id="hero-h1">${isMM ? "Free Gay Chat Line —<br />Talk to Real Local Guys" : "Free Chat Line —<br />Talk to Real Local Singles"}<br />Right Now — Try It Free!</h1>
        <div class="hero-pill">
          <p>No credit card required</p>
        </div>
        ${phone ? `
        <p class="hero-city">Your local <strong>${escHtml(cityFull || "area")}</strong> access number</p>
        <a class="hero-phone" href="tel:+1${phoneRaw}">
          <span class="light">Call </span><span class="bold">${escHtml(phone)}</span>
        </a>` : ""}
      </div>
    </div>
  </section>

  <!-- Intro blurb -->
  <section class="intro">
    <div class="intro-inner">
      <h2>${isMM ? `${escHtml(siteName)} — The Free Gay Chat Line &amp; Gay Party Line for Men in the US` : `${escHtml(siteName)} — The Free Phone Chat Line for Singles Across the US`}</h2>
      <p>${isMM ? `${escHtml(siteName)} is a place where you can chat with real men looking to meet men. The Connection booth is where the action is with real guys who are on the line right now. ${escHtml(siteName)} is the go-to outlet for men seeking men.` : `${escHtml(siteName)} is a place where real men and women connect over the phone. Whether you're a man looking to meet women, or a woman looking to meet men, real people are on the line right now. ${escHtml(siteName)} is your go-to live chat line for singles of all kinds.`}</p>
      ${phone ? `<a class="intro-cta" href="tel:+1${phoneRaw}">Try it FOR FREE!</a>` : ""}
    </div>
  </section>

  <!-- Tagline bar -->
  <section class="tagline-bar">
    <h2>${isMM ? "A gay, bi and curious live chat line in" : "A live chat line for men and women in"} <span class="city-accent">${escHtml(cityFull || "your area")}</span></h2>
    <div class="tagline-sub">
      <span>${isMM ? "Real guys just like you" : "Real men &amp; real women"}</span>
      <svg width="22" height="22" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg"><rect width="64" height="64" rx="14" fill="#0f172a"/><rect x="6" y="6" width="52" height="52" rx="11" fill="url(#mb-tag)"/><path d="M15 46V18l11 15 6-9 6 9 11-15v28" stroke="#ffffff" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/><defs><linearGradient id="mb-tag" x1="6" y1="6" x2="58" y2="58" gradientUnits="userSpaceOnUse"><stop offset="0%" stop-color="#1d4ed8"/><stop offset="100%" stop-color="#7c3aed"/></linearGradient></defs></svg>
      <span>${isMM ? "Freedom to be yourself" : "Connect with someone near you"}</span>
    </div>
  </section>

  <!-- Features -->
  <section class="section" aria-labelledby="features-h2">
    <p class="section-label">${escHtml(siteName)} Features</p>
    <h2 id="features-h2">Everything included — free to try</h2>
    <p>No apps, no profiles, no swiping. Just pick up any phone, call your local access number, and start talking to real ${escHtml(cfg.pronoun)} in your area.</p>
    <div class="features-grid" role="list">
      ${cfg.features.map(f => `
      <article class="feature-card" role="listitem">
        <div class="feature-check" aria-hidden="true">✓</div>
        <p>${escHtml(f)}</p>
      </article>`).join("")}
    </div>
  </section>

  <!-- How It Works -->
  <section id="how-it-works" class="section" style="padding-top:0;" aria-labelledby="howto-h2">
    <p class="section-label">Getting Started</p>
    <h2 id="howto-h2">How ${escHtml(siteName)} works</h2>
    <p>You can go from first call to a real live conversation in under five minutes. Here's exactly how it works:</p>
    <ol class="howto-steps">
      ${cfg.howToSteps.map((s, i) => `
      <li class="howto-step">
        <div class="step-num" aria-hidden="true">${i + 1}</div>
        <div class="step-body">
          <h3>${escHtml(s.name)}</h3>
          <p>${escHtml(s.text("your city", siteName))}</p>
        </div>
      </li>`).join("")}
    </ol>
  </section>

  <!-- Content H2 blocks -->
  <div class="content-blocks">
    ${!isMM ? cfg.h2s.map(block => `
    <article class="content-block">
      <h2>${escHtml(block.heading("singles across", "the US", siteName))}</h2>
      <p>${escHtml(block.body("singles across", "the US", siteName))}</p>
    </article>`).join("") : ""}
    ${isMM ? `
    <article class="content-block">
      <h2>What Is a Gay Chat Line? How It Works in 2025</h2>
      <p>A gay chat line is a phone-based service where gay and bisexual men can connect with each other through live voice calls, recorded greetings, and private voice messages — all without using an app or creating an online profile. You simply dial a local access number, record a short greeting introducing yourself, and you're immediately placed into a live community of real men in your area. You can browse other guys' greetings, leave private voice messages for anyone who interests you, or request a live two-way connection. When both callers agree, ${escHtml(siteName)} bridges you together instantly and privately. The entire experience runs through your phone — any phone — and your personal number is never revealed to other callers. Gay chat lines have been connecting men for decades, and ${escHtml(siteName)} is the modern evolution of that tradition: faster, safer, and available 24 hours a day.</p>
    </article>
    <article class="content-block">
      <h2>Gay Party Line vs. Gay Chat Line — What's the Difference?</h2>
      <p>The terms "gay party line" and "gay chat line" are often used interchangeably, but there is a subtle difference worth knowing. A gay party line traditionally refers to a multi-caller phone line where several men can join the same "room" and talk together simultaneously — like a group phone call. A gay chat line, by contrast, is typically a one-on-one connection service where you browse greetings privately and connect individually with men who interest you. ${escHtml(siteName)} operates as a gay chat line: your conversations are always private and one-on-one, which means you get real, focused conversation with one real man at a time — not a noisy group call where it's hard to connect meaningfully. Most men who search for a "gay party line" are actually looking for exactly what ${escHtml(siteName)} offers: a live, voice-based service for meeting other gay men by phone. Whatever you call it, ${escHtml(siteName)} is the answer.</p>
    </article>
    <article class="content-block">
      <h2>Free Gay Chat Line — What the Free Trial Actually Includes</h2>
      <p>Every new caller on ${escHtml(siteName)} receives a block of free trial minutes the moment they first call in — no credit card required, no sign-up form, nothing to download. During your free trial you get full access to everything the service offers: recording your personal greeting, browsing the greetings of other gay men in your area, sending private voice messages to anyone who catches your attention, and going live with someone for a real two-way conversation. The free trial is a genuine, no-strings introduction to the ${escHtml(siteName)} community. It's not a teaser that cuts off after 30 seconds — you get real time to explore and connect. After your free trial minutes are used, you can choose from affordable monthly membership plans to keep chatting. There are no hidden fees, no auto-renewals without your knowledge, and no contracts. If you've been searching for a free gay chat line, this is the one that actually delivers.</p>
    </article>
    <article class="content-block">
      <h2>Why Gay Men Choose ${escHtml(siteName)} Over Dating Apps</h2>
      <p>Dating apps for gay men have become overcrowded, superficial, and exhausting. Hours spent crafting the perfect profile, waiting for matches, exchanging text messages for days before finding out there's no chemistry — it's a process that strips the joy out of meeting someone new. ${escHtml(siteName)} works the opposite way. You hear a man's actual voice within seconds of calling. His personality, his energy, his sense of humor — all of it is right there in his greeting, immediate and impossible to fake. There are no photos to obsess over, no filters to swipe through, and no algorithm deciding who you get to see. You're in direct control of who you listen to, who you message, and who you connect with live. For gay men who value real conversation over curated profiles — or who simply want to meet someone without the performance anxiety of an app — ${escHtml(siteName)} is a completely different experience. Private, fast, and refreshingly human.</p>
    </article>
    <article class="content-block">
      <h2>Gay Chat Line Safety: Your Privacy Is Fully Protected</h2>
      <p>Privacy is one of the most important concerns for gay men using any chat or dating service, and ${escHtml(siteName)} takes it seriously at every level. Your personal phone number is never displayed to other callers under any circumstances — all calls are routed through ${escHtml(siteName)}'s private network. Other members only know you by the screen name you record in your greeting, which you can change at any time. You're never required to share any personal information — no email address, no real name, no location beyond the general area you call from. You have complete control over every interaction: you choose who you reply to, how long you talk, and you can block any caller permanently with a single keypress. That block is immediate and permanent — the blocked caller can never reach you again. Whether you're out and proud, privately exploring, or anywhere in between, ${escHtml(siteName)} gives you a safe, anonymous space to connect with other gay men on your own terms.</p>
    </article>` : ""}
  </div>

  <!-- Local numbers -->
  ${activeRegions.length > 0 ? `
  <section class="local-numbers" aria-labelledby="local-numbers-h2">
    <div class="local-numbers-inner">
      <p class="section-label">Local Access Numbers</p>
      <h2 id="local-numbers-h2">Find your local ${isMM ? "gay chat line" : escHtml(siteName)} number</h2>
      <p style="color:rgba(255,255,255,0.4);font-size:0.95rem;margin-bottom:0;">${escHtml(siteName)} has local${isMM ? " gay chat line" : ""} access numbers across the US. Pick the city nearest you and call free today.</p>
      <ul class="regions-grid">${regionLinks}</ul>
      <a href="/regions/" class="view-all-link">View all local numbers →</a>
    </div>
  </section>` : ""}

  <!-- FAQ -->
  <section class="faq-section" aria-labelledby="faq-h2">
    <div class="faq-inner">
      <h2 id="faq-h2">Frequently Asked Questions${isMM ? " — Gay Chat Line & Gay Party Line" : ""}</h2>
      <p class="faq-sub">Common questions about ${escHtml(siteName)}${isMM ? " — the free gay chat line" : ""}</p>
      ${isMM ? `
      <article class="faq-item">
        <h3 class="faq-q">What is a gay chat line?</h3>
        <p class="faq-a">A gay chat line is a phone-based service where gay and bisexual men connect with each other through live voice calls and private voice messages — no app or internet required. You dial a local access number, record a short personal greeting, and are placed into a live community of real men in your area. You can browse greetings, leave messages, or connect live with any guy who interests you. ${escHtml(siteName)} is one of the best free gay chat lines available, with local numbers across the US and free trial minutes for every new caller.</p>
      </article>
      <article class="faq-item">
        <h3 class="faq-q">What is a gay party line and how is it different from a gay chat line?</h3>
        <p class="faq-a">A gay party line typically refers to a multi-caller group phone line where several men talk together simultaneously. A gay chat line like ${escHtml(siteName)} connects men one-on-one for private conversations. Most men searching for a "gay party line" are looking for a live voice service to meet other gay men by phone — which is exactly what ${escHtml(siteName)} provides, with the added benefit of genuine private, one-on-one conversations rather than a noisy group call.</p>
      </article>
      <article class="faq-item">
        <h3 class="faq-q">Is ${escHtml(siteName)} really a free gay chat line?</h3>
        <p class="faq-a">Yes — ${escHtml(siteName)} gives every new caller free trial minutes with zero credit card required. During your free trial you get complete access: record your greeting, browse other guys' greetings, send voice messages, and even connect live. After the trial, affordable month-to-month plans are available. No contracts, no hidden fees, no surprises.</p>
      </article>
      <article class="faq-item">
        <h3 class="faq-q">What is the best gay chat line available right now?</h3>
        <p class="faq-a">${escHtml(siteName)} is designed to be the best free gay chat line in the US — offering local access numbers in cities across the country, free trial minutes for new callers, 24/7 availability, and complete privacy protection. Unlike older gay party lines, ${escHtml(siteName)} uses modern private-network routing so your phone number is never exposed. The community is active around the clock, which means there are always real men on the line no matter when you call.</p>
      </article>
      <article class="faq-item">
        <h3 class="faq-q">Do I need to use an app or the internet to use the gay chat line?</h3>
        <p class="faq-a">No app or internet connection is required. ${escHtml(siteName)} is entirely phone-based — all you need is any phone (smartphone, basic cell phone, or landline) to call your local gay chat line access number. There's no profile to create, no photos to upload, and no software to install. If you can make a phone call, you can use ${escHtml(siteName)}.</p>
      </article>
      <article class="faq-item">
        <h3 class="faq-q">Is the gay chat line available 24 hours a day?</h3>
        <p class="faq-a">Yes — ${escHtml(siteName)} is available 24 hours a day, 7 days a week, 365 days a year. The community is most active in the evenings and on weekends, but there are always real men on the line regardless of when you call. Your personal greeting stays active in the system even when you're not on the call, so other guys can leave you messages at any time and you can reply whenever it's convenient.</p>
      </article>
      <article class="faq-item">
        <h3 class="faq-q">Will other callers know my real phone number?</h3>
        <p class="faq-a">Never. ${escHtml(siteName)} routes all calls through a private network that completely hides your personal phone number from every other caller. You're known only by the screen name you record in your greeting. Your real identity and contact information remain entirely private throughout every interaction — this is one of the core reasons gay men trust ${escHtml(siteName)} as a safe and discreet way to connect.</p>
      </article>
      ` : cfg.faqs.map(faq => `
      <article class="faq-item">
        <h3 class="faq-q">${escHtml(faq.q("your area", "your state", siteName))}</h3>
        <p class="faq-a">${escHtml(faq.a("your area", "your state", siteName))}</p>
      </article>`).join("")}
    </div>
  </section>

  <!-- CTA banner (matches Landing.tsx) -->
  <section class="cta-banner" aria-label="Call to action">
    <h2>${isMM ? "Start Your Free Gay Chat Line Trial Now" : "Start Your Free Chat Line Trial Now"}</h2>
    <p>${isMM ? "Your first call is free — no credit card, no app, no sign-up. Just pick up any phone and dial your local gay chat line number." : "Your first call is free — no credit card, no app, no sign-up. Just pick up any phone and dial your local number."}</p>
    ${phone ? `<a href="tel:+1${phoneRaw}" class="btn-primary">&#128222; ${escHtml(phone)}</a>` : ""}
  </section>
  </main>

  <!-- Footer (matches Landing.tsx) -->
  <footer>
    <div class="footer-inner">
      <div class="footer-grid">
        <div>
          <div class="footer-brand">
            <svg width="28" height="28" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg"><rect width="64" height="64" rx="14" fill="#0f172a"/><rect x="6" y="6" width="52" height="52" rx="11" fill="url(#mb-ft)"/><path d="M15 46V18l11 15 6-9 6 9 11-15v28" stroke="#ffffff" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/><defs><linearGradient id="mb-ft" x1="6" y1="6" x2="58" y2="58" gradientUnits="userSpaceOnUse"><stop offset="0%" stop-color="#1d4ed8"/><stop offset="100%" stop-color="#7c3aed"/></linearGradient></defs></svg>
            <span style="font-size:0.95rem;font-weight:900;letter-spacing:-0.02em;color:#fff">Male<span style="background:linear-gradient(135deg,#3b82f6 0%,#7c3aed 100%);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text">Box</span></span>
          </div>
          <p class="footer-blurb">${isMM ? "A gay, bi &amp; curious live chat line. Real guys, real voices." : "A live chat line for men and women. Real voices, real conversations."}</p>
        </div>
        <div>
          <p class="footer-col-heading">Account</p>
          <ul class="footer-links-col">
            <li><a href="/membership">Buy Time</a></li>
            <li><a href="/membership">Free Trial</a></li>
            <li><a href="/membership">Memberships</a></li>
          </ul>
        </div>
        <div>
          <p class="footer-col-heading">Help</p>
          <ul class="footer-links-col">
            <li><a href="/support">Customer Support</a></li>
            <li><a href="/faq">FAQ</a></li>
            <li><a href="/keypad-tips">Keypad Tips</a></li>
            <li><a href="/cities">Cities Coverage</a></li>
            <li><a href="/safety-tips">Safety Tips</a></li>
          </ul>
        </div>
        <div>
          <p class="footer-col-heading">Company</p>
          <ul class="footer-links-col">
            <li><a href="/about">About Us</a></li>
            <li><a href="/privacy-policy">Privacy Policy</a></li>
            <li><a href="/terms">Terms of Use</a></li>
          </ul>
        </div>
      </div>
      <div class="footer-bottom">
        <p>&copy; <time datetime="${today}">${year}</time> ${escHtml(siteName)}. All Rights Reserved.</p>
        <p>All callers must be 18 years or older.</p>
      </div>
    </div>
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

// Also write a regions index page listing all active regions
export function writeRegionsIndexPage(allRegions: Region[], siteName: string, siteUrl: string): void {
  const publicDir = path.join(process.cwd(), "client/public");
  if (!fs.existsSync(publicDir)) fs.mkdirSync(publicDir, { recursive: true });
  const activeRegions = allRegions.filter(r => r.isActive).sort((a, b) => a.name.localeCompare(b.name));
  const today = new Date().toISOString().split("T")[0];

  const listItems = activeRegions.map(r => {
    const stateCode = r.stateAbbreviation ?? "";
    const phone = formatPhone(r.phoneNumber);
    return `
    <li>
      <a href="/regions/${r.slug}.html" class="region-card">
        <span class="region-name">${escHtml(r.name)}${stateCode ? `, ${escHtml(stateCode)}` : ""}</span>
        ${phone ? `<span class="region-phone">${escHtml(phone)}</span>` : ""}
        <span class="region-arrow">→</span>
      </a>
    </li>`;
  }).join("");

  const html = `<!DOCTYPE html>
<html lang="en-US">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Local Chat Line Numbers | ${escHtml(siteName)} | All Cities | Interactive Male Phone Chat Line</title>
  <meta name="description" content="Find your local ${escHtml(siteName)} phone chat number. We have local access numbers across the US — find your city and call the interactive male phone chat line free today. ${activeRegions.length} cities available." />
  <link rel="canonical" href="${escAttr(siteUrl)}/regions/" />
  <meta name="robots" content="index, follow" />
  <script type="application/ld+json">${JSON.stringify({
    "@context": "https://schema.org",
    "@type": "ItemList",
    "name": `${siteName} Local Chat Line Numbers`,
    "description": `All local phone chat line access numbers for ${siteName}`,
    "numberOfItems": activeRegions.length,
    "itemListElement": activeRegions.map((r, i) => ({
      "@type": "ListItem",
      "position": i + 1,
      "name": `${r.name}${r.stateAbbreviation ? `, ${r.stateAbbreviation}` : ""}`,
      "url": `${siteUrl}/regions/${r.slug}.html`,
    })),
  })}</script>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0a0a0a; color: #f0f0f0; line-height: 1.6; }
    a { color: inherit; text-decoration: none; }
    .nav { background: rgba(10,10,10,0.96); border-bottom: 1px solid rgba(255,255,255,0.07); padding: 0 24px; height: 60px; display: flex; align-items: center; }
    .nav-inner { max-width: 900px; width: 100%; margin: 0 auto; display: flex; align-items: center; justify-content: space-between; }
    .nav-logo { font-size: 1.1rem; font-weight: 900; color: #fff; }
    .main { max-width: 900px; margin: 0 auto; padding: 56px 24px; }
    .main h1 { font-size: clamp(1.6rem, 4vw, 2.4rem); font-weight: 900; letter-spacing: -0.02em; margin-bottom: 12px; color: #fff; }
    .main > .lead { color: rgba(255,255,255,0.45); font-size: 1rem; margin-bottom: 40px; }
    .regions-list { list-style: none; padding: 0; display: flex; flex-direction: column; gap: 8px; margin-bottom: 56px; }
    .region-card { display: flex; align-items: center; gap: 16px; padding: 16px 20px; border: 1px solid rgba(255,255,255,0.07); border-radius: 10px; background: rgba(255,255,255,0.03); transition: background 0.2s, border-color 0.2s; }
    .region-card:hover { background: rgba(255,255,255,0.06); border-color: rgba(255,255,255,0.14); }
    .region-name { font-weight: 700; color: #fff; flex: 1; }
    .region-phone { font-size: 0.9rem; color: #3B82F6; font-weight: 600; }
    .region-arrow { color: rgba(255,255,255,0.25); font-size: 1rem; }
    .content-section { margin-bottom: 48px; }
    .content-section h2 { font-size: clamp(1.2rem, 3vw, 1.6rem); font-weight: 800; color: #fff; margin-bottom: 14px; letter-spacing: -0.01em; }
    .content-section p { color: rgba(255,255,255,0.55); font-size: 0.975rem; line-height: 1.8; margin-bottom: 12px; }
    footer { text-align: center; padding: 24px; font-size: 0.78rem; color: rgba(255,255,255,0.18); border-top: 1px solid rgba(255,255,255,0.05); }
    footer a { color: rgba(255,255,255,0.28); }
  </style>
</head>
<body>
  <nav class="nav"><div class="nav-inner"><a href="/" class="nav-logo">${escHtml(siteName)}</a><a href="/" style="font-size:0.875rem;color:rgba(255,255,255,0.5);">← Home</a></div></nav>
  <main class="main">
    <h1>Local Chat Line Numbers — ${escHtml(siteName)}</h1>
    <p class="lead">Find your local access number and call the interactive male phone chat line free today. ${activeRegions.length} cit${activeRegions.length === 1 ? "y" : "ies"} available across the US.</p>
    <ul class="regions-list">${listItems}</ul>

    <div class="content-section">
      <h2>What Is ${escHtml(siteName)}? Your Local Interactive Male Phone Chat Line</h2>
      <p>${escHtml(siteName)} is a live voice party line and interactive male phone chat line serving cities across the United States. Every city listed above has its own dedicated local access number, so callers can connect with men in their own area without paying long-distance charges. The phone chat line is active 24 hours a day, 7 days a week — no matter when you call, there are real men on the line ready to connect.</p>
      <p>Unlike gay dating apps that rely on photos and text messages, ${escHtml(siteName)} is a voice-first platform. You hear a real man's voice from the very first second, which means you know immediately whether there's genuine chemistry. It's the phone chat line experience that gay and bi men across the country have trusted for years: real voices, real people, real connection.</p>
    </div>

    <div class="content-section">
      <h2>How to Find Your Local Chat Line Number</h2>
      <p>Select your city from the list above to see the dedicated local access number for your area. Each city page includes the local phone number, calling instructions, and details about the ${escHtml(siteName)} gay chat line community in that region. If your city isn't listed, use the national number shown on our <a href="/" style="color:#3B82F6;">home page</a> — it connects you to the nearest available chat line community.</p>
      <p>All calls are routed through ${escHtml(siteName)}'s private network, so your personal phone number is never revealed to other callers. Whether you call from a smartphone, basic cell phone, or landline, the experience is completely anonymous and secure. New callers receive free trial minutes on their first call — no credit card required.</p>
    </div>

    <div class="content-section">
      <h2>Interactive Male Chat Lines vs. Chat Apps — Why Voice Wins</h2>
      <p>Interactive male chat lines like ${escHtml(siteName)} deliver something no app can replicate: the instant, authentic experience of hearing a real human voice. On a phone chat line, there are no filters, no carefully edited photos, and no text conversations that drag on for days. You pick up the phone, call your local chat line number, record a short greeting, and you're immediately part of a live community of gay and bi men in your area.</p>
      <p>The interactive male phone chat line format also offers complete privacy. Your real phone number is hidden, you're known only by the screen name in your greeting, and you can block any caller instantly with a single keypress. For gay men who value discretion, the phone chat line has always been the gold standard — and ${escHtml(siteName)} is designed to uphold that standard in every city where it operates.</p>
    </div>

    <div class="content-section">
      <h2>Membership Plans &amp; Customer Toll-Free Support</h2>
      <p>After your free trial minutes are used, ${escHtml(siteName)} offers simple, affordable membership plans with no contracts and no hidden fees. Plans are available through our secure online checkout — visit the <a href="/membership" style="color:#3B82F6;">membership page</a> to see current pricing for your area. All plans include full access to the interactive male phone chat line, private voice messaging, and live one-on-one connections.</p>
      <p>If you have questions about your membership, billing, or how to use the chat line, our customer support team is available through the voice system (press 7 from the main menu) and via email. We're committed to making sure every caller on the ${escHtml(siteName)} phone chat line has a smooth, enjoyable experience — from your first free call through every connection you make.</p>
    </div>
  </main>
  <footer><p>&copy; <time datetime="${today}">${new Date().getFullYear()}</time> ${escHtml(siteName)} — <a href="/">Home</a> · <a href="/membership">Membership</a> · <a href="/faq">FAQ</a> · <a href="/privacy-policy">Privacy Policy</a></p></footer>
</body>
</html>`;

  const regionsDir = path.join(publicDir, "regions");
  if (!fs.existsSync(regionsDir)) fs.mkdirSync(regionsDir, { recursive: true });
  fs.writeFileSync(path.join(regionsDir, "index.html"), html, "utf-8");
}

// ── Sitemap + robots ───────────────────────────────────────────────────────

export function writeSitemap(allRegions: Region[], siteUrl: string): void {
  const publicDir = path.join(process.cwd(), "client/public");
  if (!fs.existsSync(publicDir)) fs.mkdirSync(publicDir, { recursive: true });

  const activeRegions = allRegions.filter(r => r.isActive);
  const now = new Date().toISOString().split("T")[0];

  const urls = [
    `  <url>\n    <loc>${siteUrl}/</loc>\n    <changefreq>weekly</changefreq>\n    <priority>1.0</priority>\n    <lastmod>${now}</lastmod>\n  </url>`,
    `  <url>\n    <loc>${siteUrl}/regions/</loc>\n    <changefreq>weekly</changefreq>\n    <priority>0.9</priority>\n    <lastmod>${now}</lastmod>\n  </url>`,
    ...activeRegions.map(r =>
      `  <url>\n    <loc>${siteUrl}/regions/${r.slug}.html</loc>\n    <changefreq>monthly</changefreq>\n    <priority>0.8</priority>\n    <lastmod>${now}</lastmod>\n  </url>`,
    ),
  ];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.sitemaps.org/schemas/sitemap/0.9 http://www.sitemaps.org/schemas/sitemap/0.9/sitemap.xsd">\n${urls.join("\n")}\n</urlset>`;
  fs.writeFileSync(path.join(publicDir, "sitemap.xml"), xml, "utf-8");
}

export function writeRobotsTxt(siteUrl: string): void {
  const publicDir = path.join(process.cwd(), "client/public");
  if (!fs.existsSync(publicDir)) fs.mkdirSync(publicDir, { recursive: true });

  const content = [
    "User-agent: *",
    "Allow: /",
    "Disallow: /api/",
    "Disallow: /backstage",
    "",
    "# Crawl-delay for well-behaved bots",
    "Crawl-delay: 1",
    "",
    `Sitemap: ${siteUrl}/sitemap.xml`,
    "",
  ].join("\n");
  fs.writeFileSync(path.join(publicDir, "robots.txt"), content, "utf-8");
}

// ── Helpers ────────────────────────────────────────────────────────────────

export function getSiteUrlExported(): string {
  if (process.env.SITE_URL) return process.env.SITE_URL.replace(/\/$/, "");
  if (process.env.REPLIT_DEV_DOMAIN) return `https://${process.env.REPLIT_DEV_DOMAIN}`;
  return "https://example.com";
}

function getSiteUrl(): string {
  return getSiteUrlExported();
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
