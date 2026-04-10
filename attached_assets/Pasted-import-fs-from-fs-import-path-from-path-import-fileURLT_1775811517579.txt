import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import type { SeoRegion } from "@shared/schema";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const REGIONS_DIR = path.join(__dirname, "../client/public/regions");

function ensureDir() {
  if (!fs.existsSync(REGIONS_DIR)) fs.mkdirSync(REGIONS_DIR, { recursive: true });
}

// ── Product configurations ─────────────────────────────────────────────────

interface ProductConfig {
  name: string;
  tagline: string;
  color: string;
  colorDark: string;
  h1Suffix: string;
  metaTitleSuffix: string;
  metaDescTemplate: (city: string, state: string, phone: string) => string;
  keywordSuffix: string;
  features: string[];
  h2s: Array<{ heading: string; body: string }>;
  industries: string[];
  faqs: Array<{ q: string; a: string }>;
  cta: string;
  ctaUrl: string;
  schemaType: string;
}

function getProductConfig(product: string, city: string, state: string): ProductConfig {
  const configs: Record<string, ProductConfig> = {
    booking: {
      name: "Certxa Booking",
      tagline: "Online Appointment Booking Software",
      color: "#00D4AA",
      colorDark: "#00A882",
      h1Suffix: "Online Appointment Booking Software",
      metaTitleSuffix: "Online Appointment Booking",
      metaDescTemplate: (c, s, ph) =>
        `Looking for the best online appointment booking software in ${c}, ${s}? Certxa helps hair salons, spas, barbershops, and service businesses fill their calendars automatically — no more phone tag. ${ph ? `Call ${ph} or get started free today.` : "Get started free today."}`,
      keywordSuffix: "online booking software, appointment scheduling, booking app, salon software, spa booking",
      features: [
        "24/7 online booking — clients book themselves from any device",
        "Automated SMS & email reminders cut no-shows by up to 40%",
        "Staff scheduling, calendars & real-time availability management",
        "Built-in invoicing, POS & card payment processing",
        "Client history, notes, intake forms & loyalty programs",
        "Branded booking page with your logo, colors & services",
      ],
      h2s: [
        {
          heading: `Why ${city} Businesses Choose Certxa Booking`,
          body: `Running an appointment-based business in ${city} means juggling calls, texts, walk-ins, and last-minute cancellations all day. Certxa Booking puts your entire scheduling operation on autopilot — clients book online any time, get automatic reminders, and rebook easily. You spend less time on admin and more time doing what you do best.`,
        },
        {
          heading: "No More Phone Tag — Clients Book Themselves",
          body: `With Certxa, you get a branded booking page that works 24 hours a day, 7 days a week. Clients in ${city} and surrounding areas can browse your services, pick a time that works, and confirm their appointment in under two minutes — no phone call required. You get an instant notification, and they get an automatic confirmation.`,
        },
        {
          heading: "Automated Reminders That Actually Work",
          body: `No-shows are the number-one profit killer for appointment businesses. Certxa sends automated SMS and email reminders at the right time — 48 hours out, 24 hours out, and the morning of. Businesses using Certxa typically see a 35–40% drop in no-shows within the first 30 days.`,
        },
        {
          heading: `Serving All Appointment-Based Businesses in ${city}, ${state}`,
          body: `Certxa Booking works for any business that runs on appointments. Whether you're a hair salon, nail studio, spa, esthetician, tattoo artist, pet groomer, personal trainer, tutor, or massage therapist — if you schedule clients, Certxa was built for you.`,
        },
      ],
      industries: ["Hair Salons", "Barber Shops", "Nail Salons", "Spas & Massage", "Estheticians", "Tattoo Artists", "Pet Groomers", "Personal Trainers", "Tutors", "Medical Aesthetics"],
      faqs: [
        {
          q: `How does online booking software work for businesses in ${city}?`,
          a: `With Certxa, you set up your services, staff, and availability once. Clients in ${city} visit your booking page, choose a service and time, and confirm. You receive an instant alert and the appointment lands on your calendar automatically. No manual entry, no phone calls.`,
        },
        {
          q: "Does Certxa work on phones and tablets?",
          a: "Yes — Certxa is fully mobile-optimized. Your clients can book from any smartphone or tablet, and your staff can manage the calendar from any device, including from behind the chair.",
        },
        {
          q: "Can I keep my existing clients' information?",
          a: "Absolutely. You can import your existing client list, and Certxa will maintain full history, notes, and preferences for every client going forward.",
        },
        {
          q: "Is there a contract or setup fee?",
          a: "No contracts and no setup fees. Certxa runs on a simple monthly subscription. You can start with a free trial and cancel anytime.",
        },
      ],
      cta: "Start Your Free Trial",
      ctaUrl: "/booking",
      schemaType: "LocalBusiness",
    },

    queue: {
      name: "Certxa Queue",
      tagline: "Virtual Walk-In Queue Management",
      color: "#F59E0B",
      colorDark: "#D97706",
      h1Suffix: "Virtual Walk-In Queue Management",
      metaTitleSuffix: "Virtual Walk-In Queue System",
      metaDescTemplate: (c, s, ph) =>
        `End the wait-outside problem at your ${c}, ${s} business with Certxa Queue — the virtual check-in system that lets walk-in customers hold their spot from their phone. ${ph ? `Questions? Call ${ph}.` : "Get started free."}`,
      keywordSuffix: "virtual queue, walk-in management, digital waitlist, barbershop queue system, no-wait queue app",
      features: [
        "QR code check-in — customers join from any smartphone, no app download needed",
        "Live queue display for your shop TV, tablet, or monitor",
        "Automated SMS alerts bring customers back in right on time",
        "Walk-in loyalty punch cards that keep customers coming back",
        "Real-time wait estimates shown to customers on their phone",
        "Built-in POS & card payment processing at checkout",
      ],
      h2s: [
        {
          heading: `Stop Making Customers Wait Outside Your ${city} Business`,
          body: `Nobody likes standing in line — especially outside. With Certxa Queue, customers in ${city} scan a QR code at your door, join the virtual line from their phone, and go wait wherever they want. Your shop's live display shows everyone's place in line, and an automatic text brings them back right when it's their turn.`,
        },
        {
          heading: "How the Virtual Queue Works",
          body: `It's simple: a customer walks in, scans your QR code, and they're in line. They see their estimated wait time on their phone. When they're next up, Certxa automatically sends them a text saying "You're up — head back in now." No app download, no account creation — just a phone number and they're in.`,
        },
        {
          heading: "The Live Board Your Staff Will Love",
          body: `Your staff sees every person in the queue on a clean dashboard — name, wait time, and status. One tap moves the line forward. The shop display updates instantly so everyone in the room can see where the line stands. No whiteboards, no clipboards, no shouting names.`,
        },
        {
          heading: `Perfect for Walk-In Businesses in ${city}, ${state}`,
          body: `Certxa Queue was built specifically for businesses that run on walk-ins: barbershops, hair salons, nail studios, urgent care clinics, DMV-style service counters, food stands, and anywhere customers show up and wait. If you have a line, Certxa can manage it.`,
        },
      ],
      industries: ["Barber Shops", "Walk-In Hair Salons", "Nail Studios", "Urgent Care", "Food Counters", "Auto Service", "Government Service Centers", "Eyebrow & Threading Studios"],
      faqs: [
        {
          q: `How do customers join the queue at your ${city} location?`,
          a: `You print or display a QR code at your door or counter. Customers scan it with their phone's camera, enter their name and phone number, and they're instantly in the virtual line. No app download required — it works in any mobile browser.`,
        },
        {
          q: "What if a customer's wait is taking longer than expected?",
          a: "Certxa automatically updates estimated wait times in real time based on how quickly the queue is moving. If a customer's wait extends, their phone shows the updated estimate and they won't miss their turn.",
        },
        {
          q: "Can I still accept regular walk-ins who don't use their phone?",
          a: "Yes. Staff can add walk-in customers directly from the dashboard — so if someone doesn't have a smartphone or prefers not to use it, you add them manually in seconds.",
        },
        {
          q: "Does the system work if my internet goes down?",
          a: "The queue dashboard is cloud-based and runs on your internet connection. We recommend a backup hotspot, which most businesses keep anyway. Customer position and SMS alerts all run through our servers — not your local network.",
        },
      ],
      cta: "See Certxa Queue in Action",
      ctaUrl: "/queue",
      schemaType: "LocalBusiness",
    },

    pro: {
      name: "Certxa Pro",
      tagline: "Field Service Management Software",
      color: "#3B82F6",
      colorDark: "#2563EB",
      h1Suffix: "Field Service Management Software",
      metaTitleSuffix: "Field Service Management",
      metaDescTemplate: (c, s, ph) =>
        `Manage your entire field service operation in ${c}, ${s} from one platform. Certxa Pro handles dispatching, job tracking, crew management, invoicing, and payments — built for HVAC, plumbing, electrical, landscaping, and more. ${ph ? `Call ${ph}.` : ""}`,
      keywordSuffix: "field service management, job dispatch software, crew tracking, HVAC software, plumbing business software, service dispatch app",
      features: [
        "Live job dispatch board — drag-and-drop scheduling for your entire crew",
        "GPS crew tracking — see where every tech is in real time",
        "Mobile app for techs — job details, navigation, photos & invoice from the field",
        "Automated customer notifications for arrival windows and updates",
        "Invoicing, payment collection & digital signatures on-site",
        "Service history, equipment records & recurring job scheduling",
      ],
      h2s: [
        {
          heading: `Run Your ${city} Service Business From One Dashboard`,
          body: `If you're managing a field service operation in ${city} — HVAC, plumbing, electrical, landscaping, or any trade — you know how hard it is to keep jobs moving, crews informed, and customers updated all at the same time. Certxa Pro puts your entire operation on one screen: dispatch, GPS tracking, job status, invoicing, and customer communication.`,
        },
        {
          heading: "Dispatch Jobs Faster Than a Phone Call",
          body: `The Certxa Pro dispatch board lets you drag jobs onto tech calendars, see who's closest to a call, and send job details to the field instantly. Techs get the job on their phone — address, contact, work order, and notes — the moment you assign it. No more lost paperwork, no more call-backs to get details.`,
        },
        {
          heading: "Your Crew Gets a Mobile App That Actually Works",
          body: `Certxa's crew app gives every field tech everything they need: their daily job list, turn-by-turn navigation, space to upload photos and notes, and the ability to create and collect payment on invoices right on the spot. Customers sign on the screen and get a receipt emailed instantly.`,
        },
        {
          heading: `Built for Trade Contractors in ${city}, ${state}`,
          body: `Whether you run a 3-truck HVAC company or a 20-person plumbing operation, Certxa Pro scales to match your business. It's used by contractors across ${state} for heating and cooling, plumbing, electrical work, appliance repair, lawn care, cleaning services, and general contracting.`,
        },
      ],
      industries: ["HVAC", "Plumbing", "Electrical", "Landscaping & Lawn Care", "Appliance Repair", "Carpet Cleaning", "Pressure Washing", "Window Cleaning", "Handyman Services", "Roofing", "Pool Service"],
      faqs: [
        {
          q: `What makes Certxa Pro different from other field service software?`,
          a: `Most field service platforms are built for enterprise companies with IT departments. Certxa Pro is designed for small-to-mid-size contractors who need something that works out of the box — no weeks of setup, no training courses, no per-seat pricing that kills your margins.`,
        },
        {
          q: `Does my crew need smartphones to use Certxa Pro?`,
          a: `Yes — techs use the Certxa crew app on their Android or iPhone. Any modern smartphone works. The app is simple enough that techs are up and running in minutes, even if they're not particularly tech-savvy.`,
        },
        {
          q: `Can I track my crew's location in real time?`,
          a: `Yes. When a tech has the app open, you see their GPS location on the dispatch map. You can see who's en route, on-site, or between jobs at any moment — so you can make smart dispatch decisions fast.`,
        },
        {
          q: `Does Certxa Pro handle repeat or maintenance contract customers?`,
          a: `Yes. You can set up recurring jobs for maintenance customers — quarterly HVAC tune-ups, weekly lawn service, monthly pest control — and Certxa will auto-schedule and notify both the tech and the customer automatically.`,
        },
      ],
      cta: "Get a Free Demo",
      ctaUrl: "/pro",
      schemaType: "LocalBusiness",
    },
  };

  const cfg = configs[product] ?? configs["booking"];
  return cfg;
}

// ── Main generator ─────────────────────────────────────────────────────────

export function generateRegionPage(region: SeoRegion, siteUrl = "https://certxa.com", allRegions: SeoRegion[] = []): string {
  const product = region.product === "all" ? "booking" : region.product;
  const cfg = getProductConfig(product, region.city, region.state);

  const businessTypes: string[] = region.businessTypes
    ? JSON.parse(region.businessTypes).filter(Boolean)
    : cfg.industries;

  const nearbyCities: string[] = region.nearbyCities
    ? region.nearbyCities.split(",").map(c => c.trim()).filter(Boolean)
    : [];

  const phone = region.phone ?? "";
  const pageUrl = `${siteUrl}/regions/${region.slug}.html`;

  const metaTitle = region.metaTitle
    ?? `${cfg.name} in ${region.city}, ${region.stateCode} | ${cfg.metaTitleSuffix} | Certxa`;
  const metaDesc = region.metaDesc
    ?? cfg.metaDescTemplate(region.city, region.state, phone);
  const h1 = region.h1Override
    ?? `${cfg.name} in ${region.city}, ${region.stateCode} — ${cfg.h1Suffix}`;
  const keywords = `${region.city} ${cfg.keywordSuffix}, ${region.city} ${region.stateCode} business software, Certxa ${region.city}`;

  // JSON-LD structured data
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": cfg.schemaType,
    "name": `Certxa — ${region.city}, ${region.stateCode}`,
    "description": metaDesc,
    "url": pageUrl,
    "telephone": phone || undefined,
    "address": {
      "@type": "PostalAddress",
      "addressLocality": region.city,
      "addressRegion": region.stateCode,
      "postalCode": region.zip ?? undefined,
      "addressCountry": "US",
    },
    "areaServed": {
      "@type": "City",
      "name": region.city,
    },
    "hasOfferCatalog": {
      "@type": "OfferCatalog",
      "name": cfg.tagline,
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
      "name": faq.q,
      "acceptedAnswer": {
        "@type": "Answer",
        "text": faq.a,
      },
    })),
  };

  const color = cfg.color;
  const colorDark = cfg.colorDark;

  // Build sitemap — group all pages (generated + current) by product
  const productOrder: Array<"booking" | "queue" | "pro"> = ["booking", "queue", "pro"];
  const productLabels: Record<string, string> = {
    booking: "Certxa Booking",
    queue: "Certxa Queue",
    pro: "Certxa Pro",
  };
  // Include all regions that have been generated, plus the current region itself
  const allForSitemap = [
    ...allRegions.filter(r => r.pageGenerated && r.slug !== region.slug),
    region,
  ];
  const grouped: Record<string, SeoRegion[]> = {};
  for (const r of allForSitemap) {
    const key = r.product === "all" ? "booking" : r.product;
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(r);
  }
  const sitemapGroupsHtml = productOrder
    .filter(key => grouped[key]?.length)
    .map(key => {
      const links = grouped[key]
        .sort((a, b) => a.city.localeCompare(b.city))
        .map(r => {
          const isCurrent = r.slug === region.slug;
          const label = `${r.city}, ${r.stateCode}`;
          if (isCurrent) {
            return `<span class="sitemap-link current">${label} (this page)</span>`;
          }
          return `<a href="/regions/${r.slug}.html" class="sitemap-link">${label}</a>`;
        })
        .join("\n        ");
      return `
    <div>
      <p class="sitemap-group-label">${productLabels[key]}</p>
      <div class="sitemap-links">
        ${links}
      </div>
    </div>`;
    })
    .join("");

  const sitemapHtml = sitemapGroupsHtml ? `
  <!-- Sitemap -->
  <div class="sitemap">
    <div class="sitemap-inner">
      <p class="sitemap-title">All Regional Pages</p>
      <div class="sitemap-groups">
        ${sitemapGroupsHtml}
        <div>
          <p class="sitemap-group-label">Main Site</p>
          <div class="sitemap-links">
            <a href="/" class="sitemap-link">Certxa Home</a>
            <a href="/get-started" class="sitemap-link">Pricing</a>
            <a href="/booking" class="sitemap-link">Certxa Booking</a>
            <a href="/queue" class="sitemap-link">Certxa Queue</a>
            <a href="/pro" class="sitemap-link">Certxa Pro</a>
          </div>
        </div>
      </div>
    </div>
  </div>` : `
  <!-- Sitemap -->
  <div class="sitemap">
    <div class="sitemap-inner">
      <p class="sitemap-title">Main Site</p>
      <div class="sitemap-groups">
        <div>
          <p class="sitemap-group-label">Certxa</p>
          <div class="sitemap-links">
            <a href="/" class="sitemap-link">Certxa Home</a>
            <a href="/get-started" class="sitemap-link">Pricing</a>
            <a href="/booking" class="sitemap-link">Certxa Booking</a>
            <a href="/queue" class="sitemap-link">Certxa Queue</a>
            <a href="/pro" class="sitemap-link">Certxa Pro</a>
          </div>
        </div>
      </div>
    </div>
  </div>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${metaTitle}</title>
  <meta name="description" content="${metaDesc}" />
  <meta name="keywords" content="${keywords}" />
  <link rel="canonical" href="${pageUrl}" />

  <!-- Open Graph -->
  <meta property="og:type" content="website" />
  <meta property="og:url" content="${pageUrl}" />
  <meta property="og:title" content="${metaTitle}" />
  <meta property="og:description" content="${metaDesc}" />
  <meta property="og:image" content="${siteUrl}/web-app.png" />
  <meta property="og:site_name" content="Certxa" />

  <!-- Twitter Card -->
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${metaTitle}" />
  <meta name="twitter:description" content="${metaDesc}" />
  <meta name="twitter:image" content="${siteUrl}/web-app.png" />

  <!-- Structured Data -->
  <script type="application/ld+json">${JSON.stringify(jsonLd, null, 2)}</script>
  <script type="application/ld+json">${JSON.stringify(faqJsonLd, null, 2)}</script>

  <!-- Fonts -->
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800;900&display=swap" rel="stylesheet" />

  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    html { scroll-behavior: smooth; }
    body {
      font-family: 'Plus Jakarta Sans', sans-serif;
      background: #050C18;
      color: #ffffff;
      line-height: 1.6;
    }
    a { color: inherit; text-decoration: none; }
    img { max-width: 100%; display: block; }

    /* Nav */
    .nav {
      position: fixed; top: 0; left: 0; right: 0; z-index: 100;
      background: rgba(5,12,24,0.9); backdrop-filter: blur(16px);
      border-bottom: 1px solid rgba(255,255,255,0.06);
      height: 64px; display: flex; align-items: center;
      padding: 0 24px;
    }
    .nav-inner {
      max-width: 1200px; width: 100%; margin: 0 auto;
      display: flex; align-items: center; justify-content: space-between;
    }
    .nav-logo { font-size: 1.2rem; font-weight: 900; letter-spacing: -0.02em; display: flex; align-items: center; gap: 8px; }
    .nav-actions { display: flex; align-items: center; gap: 16px; }
    .nav-login { font-size: 0.875rem; color: rgba(255,255,255,0.5); font-weight: 500; }
    .nav-login:hover { color: #fff; }
    .btn-nav {
      background: #ffffff; color: #050C18;
      font-size: 0.875rem; font-weight: 700;
      padding: 8px 20px; border-radius: 12px;
      transition: background 0.2s;
    }
    .btn-nav:hover { background: rgba(255,255,255,0.88); }

    /* Hero */
    .hero {
      padding: 120px 24px 80px;
      text-align: center;
      background: radial-gradient(ellipse 900px 500px at 50% 0%, rgba(255,255,255,0.03) 0%, transparent 70%);
    }
    .hero-label {
      font-size: 0.75rem; font-weight: 700; letter-spacing: 0.18em;
      text-transform: uppercase; color: rgba(255,255,255,0.35);
      margin-bottom: 20px;
    }
    .hero h1 {
      font-size: clamp(2.2rem, 6vw, 3.8rem);
      font-weight: 900; line-height: 1.08; letter-spacing: -0.02em;
      max-width: 860px; margin: 0 auto 20px;
    }
    .hero h1 .accent { color: ${color}; }
    .hero-sub {
      font-size: 1.15rem; color: rgba(255,255,255,0.5);
      max-width: 580px; margin: 0 auto 36px;
    }
    .hero-phone {
      display: inline-flex; align-items: center; gap: 8px;
      background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.1);
      padding: 12px 24px; border-radius: 14px;
      font-size: 1.25rem; font-weight: 800;
      margin-bottom: 24px; letter-spacing: 0.01em;
    }
    .hero-phone a { color: ${color}; }
    .hero-phone a:hover { text-decoration: underline; }
    .hero-ctas { display: flex; gap: 12px; justify-content: center; flex-wrap: wrap; }
    .btn-primary {
      display: inline-flex; align-items: center; gap: 8px;
      background: ${color}; color: #050C18;
      font-weight: 700; font-size: 1rem;
      padding: 14px 32px; border-radius: 16px;
      transition: background 0.2s, transform 0.15s;
    }
    .btn-primary:hover { background: ${colorDark}; transform: translateY(-1px); }
    .btn-secondary {
      display: inline-flex; align-items: center; gap: 8px;
      background: rgba(255,255,255,0.07); color: #fff;
      font-weight: 600; font-size: 1rem;
      padding: 14px 32px; border-radius: 16px;
      border: 1px solid rgba(255,255,255,0.12);
      transition: background 0.2s;
    }
    .btn-secondary:hover { background: rgba(255,255,255,0.12); }

    /* Trust badges */
    .trust {
      display: flex; justify-content: center; gap: 32px; flex-wrap: wrap;
      padding: 32px 24px; border-top: 1px solid rgba(255,255,255,0.05);
      border-bottom: 1px solid rgba(255,255,255,0.05);
    }
    .trust-item { font-size: 0.85rem; color: rgba(255,255,255,0.4); text-align: center; }
    .trust-item strong { display: block; font-size: 1.3rem; font-weight: 800; color: ${color}; margin-bottom: 2px; }

    /* Content sections */
    .section { max-width: 1200px; margin: 0 auto; padding: 72px 24px; }
    .section-label {
      font-size: 0.75rem; font-weight: 700; letter-spacing: 0.15em;
      text-transform: uppercase; color: ${color};
      margin-bottom: 12px;
    }
    .section h2 {
      font-size: clamp(1.6rem, 4vw, 2.4rem);
      font-weight: 800; letter-spacing: -0.02em;
      margin-bottom: 18px;
    }
    .section p { color: rgba(255,255,255,0.6); font-size: 1.05rem; max-width: 700px; line-height: 1.75; margin-bottom: 16px; }

    /* Features grid */
    .features-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
      gap: 16px;
      margin-top: 40px;
    }
    .feature-card {
      background: rgba(255,255,255,0.04);
      border: 1px solid rgba(255,255,255,0.07);
      border-radius: 16px;
      padding: 22px 24px;
    }
    .feature-card::before {
      content: '✓';
      display: inline-block;
      width: 28px; height: 28px;
      background: ${color}22;
      color: ${color};
      border-radius: 8px;
      text-align: center; line-height: 28px;
      font-weight: 900; font-size: 0.85rem;
      margin-bottom: 12px;
    }
    .feature-card p { font-size: 0.95rem; color: rgba(255,255,255,0.7); margin: 0; }

    /* Industries */
    .tags { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 24px; }
    .tag {
      font-size: 0.85rem; font-weight: 600;
      padding: 8px 16px; border-radius: 50px;
      background: ${color}18;
      color: ${color}cc;
      border: 1px solid ${color}28;
    }

    /* H2 content blocks */
    .content-blocks { display: flex; flex-direction: column; gap: 64px; padding: 0 0 72px; }
    .content-block { max-width: 1200px; margin: 0 auto; padding: 0 24px; }
    .content-block h2 {
      font-size: clamp(1.5rem, 3.5vw, 2.2rem);
      font-weight: 800; letter-spacing: -0.02em;
      margin-bottom: 16px; line-height: 1.2;
    }
    .content-block p { color: rgba(255,255,255,0.6); font-size: 1.05rem; line-height: 1.75; max-width: 760px; }

    /* Nearby cities */
    .nearby { background: rgba(255,255,255,0.025); border-top: 1px solid rgba(255,255,255,0.05); border-bottom: 1px solid rgba(255,255,255,0.05); }
    .nearby-inner { max-width: 1200px; margin: 0 auto; padding: 48px 24px; }
    .nearby h3 { font-size: 1.1rem; font-weight: 700; margin-bottom: 16px; }
    .nearby-links { display: flex; flex-wrap: wrap; gap: 10px; }
    .nearby-link {
      font-size: 0.85rem; color: rgba(255,255,255,0.5);
      padding: 6px 14px; border-radius: 8px;
      background: rgba(255,255,255,0.04);
      border: 1px solid rgba(255,255,255,0.06);
      transition: color 0.2s, background 0.2s;
    }
    .nearby-link:hover { color: #fff; background: rgba(255,255,255,0.08); }

    /* FAQ */
    .faq-section { background: rgba(5,12,24,1); }
    .faq-inner { max-width: 900px; margin: 0 auto; padding: 80px 24px; }
    .faq-inner h2 { font-size: clamp(1.6rem, 4vw, 2.2rem); font-weight: 800; letter-spacing: -0.02em; margin-bottom: 40px; text-align: center; }
    .faq-item { border-top: 1px solid rgba(255,255,255,0.07); padding: 28px 0; }
    .faq-item:last-child { border-bottom: 1px solid rgba(255,255,255,0.07); }
    .faq-q { font-size: 1.05rem; font-weight: 700; margin-bottom: 12px; }
    .faq-a { color: rgba(255,255,255,0.55); font-size: 0.97rem; line-height: 1.75; }

    /* CTA banner */
    .cta-banner {
      background: linear-gradient(135deg, ${color}18 0%, rgba(5,12,24,1) 60%);
      border-top: 1px solid ${color}30;
      text-align: center;
      padding: 80px 24px;
    }
    .cta-banner h2 { font-size: clamp(1.8rem, 4vw, 2.6rem); font-weight: 900; letter-spacing: -0.02em; margin-bottom: 16px; }
    .cta-banner p { color: rgba(255,255,255,0.5); font-size: 1.1rem; max-width: 560px; margin: 0 auto 36px; }

    /* Sitemap */
    .sitemap {
      background: rgba(255,255,255,0.02);
      border-top: 1px solid rgba(255,255,255,0.06);
      padding: 56px 24px 48px;
    }
    .sitemap-inner {
      max-width: 1200px; margin: 0 auto;
    }
    .sitemap-title {
      font-size: 0.7rem; font-weight: 700; letter-spacing: 0.18em;
      text-transform: uppercase; color: rgba(255,255,255,0.2);
      margin-bottom: 28px;
    }
    .sitemap-groups {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
      gap: 32px;
    }
    .sitemap-group-label {
      font-size: 0.75rem; font-weight: 700; letter-spacing: 0.12em;
      text-transform: uppercase; color: rgba(255,255,255,0.3);
      margin-bottom: 12px; padding-bottom: 8px;
      border-bottom: 1px solid rgba(255,255,255,0.06);
    }
    .sitemap-links { display: flex; flex-direction: column; gap: 6px; }
    .sitemap-link {
      font-size: 0.82rem; color: rgba(255,255,255,0.35);
      transition: color 0.15s;
    }
    .sitemap-link:hover { color: rgba(255,255,255,0.65); }
    .sitemap-link.current { color: rgba(255,255,255,0.5); font-weight: 600; pointer-events: none; }

    /* Footer */
    footer {
      text-align: center; padding: 28px 24px;
      font-size: 0.82rem; color: rgba(255,255,255,0.2);
      border-top: 1px solid rgba(255,255,255,0.05);
    }
    footer a { color: rgba(255,255,255,0.3); }
    footer a:hover { color: rgba(255,255,255,0.55); }

    @media (max-width: 640px) {
      .nav-login { display: none; }
      .features-grid { grid-template-columns: 1fr; }
      .trust { gap: 20px; }
    }
  </style>
</head>
<body>

  <!-- Navigation -->
  <nav class="nav">
    <div class="nav-inner">
      <a href="/" class="nav-logo">
        <img src="/web-app.png" alt="Certxa" width="28" height="28" style="border-radius:6px;" onerror="this.style.display='none'" />
        Certxa
      </a>
      <div class="nav-actions">
        <a href="/auth" class="nav-login">Log In</a>
        <a href="${cfg.ctaUrl}" class="btn-nav">Get Started Free</a>
      </div>
    </div>
  </nav>

  <!-- Hero -->
  <section class="hero">
    <p class="hero-label">${cfg.name} · ${region.city}, ${region.stateCode}</p>
    <h1>
      ${h1.replace(cfg.name, `<span class="accent">${cfg.name}</span>`)}
    </h1>
    <p class="hero-sub">${cfg.tagline} — helping businesses in ${region.city}, ${region.state} grow faster and run smoother.</p>
    ${phone ? `
    <div class="hero-phone">
      <span>📞</span>
      <span>Call us: <a href="tel:${phone.replace(/\D/g, "")}">${phone}</a></span>
    </div>` : ""}
    <div class="hero-ctas">
      <a href="${cfg.ctaUrl}" class="btn-primary">${cfg.cta} →</a>
      <a href="/get-started" class="btn-secondary">See Pricing</a>
    </div>
  </section>

  <!-- Trust bar -->
  <div class="trust">
    <div class="trust-item"><strong>40%</strong>Fewer No-Shows</div>
    <div class="trust-item"><strong>24/7</strong>Always Available</div>
    <div class="trust-item"><strong>5 min</strong>Setup Time</div>
    <div class="trust-item"><strong>No</strong>Contracts</div>
    <div class="trust-item"><strong>Free</strong>Trial Included</div>
  </div>

  <!-- Features -->
  <div class="section">
    <p class="section-label">${cfg.name} Features</p>
    <h2>Everything you need to run your ${region.city} business</h2>
    <p>Certxa gives ${region.city} businesses a complete platform — built specifically for how service businesses actually work.</p>
    <div class="features-grid">
      ${cfg.features.map(f => `
      <div class="feature-card">
        <p>${f}</p>
      </div>`).join("")}
    </div>
  </div>

  <!-- Content H2 blocks -->
  <div class="content-blocks">
    ${cfg.h2s.map(block => `
    <div class="content-block">
      <h2>${block.heading}</h2>
      <p>${block.body}</p>
    </div>`).join("")}
  </div>

  <!-- Industries served -->
  <div class="section" style="padding-top:0;">
    <p class="section-label">Who We Serve</p>
    <h2>Industries served in ${region.city}, ${region.stateCode}</h2>
    <p>Certxa works for a wide range of service businesses. If your business serves customers by appointment, walk-in, or field visit — we have a product built exactly for you.</p>
    <div class="tags">
      ${businessTypes.map(t => `<span class="tag">${t}</span>`).join("")}
    </div>
  </div>

  <!-- Nearby cities (SEO long-tail) -->
  ${nearbyCities.length > 0 ? `
  <div class="nearby">
    <div class="nearby-inner">
      <h3>Also serving businesses near ${region.city}</h3>
      <div class="nearby-links">
        ${nearbyCities.map(c => `<span class="nearby-link">${c}, ${region.stateCode}</span>`).join("")}
      </div>
    </div>
  </div>` : ""}

  <!-- FAQ -->
  <div class="faq-section">
    <div class="faq-inner">
      <h2>Frequently Asked Questions</h2>
      ${cfg.faqs.map(faq => `
      <div class="faq-item">
        <p class="faq-q">${faq.q}</p>
        <p class="faq-a">${faq.a}</p>
      </div>`).join("")}
    </div>
  </div>

  <!-- CTA banner -->
  <div class="cta-banner">
    <h2>Ready to grow your ${region.city} business?</h2>
    <p>Join service businesses across ${region.state} who use Certxa to save time, reduce no-shows, and keep customers coming back.</p>
    ${phone ? `<p style="font-size:1.2rem;font-weight:800;color:${color};margin-bottom:16px;">📞 <a href="tel:${phone.replace(/\D/g, "")}" style="color:${color};">${phone}</a></p>` : ""}
    <a href="${cfg.ctaUrl}" class="btn-primary" style="font-size:1.1rem;padding:16px 40px;">${cfg.cta} →</a>
  </div>

  ${sitemapHtml}

  <!-- Footer -->
  <footer>
    <p>
      &copy; ${new Date().getFullYear()} Certxa &mdash; ${region.city}, ${region.state} &mdash;
      <a href="/privacy-policy">Privacy Policy</a> &middot;
      <a href="/terms-of-service">Terms of Service</a> &middot;
      <a href="/">Back to Certxa.com</a>
    </p>
  </footer>

</body>
</html>`;
}

// ── Write page to disk ─────────────────────────────────────────────────────

export function writeRegionPage(region: SeoRegion, siteUrl?: string, allRegions: SeoRegion[] = []): string {
  ensureDir();
  const html = generateRegionPage(region, siteUrl, allRegions);
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
