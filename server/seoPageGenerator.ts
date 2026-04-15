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
      pronoun: "guys",
      audienceDesc: "men seeking men",
      metaDesc: (city, state, phone, siteName) =>
        `${siteName} is the free phone chat line for men in ${city}, ${state}. Connect with real local guys right now — no app, no credit card, no hassle. ${phone ? `Call your local number: ${phone}. ` : ""}New callers get free trial minutes to get started.`,
      h1: (city, stateCode, siteName) =>
        `${siteName} in ${city}, ${stateCode} — Talk to Real Local Guys`,
      tagline: (city, state, siteName) =>
        `The free phone chat line for men in ${city}, ${state}. Real guys, live conversation, 24 hours a day.`,
      features: [
        `Free trial minutes for all new ${isMM ? "callers" : "callers"} — no credit card required`,
        "Real local callers on the line right now, 24/7",
        "Private and anonymous — your phone number is never shared",
        "Record a personal greeting to introduce yourself to the community",
        "Browse greetings from guys in your area before connecting",
        "Leave and receive voice messages anytime, day or night",
        "Go live with someone instantly when you both want to connect",
        "Simple, affordable membership plans with no hidden fees",
        "Block any caller instantly with a single keystroke",
        "Available from any phone — smartphone, cell, or landline",
      ],
      h2s: [
        {
          heading: (city, state, siteName) => `${siteName}: The ${city}, ${state} Chat Line for Men`,
          body: (city, state, siteName) =>
            `${siteName} is the premier free phone chat line for men seeking men in ${city}, ${state}. Whether you're looking for casual conversation, friendship, or a meaningful connection, real guys in your area are on the line right now — waiting to hear from you. Unlike dating apps that bury you under endless profiles and algorithm filters, ${siteName} puts you in direct, real-time voice contact with men in the ${city} community. No swiping, no messaging back and forth for days — just pick up the phone and start talking. Thousands of men across ${state} use ${siteName} every day to meet people they never would have found otherwise. Your next great conversation is just one phone call away.`,
        },
        {
          heading: (_c, _s, _n) => "How the Chat Line Works — Step by Step",
          body: (city, _state, siteName) =>
            `Getting started on ${siteName} couldn't be simpler. First, call your local ${city} access number — you'll be greeted with a welcome message and guided through the process automatically. Next, record a short personal greeting: say your name, a little about yourself, and what you're looking for. Your greeting is how other guys get to know you before deciding to connect, so make it genuine and interesting. After recording, you'll be dropped directly into the ${city} community where you can browse greetings from other local guys, leave voice messages for anyone who catches your attention, or request a live connection. When both callers agree to go live, you're connected instantly and privately. The entire process — from calling to connecting — takes less than five minutes. There's no profile to fill out, no photos required, and no app to download. Your phone is your only tool.`,
        },
        {
          heading: (city, state, siteName) => `Why ${city} Men Choose ${siteName}`,
          body: (city, state, siteName) =>
            `Men in ${city}, ${state} choose ${siteName} for three simple reasons: it's fast, it's private, and it's real. Unlike social apps where you never know who's on the other side of a screen, ${siteName} is voice-first — you hear a real person from the very first second. There's no catfishing, no fake profiles, and no ghosting after hours of text conversation. ${siteName} also offers unmatched privacy. Your phone number is never displayed to other callers, and you're known only by the screen name you choose when you call. You control who you talk to, for how long, and you can block anyone instantly. For men in ${city} who value discretion — whether they're out and proud or simply private — ${siteName} provides a safe, anonymous space to connect authentically. Add in the free trial minutes for new callers and there's genuinely nothing to lose by calling.`,
        },
        {
          heading: (city, state, siteName) => `${city}, ${state} Is on the Line Right Now`,
          body: (city, state, siteName) =>
            `The ${siteName} community in ${city} and across ${state} is active around the clock. In the morning before work, late at night, on weekends — there are always real guys on the line. The beauty of a phone chat line is that there's no barrier: no downloading an app, no waiting for matches, no filling out a lengthy profile. When you call your ${city} local number, you're immediately part of an active community of men in your area who are all there for the same reason you are: real connection. The community skews toward authenticity because voice is harder to fake than a carefully curated photo. What you hear is what you get — and that honesty makes for much better, much more meaningful conversations. Join the ${city} community on ${siteName} today and see who's waiting to meet you.`,
        },
        {
          heading: (_c, _s, siteName) => `Privacy and Safety on ${siteName}`,
          body: (_city, _state, siteName) =>
            `Privacy is built into every part of how ${siteName} works. Your personal phone number is never revealed to other callers — ever. You're identified only by the screen name you choose when you set up your profile, which you can change at any time. All calls are routed through ${siteName}'s private network, so neither party ever sees the other's real number. Beyond anonymity, ${siteName} gives you full control over your experience. You can block any caller permanently with a single keypress, and that caller will never be able to reach you again. The greetings and messages you send are stored securely and are only accessible to you and the people you've chosen to share them with. ${siteName} is committed to creating a space where men can connect openly without worrying about their privacy being compromised.`,
        },
      ],
      howToSteps: [
        { name: "Call your local access number", text: (city, siteName) => `Dial the ${city} local access number for ${siteName}. New callers are guided through the setup process automatically — no prior experience needed.` },
        { name: "Record your greeting", text: (_city, siteName) => `Record a short personal greeting introducing yourself. Tell other ${siteName} members a little about who you are and what you're looking for. Keep it natural and genuine — authentic greetings get the most responses.` },
        { name: "Browse local greetings", text: (city, siteName) => `Listen to greetings from real guys in and around ${city}. Take your time — there's no pressure. When you hear someone who interests you, move on to the next step.` },
        { name: "Send a message or go live", text: (_city, siteName) => `Leave a private voice message for anyone who catches your attention, or request a live connection. When both callers agree to connect, ${siteName} bridges you together instantly and privately.` },
      ],
      faqs: [
        {
          q: (city, state, siteName) => `Is the ${siteName} chat line really free in ${city}, ${state}?`,
          a: (city, state, siteName) =>
            `Yes — ${siteName} gives all new callers free trial minutes to get started, and no credit card is required to claim them. During your free trial, you can record your greeting, browse greetings from guys in the ${city} area, send voice messages, and even connect live with someone. The free minutes give you a genuine taste of the ${siteName} experience before you decide whether a paid membership is right for you. After your trial minutes are used, affordable membership plans are available at multiple price points — there are no contracts, no hidden fees, and you can cancel anytime.`,
        },
        {
          q: (_c, _s, _n) => `Do I need to download an app to use the chat line?`,
          a: (city, _state, siteName) =>
            `No app is required. ${siteName} is a phone-based chat line, which means all you need is any phone — smartphone, basic cell phone, or even a landline. Just dial the ${city} local access number and you're immediately connected to the ${siteName} community. There's no account to create online, no profile photo to upload, and no software to install. This makes ${siteName} one of the most accessible ways to meet local guys because you don't need to be tech-savvy or have the latest smartphone. If you can make a phone call, you can use ${siteName}.`,
        },
        {
          q: (city) => `Will other callers see my personal phone number when I call?`,
          a: (_city, _state, siteName) =>
            `Never. ${siteName} routes all calls through its private network, which means your personal phone number is completely hidden from every other caller on the system. Other members only know you by the screen name you record in your greeting — your real identity and contact information remain entirely private. This anonymity is a core feature of ${siteName}, not an afterthought, and it's one of the main reasons men trust the platform for discreet connections. You are in complete control of your privacy at every step.`,
        },
        {
          q: (_c, _s, _n) => `What happens after my free trial minutes are used up?`,
          a: (_city, _state, siteName) =>
            `Once your free trial minutes run out, you can choose from several affordable membership plans to keep connecting. Plans vary by the number of minutes included, so you can pick whatever fits your usage and budget. All plans are month-to-month with no long-term contracts, and you can cancel at any time without penalty. There are no hidden fees or surprise charges — the price you see is the price you pay. Visit the ${siteName} website for current pricing details and to find the plan that works best for you.`,
        },
        {
          q: (city, state, siteName) => `How does ${siteName} connect me with guys specifically in the ${city}, ${state} area?`,
          a: (city, state, siteName) =>
            `${siteName} uses local access numbers to create geographically focused communities. When you dial the ${city} local access number, you're automatically placed into the ${city} and ${state} community. The greetings you hear first, the messages you receive, and the live connections you make are all prioritized from guys in and around the ${city} area. This local-first approach is what makes ${siteName} feel genuinely like a community rather than a national dating platform. You're talking to people who share your city, your neighborhood, your daily life — and that local connection makes conversations feel more real and more relevant.`,
        },
        {
          q: (_c, _s, _n) => `Is the chat line available 24 hours a day?`,
          a: (_city, _state, siteName) =>
            `Yes — ${siteName} is available 24 hours a day, 7 days a week, 365 days a year. There is always someone on the line, no matter what time you call. The community is most active in the evenings and on weekends, but even at 3 AM on a Tuesday, you'll find guys browsing greetings and leaving messages. Your greeting stays active in the system even when you're not on the call, so other members can leave you voice messages any time — and you can reply whenever it's convenient for you.`,
        },
      ],
      ctaText: "Call Free Now",
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
  const metaTitle = `${city}, ${stateCode} Chat Line — ${siteName} | Free Trial | Local ${cfg.pronoun === "guys" ? "Gay" : ""} Phone Chat`;
  const metaDesc = cfg.metaDesc(city, stateDisplay, phone, siteName);
  const h1Text = cfg.h1(city, stateCode, siteName);

  const keywords = [
    `${siteName.toLowerCase()} ${city.toLowerCase()}`,
    `chat line ${city.toLowerCase()} ${stateCode.toLowerCase()}`,
    `free phone chat ${city.toLowerCase()}`,
    `local chat line ${city.toLowerCase()} ${stateCode.toLowerCase()}`,
    `free trial chat line ${city.toLowerCase()}`,
    `meet ${cfg.pronoun} ${city.toLowerCase()} ${stateCode.toLowerCase()}`,
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
    "name": `${siteName} — ${city}, ${stateCode}`,
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
  <title>Local Chat Line Numbers | ${escHtml(siteName)} | All Cities</title>
  <meta name="description" content="Find your local ${escHtml(siteName)} phone chat number. We have local access numbers across the US — find your city and call free today." />
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
    .main > p { color: rgba(255,255,255,0.45); font-size: 1rem; margin-bottom: 40px; }
    .regions-list { list-style: none; padding: 0; display: flex; flex-direction: column; gap: 8px; }
    .region-card { display: flex; align-items: center; gap: 16px; padding: 16px 20px; border: 1px solid rgba(255,255,255,0.07); border-radius: 10px; background: rgba(255,255,255,0.03); transition: background 0.2s, border-color 0.2s; }
    .region-card:hover { background: rgba(255,255,255,0.06); border-color: rgba(255,255,255,0.14); }
    .region-name { font-weight: 700; color: #fff; flex: 1; }
    .region-phone { font-size: 0.9rem; color: #3B82F6; font-weight: 600; }
    .region-arrow { color: rgba(255,255,255,0.25); font-size: 1rem; }
    footer { text-align: center; padding: 24px; font-size: 0.78rem; color: rgba(255,255,255,0.18); border-top: 1px solid rgba(255,255,255,0.05); }
    footer a { color: rgba(255,255,255,0.28); }
  </style>
</head>
<body>
  <nav class="nav"><div class="nav-inner"><a href="/" class="nav-logo">${escHtml(siteName)}</a><a href="/" style="font-size:0.875rem;color:rgba(255,255,255,0.5);">← Home</a></div></nav>
  <main class="main">
    <h1>Local Chat Line Numbers — ${escHtml(siteName)}</h1>
    <p>Find your local access number and call free today. ${activeRegions.length} cit${activeRegions.length === 1 ? "y" : "ies"} available.</p>
    <ul class="regions-list">${listItems}</ul>
  </main>
  <footer><p>&copy; <time datetime="${today}">${new Date().getFullYear()}</time> ${escHtml(siteName)} — <a href="/">Home</a> · <a href="/privacy-policy">Privacy Policy</a></p></footer>
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
