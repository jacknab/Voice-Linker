import { useState, useRef, useCallback, useEffect } from "react";
import { ZoomIn, ZoomOut, Maximize2, ChevronDown, ChevronRight, GitBranch, Phone, Mic, CreditCard, Radio, Info, Settings, Search, X } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type NodeType = "entry" | "menu" | "action" | "recording" | "payment" | "live" | "system";

interface KeyOption {
  key: string;
  label: string;
  to?: string;
}

interface IVRNode {
  id: string;
  label: string;
  type: NodeType;
  description: string;
  endpoint?: string;
  options?: KeyOption[];
  x: number;
  y: number;
  collapsed?: boolean;
}

interface IVREdge {
  from: string;
  to: string;
  label?: string;
  style?: "solid" | "dashed";
}

// ─── Node color/icon helpers ─────────────────────────────────────────────────

const NODE_STYLES: Record<NodeType, { bg: string; border: string; header: string; text: string; dot: string }> = {
  entry:     { bg: "bg-blue-950",   border: "border-blue-500",   header: "bg-blue-900",   text: "text-blue-300",   dot: "bg-blue-400" },
  menu:      { bg: "bg-teal-950",   border: "border-teal-500",   header: "bg-teal-900",   text: "text-teal-300",   dot: "bg-teal-400" },
  action:    { bg: "bg-zinc-900",   border: "border-zinc-500",   header: "bg-zinc-800",   text: "text-zinc-300",   dot: "bg-zinc-400" },
  recording: { bg: "bg-purple-950", border: "border-purple-500", header: "bg-purple-900", text: "text-purple-300", dot: "bg-purple-400" },
  payment:   { bg: "bg-amber-950",  border: "border-amber-500",  header: "bg-amber-900",  text: "text-amber-300",  dot: "bg-amber-400" },
  live:      { bg: "bg-green-950",  border: "border-green-500",  header: "bg-green-900",  text: "text-green-300",  dot: "bg-green-400" },
  system:    { bg: "bg-gray-900",   border: "border-gray-600",   header: "bg-gray-800",   text: "text-gray-400",   dot: "bg-gray-500" },
};

const NODE_ICON: Record<NodeType, JSX.Element> = {
  entry:     <Phone size={11} />,
  menu:      <GitBranch size={11} />,
  action:    <Settings size={11} />,
  recording: <Mic size={11} />,
  payment:   <CreditCard size={11} />,
  live:      <Radio size={11} />,
  system:    <Info size={11} />,
};

const NODE_TYPE_LABELS: Record<NodeType, string> = {
  entry: "Entry", menu: "Menu", action: "Action",
  recording: "Recording", payment: "Payment", live: "Live Connect", system: "System",
};

// ─── IVR Node & Edge Data ────────────────────────────────────────────────────
// Grid unit: COL=290px, ROW=165px. Origin at top-center.

const COL = 290;
const ROW = 165;
const OX  = 4400; // canvas origin X (pixels from left edge of SVG)

function px(col: number, row: number) {
  return { x: OX + col * COL, y: 60 + row * ROW };
}

const NODE_WIDTH  = 230;
const NODE_HEIGHT = 120; // base — expands with options

const NODES: IVRNode[] = [
  // ── Spine ──────────────────────────────────────────────────────────────────
  {
    id: "call-entry", label: "Inbound Call Received", type: "entry",
    endpoint: "POST /voice", description: "Twilio webhook fires when a caller dials in. The call is routed by region slug or falls through to /voice/entry.",
    options: [{ key: "auto", label: "New call → Entry Router" }],
    ...px(0, 0),
  },
  {
    id: "voice-entry", label: "Entry Router", type: "action",
    endpoint: "POST /voice/entry", description: "Identifies the caller's phone number and routes based on membership status and site category.",
    options: [
      { key: "→", label: "Returning member → Membership Entry", to: "membership-entry" },
      { key: "→", label: "New / unrecognized → Entry Check",    to: "entry-check" },
    ],
    ...px(0, 1),
  },
  {
    id: "entry-check", label: "Entry Check", type: "action",
    endpoint: "POST /voice/entry-check", description: "Checks if caller has active time, free trial eligibility, or needs to purchase access.",
    options: [
      { key: "→", label: "Has active time → Main Menu",         to: "main-menu" },
      { key: "→", label: "Free trial eligible → Trial Offer",   to: "free-trial-offer" },
      { key: "→", label: "No access → Membership Purchase",     to: "membership-purchase" },
      { key: "→", label: "MW site → Phone Booth",               to: "phone-booth" },
    ],
    ...px(0, 2),
  },
  {
    id: "time-warning", label: "Time Warning", type: "menu",
    endpoint: "POST /voice/time-warning", description: "Shown once per call when remaining time drops below 5 minutes. Offers upsell or let caller continue.",
    options: [
      { key: "1", label: "Buy more time → Membership Purchase", to: "membership-purchase" },
      { key: "#", label: "Continue → Main Menu",                to: "main-menu" },
    ],
    ...px(3, 2),
  },
  {
    id: "free-trial-offer", label: "Free Trial Offer", type: "menu",
    endpoint: "POST /voice/free-trial-offer", description: "Offers new callers a free trial. On accept, time is credited and caller enters main menu.",
    options: [
      { key: "1", label: "Accept trial → Main Menu",            to: "main-menu" },
      { key: "2", label: "Decline → Membership Purchase",       to: "membership-purchase" },
    ],
    ...px(2, 2),
  },

  // ── Membership Entry branch (returning member from another phone) ───────────
  {
    id: "membership-entry", label: "Membership Entry", type: "menu",
    endpoint: "POST /voice/membership-entry", description: "Shown when caller's number isn't on file but they may have a membership number. Asks to enter membership number.",
    options: [
      { key: "1", label: "Enter membership # → Number Entry",  to: "membership-number-entry" },
      { key: "2", label: "No membership → Entry Check",        to: "entry-check" },
    ],
    ...px(-3, 1),
  },
  {
    id: "membership-number-entry", label: "Membership Number Entry", type: "action",
    endpoint: "POST /voice/membership-number-entry", description: "Collects the caller's membership number (up to 10 digits).",
    options: [{ key: "→", label: "Entered → Handle Membership Entry", to: "handle-membership-entry" }],
    ...px(-3, 2),
  },
  {
    id: "handle-membership-entry", label: "Handle Membership Entry", type: "action",
    endpoint: "POST /voice/handle-membership-entry", description: "Validates the membership number. If valid, may prompt for PIN or route to entry check.",
    options: [
      { key: "→", label: "Valid + has PIN → Membership PIN",   to: "membership-pin-entry" },
      { key: "→", label: "Valid + no PIN → Entry Check",       to: "entry-check" },
      { key: "→", label: "Invalid → Entry Check",              to: "entry-check" },
    ],
    ...px(-3, 3),
  },
  {
    id: "entry-check-override", label: "Entry Check Override", type: "action",
    endpoint: "POST /voice/entry-check-override", description: "Grants access when a valid membership number + PIN combination is supplied from a different phone.",
    options: [
      { key: "→", label: "Access granted → Main Menu",         to: "main-menu" },
      { key: "→", label: "No access → Membership Purchase",    to: "membership-purchase" },
    ],
    ...px(-2, 3),
  },
  {
    id: "membership-pin-entry", label: "Membership PIN Entry", type: "menu",
    endpoint: "POST /voice/membership-pin-entry", description: "Prompts for 4-digit PIN when accessing from an unregistered phone.",
    options: [{ key: "→", label: "PIN entered → Verify PIN",   to: "handle-membership-pin-entry" }],
    ...px(-4, 3),
  },
  {
    id: "handle-membership-pin-entry", label: "Verify Membership PIN", type: "action",
    endpoint: "POST /voice/handle-membership-pin-entry", description: "Validates the PIN. Correct → grants access; Incorrect → back to entry.",
    options: [
      { key: "✓", label: "Correct → Entry Check Override",     to: "entry-check-override" },
      { key: "✗", label: "Incorrect → Entry Check",            to: "entry-check" },
    ],
    ...px(-4, 4),
  },

  // ── Main Menu ──────────────────────────────────────────────────────────────
  {
    id: "main-menu", label: "Main Menu", type: "menu",
    endpoint: "POST /voice/main-menu", description: "Central hub of the IVR. Announces remaining time on first visit and routes to all major features.",
    options: [
      { key: "★",  label: "Phone Booth (live)",   to: "phone-booth" },
      { key: "1",  label: "Mailboxes & Ads",       to: "mailbox-menu" },
      { key: "2",  label: "Add Time / Membership", to: "purchase-pre-menu" },
      { key: "4",  label: "Info & Prices",         to: "info-menu" },
      { key: "8",  label: "Manage Membership",     to: "manage-membership" },
      { key: "0",  label: "Customer Service",      to: "customer-service" },
      { key: "9",  label: "Repeat Menu",           to: "main-menu" },
    ],
    ...px(0, 4),
  },

  // ── Phone Booth branch ─────────────────────────────────────────────────────
  {
    id: "phone-booth", label: "Phone Booth", type: "menu",
    endpoint: "POST /voice/phone-booth", description: "Live connector entry gate. Plays welcome audio and MOTD. Routes new users to record their name/greeting, returning users to Greeting Setup.",
    options: [
      { key: "→", label: "No profile → Record Name",           to: "save-name" },
      { key: "→", label: "Has profile → Greeting Setup",       to: "greeting-setup" },
    ],
    ...px(-7, 5),
  },
  {
    id: "save-name", label: "Record Your Name", type: "recording",
    endpoint: "POST /voice/save-name", description: "Caller records their first name (≤5 seconds). Retries on silence.",
    options: [{ key: "→", label: "Name saved → Record Greeting", to: "save-profile" }],
    ...px(-9, 6),
  },
  {
    id: "save-profile", label: "Record Greeting", type: "recording",
    endpoint: "POST /voice/save-profile", description: "Caller records their full greeting (≤60 sec, press # to finish). Min 3 seconds. Saved immediately to DB.",
    options: [{ key: "→", label: "Saved → Review Greeting",    to: "review-greeting" }],
    ...px(-9, 7),
  },
  {
    id: "review-greeting", label: "Review Greeting", type: "menu",
    endpoint: "POST /voice/review-greeting", description: "Lets caller hear, re-record, or accept their new greeting before going live.",
    options: [
      { key: "1", label: "Hear it → play back",                to: "review-greeting" },
      { key: "2", label: "Re-record → Record Name",            to: "save-name" },
      { key: "3", label: "Accept → Zip Code Prompt",           to: "zip-code-prompt" },
      { key: "9", label: "Repeat menu",                        to: "review-greeting" },
    ],
    ...px(-9, 8),
  },
  {
    id: "greeting-setup", label: "Greeting Setup", type: "menu",
    endpoint: "POST /voice/greeting-setup", description: "Shown to RETURNING callers. They can reuse their existing greeting, re-record, or hear it before going live.",
    options: [
      { key: "1/#", label: "Use existing → Go Live",           to: "go-live" },
      { key: "2",   label: "Re-record → Record Name",          to: "save-name" },
      { key: "3",   label: "Hear greeting → loop back",        to: "greeting-setup" },
      { key: "9",   label: "Repeat menu",                      to: "greeting-setup" },
    ],
    ...px(-7, 6),
  },
  {
    id: "zip-code-prompt", label: "Zip Code Prompt", type: "action",
    endpoint: "POST /voice/zip-code-prompt", description: "Optional. Caller enters their 5-digit zip for proximity-sorted profile browsing. Press # or timeout to skip.",
    options: [{ key: "→", label: "Zip saved / skipped → Go Live", to: "go-live" }],
    ...px(-7, 7),
  },
  {
    id: "go-live", label: "Go Live", type: "action",
    endpoint: "POST /voice/go-live", description: "Announces how many callers are on the line, starts billing, then enters Browse Profiles.",
    options: [{ key: "→", label: "Browse Profiles",            to: "browse-profiles" }],
    ...px(-7, 8),
  },
  {
    id: "browse-profiles", label: "Browse Profiles", type: "menu",
    endpoint: "POST /voice/browse-profiles", description: "Core listener loop. Syncs billing, checks for pending invites & unread messages, plays the next caller greeting. Press # anytime to exit.",
    options: [
      { key: "→",  label: "Unread message → Message Menu",     to: "handle-message-menu" },
      { key: "→",  label: "Pending invite → Live Invite",      to: "handle-live-invite" },
      { key: "→",  label: "Playing profile → Profile Menu",    to: "handle-profile-menu" },
      { key: "→",  label: "Queue exhausted → Nearby Callers",  to: "nearby-callers-offer" },
      { key: "#",  label: "Exit → Main Menu",                  to: "main-menu" },
    ],
    ...px(-7, 9),
  },
  {
    id: "nearby-callers-offer", label: "Nearby Callers Offer", type: "menu",
    endpoint: "POST /voice/nearby-callers-offer", description: "After the caller hears all profiles in their region, offers profiles from a linked nearby region.",
    options: [
      { key: "1", label: "Hear nearby region → Browse Profiles", to: "browse-profiles" },
      { key: "2", label: "Start over → Browse Profiles",         to: "browse-profiles" },
    ],
    ...px(-9, 10),
  },
  {
    id: "handle-profile-menu", label: "Profile Menu", type: "menu",
    endpoint: "POST /voice/handle-profile-menu", description: "Actions available after hearing a profile. Supports messaging, live connect, block, flag, location, and navigation.",
    options: [
      { key: "1", label: "Send message → Record Message",      to: "review-message" },
      { key: "2", label: "Next profile → Browse Profiles",     to: "browse-profiles" },
      { key: "3", label: "Connect live → Live Connect Wait",   to: "live-connect-wait" },
      { key: "4", label: "Block → Browse Profiles",            to: "browse-profiles" },
      { key: "5", label: "Previous profile → Browse Profiles", to: "browse-profiles" },
      { key: "6", label: "Location → Location Menu",          to: "handle-location-menu" },
      { key: "7", label: "Flag for review → Browse Profiles",  to: "browse-profiles" },
      { key: "9", label: "Main Menu",                          to: "main-menu" },
    ],
    ...px(-7, 10),
  },
  {
    id: "handle-location-menu", label: "Location Menu", type: "menu",
    endpoint: "POST /voice/handle-location-menu", description: "Announces the profile's location (city/neighborhood). Option to send a message.",
    options: [
      { key: "1", label: "Send message → Record Message",      to: "review-message" },
      { key: "→", label: "Anything else → Browse Profiles",    to: "browse-profiles" },
    ],
    ...px(-5, 11),
  },
  {
    id: "handle-message-menu", label: "Message Menu", type: "menu",
    endpoint: "POST /voice/handle-message-menu", description: "Plays an unread voice message. Options to reply, hear sender's profile, continue browsing, block, or flag.",
    options: [
      { key: "1", label: "Reply → Record Message",             to: "review-message" },
      { key: "2", label: "Sender's profile → Sender Menu",     to: "handle-sender-profile-menu" },
      { key: "3", label: "Continue → Browse Profiles",         to: "browse-profiles" },
      { key: "4", label: "Block sender → Browse Profiles",     to: "browse-profiles" },
      { key: "7", label: "Flag message → Browse Profiles",     to: "browse-profiles" },
      { key: "9", label: "Main Menu",                          to: "main-menu" },
    ],
    ...px(-7, 11),
  },
  {
    id: "handle-sender-profile-menu", label: "Sender Profile Menu", type: "menu",
    endpoint: "POST /voice/handle-sender-profile-menu", description: "Shows sender's profile after the caller chooses to hear it from the message menu.",
    options: [
      { key: "1", label: "Send message → Record Message",      to: "review-message" },
      { key: "2", label: "Continue → Browse Profiles",         to: "browse-profiles" },
      { key: "9", label: "Main Menu",                          to: "main-menu" },
    ],
    ...px(-9, 12),
  },
  {
    id: "review-message", label: "Review Message", type: "menu",
    endpoint: "POST /voice/review-message", description: "Plays back the recorded voice message before sending. Caller can send or cancel.",
    options: [
      { key: "1", label: "Send message",                       to: "browse-profiles" },
      { key: "2", label: "Cancel → Back to caller context",    to: "browse-profiles" },
    ],
    ...px(-7, 12),
  },

  // ── Live Connect sub-branch ────────────────────────────────────────────────
  {
    id: "live-connect-wait", label: "Live Connect: Wait", type: "live",
    endpoint: "POST /voice/live-connect-wait", description: "Initiator (caller A) waits here while the invite is delivered to caller B. Plays ringing tone. Times out after ~30 seconds.",
    options: [
      { key: "→", label: "B accepted → Join Conference",       to: "live-connect-join" },
      { key: "→", label: "B declined / timeout → Browse",      to: "browse-profiles" },
    ],
    ...px(-5, 11),
  },
  {
    id: "handle-live-invite", label: "Live Invite Response (Invitee)", type: "live",
    endpoint: "POST /voice/handle-live-invite", description: "Caller B sees the invite request. Can accept, decline, hear the initiator's greeting, or block them.",
    options: [
      { key: "1", label: "Accept → Join Conference",           to: "live-connect-join" },
      { key: "2", label: "Decline → Browse Profiles",          to: "browse-profiles" },
      { key: "3", label: "Hear greeting → replay invite",      to: "handle-live-invite" },
      { key: "4", label: "Block → Browse Profiles",            to: "browse-profiles" },
    ],
    ...px(-9, 11),
  },
  {
    id: "live-connect-join", label: "Live Connect: Join Conference", type: "live",
    endpoint: "POST /voice/live-connect-join", description: "Twilio REST API redirects initiator here on acceptance. Both callers join the private Twilio Conference room.",
    options: [{ key: "→", label: "In conference → Complete", to: "live-connect-complete" }],
    ...px(-7, 13),
  },
  {
    id: "live-connect-complete", label: "Live Connect: Complete", type: "live",
    endpoint: "POST /voice/live-connect-complete", description: "Fires when either caller exits the conference (press # or hangs up). Cleans up billing and state. Returns to Browse Profiles.",
    options: [{ key: "→", label: "Returns → Browse Profiles", to: "browse-profiles" }],
    ...px(-7, 14),
  },

  // ── Mailbox branch ─────────────────────────────────────────────────────────
  {
    id: "mailbox-menu", label: "Mailbox Menu", type: "menu",
    endpoint: "POST /voice/mailbox-menu", description: "Hub for all mailbox-related actions: accessing your inbox, recording an ad, or browsing others' ads.",
    options: [
      { key: "1",  label: "My Mailbox",                        to: "my-mailbox" },
      { key: "2",  label: "Record Ad → Category Menu (record)", to: "ad-category-menu-record" },
      { key: "3",  label: "Listen to Ads → Category Menu",     to: "ad-category-menu" },
      { key: "★",  label: "Phone Booth",                       to: "phone-booth" },
      { key: "#",  label: "Main Menu",                         to: "main-menu" },
      { key: "9",  label: "Repeat menu",                       to: "mailbox-menu" },
    ],
    ...px(-3, 5),
  },
  {
    id: "my-mailbox", label: "My Mailbox", type: "menu",
    endpoint: "POST /voice/my-mailbox", description: "Checks for unread messages. If found, plays the first one. Otherwise shows mailbox management options.",
    options: [
      { key: "→", label: "Has messages → Mailbox Message",     to: "handle-mailbox-message" },
      { key: "→", label: "No messages → Mailbox Options",      to: "handle-my-mailbox-options" },
    ],
    ...px(-4, 6),
  },
  {
    id: "handle-mailbox-message", label: "Mailbox Message Player", type: "menu",
    endpoint: "POST /voice/handle-mailbox-message", description: "Plays an unread mailbox message with the sender's name. Options to reply, hear sender's ad, skip, or return to menu.",
    options: [
      { key: "1", label: "Reply → Record Message",             to: "review-message" },
      { key: "2", label: "Hear sender's ad → Sender Menu",     to: "handle-mailbox-sender-menu" },
      { key: "3", label: "Skip (mark read) → My Mailbox",      to: "my-mailbox" },
      { key: "9", label: "Mailbox Menu",                       to: "mailbox-menu" },
    ],
    ...px(-3, 6),
  },
  {
    id: "handle-mailbox-sender-menu", label: "Mailbox Sender Menu", type: "menu",
    endpoint: "POST /voice/handle-mailbox-sender-menu", description: "After hearing the sender's ad, offers to send a message back or return to mailbox.",
    options: [
      { key: "1", label: "Send message → Record Message",      to: "review-message" },
      { key: "→", label: "Anything else → My Mailbox",         to: "my-mailbox" },
    ],
    ...px(-2, 7),
  },
  {
    id: "handle-my-mailbox-options", label: "Mailbox Options (Empty)", type: "menu",
    endpoint: "POST /voice/handle-my-mailbox-options", description: "Shown when mailbox has no new messages. Options to record or re-record greeting.",
    options: [
      { key: "1", label: "Record greeting → Record Mailbox Greeting", to: "record-mailbox-greeting" },
      { key: "2", label: "Hear current greeting",              to: "my-mailbox" },
      { key: "9", label: "Mailbox Menu",                       to: "mailbox-menu" },
    ],
    ...px(-4, 7),
  },
  {
    id: "record-mailbox-greeting", label: "Record Mailbox Greeting", type: "recording",
    endpoint: "POST /voice/record-mailbox-greeting", description: "Manages mailbox greeting recording. If one exists, offers re-record or playback. Otherwise goes straight to recording.",
    options: [
      { key: "1", label: "Record new → Save Mailbox Greeting", to: "save-mailbox-greeting" },
      { key: "2", label: "Hear current → loop back",           to: "record-mailbox-greeting" },
      { key: "9", label: "My Mailbox",                         to: "my-mailbox" },
    ],
    ...px(-4, 8),
  },
  {
    id: "save-mailbox-greeting", label: "Save Mailbox Greeting", type: "action",
    endpoint: "POST /voice/save-mailbox-greeting", description: "Saves the recorded mailbox greeting. Min 3 seconds. Returns to My Mailbox.",
    options: [{ key: "→", label: "Saved → My Mailbox", to: "my-mailbox" }],
    ...px(-4, 9),
  },
  {
    id: "ad-category-menu", label: "Ad Category Menu (Listen)", type: "menu",
    endpoint: "POST /voice/ad-category-menu?mode=listen", description: "Lets callers choose which ad category to browse. Categories: Quick & Hot Talk, Bicurious, Kink, Total Top/Bottom, Trans. Also lookup by mailbox number.",
    options: [
      { key: "1-5", label: "Category → Browse Category Ads",  to: "browse-category-ads" },
      { key: "6",   label: "Mailbox Lookup",                  to: "mailbox-lookup" },
      { key: "8",   label: "Category Definitions",            to: "ad-category-definitions" },
      { key: "#",   label: "Mailbox Menu",                    to: "mailbox-menu" },
    ],
    ...px(-1, 6),
  },
  {
    id: "ad-category-menu-record", label: "Ad Category Menu (Record)", type: "menu",
    endpoint: "POST /voice/ad-category-menu?mode=record", description: "Same category menu but in record mode — selecting a category lets the caller record an ad there.",
    options: [
      { key: "1-5", label: "Category → Record Category Ad",  to: "record-category-ad" },
      { key: "6",   label: "Mailbox Lookup",                  to: "mailbox-lookup" },
      { key: "8",   label: "Category Definitions",            to: "ad-category-definitions" },
      { key: "#",   label: "Mailbox Menu",                    to: "mailbox-menu" },
    ],
    ...px(-1, 7),
  },
  {
    id: "browse-category-ads", label: "Browse Category Ads", type: "menu",
    endpoint: "POST /voice/browse-category-ads", description: "Streams ads in the chosen category one at a time (shuffled). After each ad, offers messaging or navigation options.",
    options: [
      { key: "1",  label: "Send message → Record Message",    to: "review-message" },
      { key: "2",  label: "Next ad",                          to: "browse-category-ads" },
      { key: "9",  label: "Category Menu",                    to: "ad-category-menu" },
      { key: "#",  label: "Mailbox Menu",                     to: "mailbox-menu" },
    ],
    ...px(0, 7),
  },
  {
    id: "mailbox-lookup", label: "Mailbox Lookup", type: "action",
    endpoint: "POST /voice/mailbox-lookup", description: "Prompts for a 5-digit mailbox number. Press # to cancel.",
    options: [{ key: "→", label: "Number entered → Lookup Result", to: "handle-mailbox-lookup" }],
    ...px(1, 7),
  },
  {
    id: "handle-mailbox-lookup", label: "Mailbox Lookup Result", type: "action",
    endpoint: "POST /voice/handle-mailbox-lookup", description: "Searches for the mailbox number. Plays the ad if found, or re-prompts if not found.",
    options: [
      { key: "→", label: "Found → Lookup Menu",              to: "handle-mailbox-lookup-menu" },
      { key: "→", label: "Not found → Mailbox Lookup",       to: "mailbox-lookup" },
      { key: "#", label: "Cancel → Mailbox Menu",            to: "mailbox-menu" },
    ],
    ...px(1, 8),
  },
  {
    id: "handle-mailbox-lookup-menu", label: "Mailbox Lookup Menu", type: "menu",
    endpoint: "POST /voice/handle-mailbox-lookup-menu", description: "After hearing a specific mailbox's ad, offers messaging or navigation.",
    options: [
      { key: "1", label: "Send message → Record Message",     to: "review-message" },
      { key: "9", label: "Look up another mailbox",           to: "mailbox-lookup" },
      { key: "#", label: "Mailbox Menu",                      to: "mailbox-menu" },
    ],
    ...px(1, 9),
  },
  {
    id: "ad-category-definitions", label: "Category Definitions", type: "action",
    endpoint: "POST /voice/ad-category-definitions", description: "Reads out brief definitions for each ad category, then returns to the category menu.",
    options: [{ key: "→", label: "Returns → Category Menu",  to: "ad-category-menu" }],
    ...px(2, 7),
  },
  {
    id: "record-category-ad", label: "Record Category Ad", type: "recording",
    endpoint: "POST /voice/record-category-ad", description: "If caller has an existing ad in this category, offers re-record or playback. Otherwise starts recording immediately.",
    options: [
      { key: "1", label: "Record new → Save Category Ad",     to: "save-category-ad" },
      { key: "2", label: "Hear current → loop back",          to: "record-category-ad" },
      { key: "9", label: "Category Menu",                     to: "ad-category-menu-record" },
    ],
    ...px(0, 8),
  },
  {
    id: "save-category-ad", label: "Save Category Ad", type: "action",
    endpoint: "POST /voice/save-category-ad", description: "Saves the recorded mailbox category ad. Min 3 seconds. Returns to Mailbox Menu.",
    options: [{ key: "→", label: "Saved → Mailbox Menu",     to: "mailbox-menu" }],
    ...px(0, 9),
  },

  // ── Purchase branch ────────────────────────────────────────────────────────
  {
    id: "purchase-pre-menu", label: "Purchase Menu", type: "menu",
    endpoint: "POST /voice/purchase-pre-menu", description: "Shows all membership packages with pricing and bonus details. Also offers promo code entry.",
    options: [
      { key: "1",   label: "Promo Code",                      to: "promo-code" },
      { key: "2-4", label: "Select Package → Confirm Package", to: "confirm-package" },
      { key: "9",   label: "Repeat",                          to: "purchase-pre-menu" },
      { key: "#",   label: "Cancel → Main Menu",              to: "main-menu" },
    ],
    ...px(3, 5),
  },
  {
    id: "promo-code", label: "Promo Code Entry", type: "action",
    endpoint: "POST /voice/promo-code", description: "Collects a promotional code (up to 10 digits). On success, credits time and returns to main menu.",
    options: [
      { key: "→", label: "Valid code → Main Menu",            to: "main-menu" },
      { key: "★", label: "Cancel → Main Menu",                to: "main-menu" },
    ],
    ...px(2, 6),
  },
  {
    id: "confirm-package", label: "Confirm Package", type: "menu",
    endpoint: "POST /voice/confirm-package", description: "Reads back the selected package and price (including bonus minutes for first purchase). Asks for confirmation.",
    options: [
      { key: "1", label: "Confirm → Payment Intro",           to: "payment-intro" },
      { key: "2", label: "Different package → Purchase Menu", to: "purchase-pre-menu" },
    ],
    ...px(4, 6),
  },
  {
    id: "payment-intro", label: "Payment Disclosure", type: "payment",
    endpoint: "POST /voice/payment-intro", description: "Reads the billing disclosure (charges appear as 'Toby Media'). Caller presses 1 to proceed to card entry.",
    options: [
      { key: "1", label: "Proceed → Run Payment",             to: "run-payment" },
      { key: "→", label: "Anything else → loop back",         to: "payment-intro" },
    ],
    ...px(4, 7),
  },
  {
    id: "run-payment", label: "Run Payment (Twilio Pay)", type: "payment",
    endpoint: "POST /voice/run-payment", description: "Launches the Twilio <Pay> verb for PCI-compliant card collection via the configured Stripe connector. Up to 2 attempts.",
    options: [{ key: "→", label: "Result → Payment Complete", to: "handle-payment-complete" }],
    ...px(4, 8),
  },
  {
    id: "handle-payment-complete", label: "Payment Result", type: "payment",
    endpoint: "POST /voice/handle-payment-complete", description: "Handles Twilio's post-payment callback. On success, activates membership, issues a member card number if first purchase. On failure, plays decline/error audio.",
    options: [
      { key: "✓", label: "Success → Main Menu",               to: "main-menu" },
      { key: "✗", label: "Declined / Failed → Main Menu",     to: "main-menu" },
    ],
    ...px(4, 9),
  },
  {
    id: "membership-purchase", label: "Membership Purchase", type: "payment",
    endpoint: "POST /voice/membership-purchase", description: "Package selection menu using a pre-recorded MP3 listing all plans. Pressing # cancels; 2/3/4 select packages.",
    options: [
      { key: "2-4", label: "Select plan → Handle Package Selection", to: "handle-package-selection" },
      { key: "#",   label: "Cancel → Main Menu",              to: "main-menu" },
    ],
    ...px(6, 5),
  },
  {
    id: "handle-package-selection", label: "Handle Package Selection", type: "action",
    endpoint: "POST /voice/handle-package-selection", description: "Validates digit and loads package details into the payment session. Routes to confirmation.",
    options: [
      { key: "→", label: "Valid → Confirm Package",           to: "confirm-package" },
      { key: "#", label: "Cancel → Main Menu",                to: "main-menu" },
      { key: "9", label: "Repeat → Purchase Pre-Menu",        to: "purchase-pre-menu" },
    ],
    ...px(6, 6),
  },

  // ── Info branch ────────────────────────────────────────────────────────────
  {
    id: "info-menu", label: "Info Menu", type: "menu",
    endpoint: "POST /voice/info-menu", description: "Top-level information menu. Routes to membership questions.",
    options: [
      { key: "1", label: "Membership Questions",              to: "membership-questions" },
      { key: "9", label: "Main Menu",                         to: "main-menu" },
    ],
    ...px(8, 5),
  },
  {
    id: "membership-questions", label: "Membership Questions", type: "menu",
    endpoint: "POST /voice/membership-questions", description: "Sub-menu for membership info. Offers how-it-works explainer, pricing, or direct purchase.",
    options: [
      { key: "1", label: "How It Works",                      to: "membership-how-it-works" },
      { key: "2", label: "Pricing",                           to: "membership-pricing" },
      { key: "3", label: "Purchase → Membership Purchase",    to: "membership-purchase" },
      { key: "9", label: "Main Menu",                         to: "main-menu" },
    ],
    ...px(8, 6),
  },
  {
    id: "membership-how-it-works", label: "How Membership Works", type: "action",
    endpoint: "POST /voice/membership-how-it-works", description: "Plays an explanation of how the membership system works, then returns to Membership Questions.",
    options: [{ key: "→", label: "Returns → Membership Questions", to: "membership-questions" }],
    ...px(7, 7),
  },
  {
    id: "membership-pricing", label: "Membership Pricing", type: "action",
    endpoint: "POST /voice/membership-pricing", description: "Reads out all plan prices, then returns to Membership Questions.",
    options: [{ key: "→", label: "Returns → Membership Questions", to: "membership-questions" }],
    ...px(9, 7),
  },

  // ── Manage Membership branch ───────────────────────────────────────────────
  {
    id: "manage-membership", label: "Manage Membership", type: "menu",
    endpoint: "POST /voice/manage-membership", description: "Shows current tier, remaining time, and PIN status. Options to add time or set/change PIN.",
    options: [
      { key: "1", label: "Add time → Purchase Pre-Menu",      to: "purchase-pre-menu" },
      { key: "2", label: "Set / Change PIN",                  to: "set-pin" },
      { key: "9", label: "Main Menu",                         to: "main-menu" },
    ],
    ...px(11, 5),
  },
  {
    id: "set-pin", label: "Set PIN", type: "action",
    endpoint: "POST /voice/set-pin", description: "Prompts for a new 4-digit PIN. Timeout returns to Manage Membership.",
    options: [{ key: "→", label: "PIN entered → Verify PIN",  to: "handle-set-pin" }],
    ...px(11, 6),
  },
  {
    id: "handle-set-pin", label: "Validate New PIN", type: "action",
    endpoint: "POST /voice/handle-set-pin", description: "Validates the PIN is exactly 4 digits, then prompts for confirmation entry.",
    options: [
      { key: "✓", label: "Valid → Confirm PIN Entry",         to: "handle-confirm-pin" },
      { key: "✗", label: "Invalid → Set PIN",                 to: "set-pin" },
    ],
    ...px(11, 7),
  },
  {
    id: "handle-confirm-pin", label: "Confirm PIN", type: "action",
    endpoint: "POST /voice/handle-confirm-pin", description: "Caller re-enters PIN. If both entries match, saves to DB and returns to Manage Membership.",
    options: [
      { key: "✓", label: "Match → saved → Manage Membership", to: "manage-membership" },
      { key: "✗", label: "Mismatch → Set PIN",                to: "set-pin" },
    ],
    ...px(11, 8),
  },

  // ── Customer Service ───────────────────────────────────────────────────────
  {
    id: "customer-service", label: "Customer Service", type: "menu",
    endpoint: "POST /voice/customer-service", description: "Informs caller about support channels (website / business hours). Press 9 returns to main menu.",
    options: [
      { key: "9", label: "Main Menu",                         to: "main-menu" },
      { key: "→", label: "Anything else → Main Menu",         to: "main-menu" },
    ],
    ...px(13, 5),
  },
];

// ─── Edges (connections) ──────────────────────────────────────────────────────

const EDGES: IVREdge[] = [
  // Entry spine
  { from: "call-entry",               to: "voice-entry" },
  { from: "voice-entry",              to: "entry-check" },
  { from: "voice-entry",              to: "membership-entry",         label: "returning" },
  { from: "entry-check",              to: "main-menu",                label: "has time" },
  { from: "entry-check",              to: "free-trial-offer",         label: "new" },
  { from: "entry-check",              to: "membership-purchase",      label: "expired",   style: "dashed" },
  { from: "entry-check",              to: "time-warning",             label: "<5 min",    style: "dashed" },
  { from: "free-trial-offer",         to: "main-menu",                label: "accept" },
  { from: "free-trial-offer",         to: "membership-purchase",      label: "decline",   style: "dashed" },
  { from: "time-warning",             to: "main-menu",                label: "#/continue", style: "dashed" },
  { from: "time-warning",             to: "membership-purchase",      label: "1=buy",     style: "dashed" },

  // Membership entry branch
  { from: "membership-entry",         to: "membership-number-entry",  label: "1=enter #" },
  { from: "membership-entry",         to: "entry-check",              label: "2=no membership", style: "dashed" },
  { from: "membership-number-entry",  to: "handle-membership-entry" },
  { from: "handle-membership-entry",  to: "membership-pin-entry",     label: "has PIN" },
  { from: "handle-membership-entry",  to: "entry-check",              label: "no PIN",    style: "dashed" },
  { from: "membership-pin-entry",     to: "handle-membership-pin-entry" },
  { from: "handle-membership-pin-entry", to: "entry-check-override",  label: "correct" },
  { from: "handle-membership-pin-entry", to: "entry-check",           label: "wrong",     style: "dashed" },
  { from: "entry-check-override",     to: "main-menu",                label: "access OK", style: "dashed" },

  // Main menu branches
  { from: "main-menu",                to: "phone-booth",              label: "★" },
  { from: "main-menu",                to: "mailbox-menu",             label: "1" },
  { from: "main-menu",                to: "purchase-pre-menu",        label: "2" },
  { from: "main-menu",                to: "info-menu",                label: "4" },
  { from: "main-menu",                to: "manage-membership",        label: "8" },
  { from: "main-menu",                to: "customer-service",         label: "0" },
  { from: "main-menu",                to: "membership-purchase",      label: "expired",   style: "dashed" },

  // Phone booth flow
  { from: "phone-booth",              to: "save-name",                label: "new user" },
  { from: "phone-booth",              to: "greeting-setup",           label: "returning" },
  { from: "save-name",                to: "save-profile" },
  { from: "save-profile",            to: "review-greeting" },
  { from: "review-greeting",          to: "zip-code-prompt",          label: "3=accept" },
  { from: "review-greeting",          to: "save-name",                label: "2=re-record", style: "dashed" },
  { from: "greeting-setup",           to: "go-live",                  label: "1/#" },
  { from: "greeting-setup",           to: "save-name",                label: "2=re-record", style: "dashed" },
  { from: "zip-code-prompt",          to: "go-live" },
  { from: "go-live",                  to: "browse-profiles" },
  { from: "browse-profiles",          to: "handle-profile-menu",      label: "profile playing" },
  { from: "browse-profiles",          to: "handle-message-menu",      label: "unread msg" },
  { from: "browse-profiles",          to: "handle-live-invite",       label: "invite pending" },
  { from: "browse-profiles",          to: "nearby-callers-offer",     label: "queue done" },
  { from: "nearby-callers-offer",     to: "browse-profiles",          label: "1 or 2" },
  { from: "handle-profile-menu",      to: "review-message",           label: "1=msg" },
  { from: "handle-profile-menu",      to: "browse-profiles",          label: "2=next",    style: "dashed" },
  { from: "handle-profile-menu",      to: "live-connect-wait",        label: "3=connect" },
  { from: "handle-profile-menu",      to: "handle-location-menu",     label: "6=location" },
  { from: "handle-profile-menu",      to: "main-menu",                label: "9",         style: "dashed" },
  { from: "handle-location-menu",     to: "review-message",           label: "1=msg",     style: "dashed" },
  { from: "handle-location-menu",     to: "browse-profiles",          label: "→",         style: "dashed" },
  { from: "handle-message-menu",      to: "review-message",           label: "1=reply" },
  { from: "handle-message-menu",      to: "handle-sender-profile-menu", label: "2=sender" },
  { from: "handle-message-menu",      to: "browse-profiles",          label: "3/4/7",     style: "dashed" },
  { from: "handle-sender-profile-menu", to: "review-message",         label: "1=msg",     style: "dashed" },
  { from: "handle-sender-profile-menu", to: "browse-profiles",        label: "2=continue", style: "dashed" },
  { from: "review-message",           to: "browse-profiles",          label: "sent/cancel", style: "dashed" },
  { from: "live-connect-wait",         to: "live-connect-join",        label: "accepted" },
  { from: "live-connect-wait",         to: "browse-profiles",          label: "fail/timeout", style: "dashed" },
  { from: "handle-live-invite",        to: "live-connect-join",        label: "1=accept" },
  { from: "handle-live-invite",        to: "browse-profiles",          label: "2/4=decline", style: "dashed" },
  { from: "live-connect-join",         to: "live-connect-complete" },
  { from: "live-connect-complete",     to: "browse-profiles",          style: "dashed" },

  // Mailbox flow
  { from: "mailbox-menu",             to: "my-mailbox",               label: "1" },
  { from: "mailbox-menu",             to: "ad-category-menu-record",  label: "2=record" },
  { from: "mailbox-menu",             to: "ad-category-menu",         label: "3=listen" },
  { from: "my-mailbox",               to: "handle-mailbox-message",   label: "has msgs" },
  { from: "my-mailbox",               to: "handle-my-mailbox-options", label: "empty" },
  { from: "handle-mailbox-message",   to: "review-message",           label: "1=reply" },
  { from: "handle-mailbox-message",   to: "handle-mailbox-sender-menu", label: "2=sender" },
  { from: "handle-mailbox-message",   to: "my-mailbox",               label: "3=skip",    style: "dashed" },
  { from: "handle-mailbox-sender-menu", to: "review-message",         label: "1=msg",     style: "dashed" },
  { from: "handle-my-mailbox-options", to: "record-mailbox-greeting", label: "1=record" },
  { from: "record-mailbox-greeting",  to: "save-mailbox-greeting",    label: "1=new" },
  { from: "save-mailbox-greeting",    to: "my-mailbox",               style: "dashed" },
  { from: "ad-category-menu",         to: "browse-category-ads",      label: "1-5" },
  { from: "ad-category-menu",         to: "mailbox-lookup",           label: "6" },
  { from: "ad-category-menu",         to: "ad-category-definitions",  label: "8",         style: "dashed" },
  { from: "ad-category-menu-record",  to: "record-category-ad",       label: "1-5" },
  { from: "browse-category-ads",      to: "review-message",           label: "1=msg",     style: "dashed" },
  { from: "mailbox-lookup",           to: "handle-mailbox-lookup" },
  { from: "handle-mailbox-lookup",    to: "handle-mailbox-lookup-menu", label: "found" },
  { from: "handle-mailbox-lookup-menu", to: "review-message",         label: "1=msg",     style: "dashed" },
  { from: "handle-mailbox-lookup-menu", to: "mailbox-lookup",         label: "9=another", style: "dashed" },
  { from: "ad-category-definitions",  to: "ad-category-menu",         style: "dashed" },
  { from: "record-category-ad",       to: "save-category-ad",         label: "recorded" },
  { from: "save-category-ad",         to: "mailbox-menu",             style: "dashed" },

  // Purchase flow
  { from: "purchase-pre-menu",        to: "promo-code",               label: "1" },
  { from: "purchase-pre-menu",        to: "confirm-package",          label: "2-4 via pkg" },
  { from: "promo-code",               to: "main-menu",                label: "result",    style: "dashed" },
  { from: "confirm-package",          to: "payment-intro",            label: "1=yes" },
  { from: "confirm-package",          to: "purchase-pre-menu",        label: "2=change",  style: "dashed" },
  { from: "payment-intro",            to: "run-payment",              label: "1=proceed" },
  { from: "run-payment",              to: "handle-payment-complete" },
  { from: "handle-payment-complete",  to: "main-menu",                label: "success/fail", style: "dashed" },
  { from: "membership-purchase",      to: "handle-package-selection" },
  { from: "handle-package-selection", to: "confirm-package" },

  // Info flow
  { from: "info-menu",                to: "membership-questions",     label: "1" },
  { from: "membership-questions",     to: "membership-how-it-works",  label: "1" },
  { from: "membership-questions",     to: "membership-pricing",       label: "2" },
  { from: "membership-questions",     to: "membership-purchase",      label: "3" },
  { from: "membership-how-it-works",  to: "membership-questions",     style: "dashed" },
  { from: "membership-pricing",       to: "membership-questions",     style: "dashed" },

  // Manage
  { from: "manage-membership",        to: "purchase-pre-menu",        label: "1=add time" },
  { from: "manage-membership",        to: "set-pin",                  label: "2=PIN" },
  { from: "set-pin",                  to: "handle-set-pin" },
  { from: "handle-set-pin",           to: "handle-confirm-pin",       label: "valid" },
  { from: "handle-set-pin",           to: "set-pin",                  label: "invalid",   style: "dashed" },
  { from: "handle-confirm-pin",       to: "manage-membership",        style: "dashed" },

  // Customer Service
  { from: "customer-service",         to: "main-menu",                label: "9/→",       style: "dashed" },
];

// ─── Canvas dimensions ────────────────────────────────────────────────────────

const CANVAS_W = OX * 2 + COL * 2;
const CANVAS_H = 60 + ROW * 16;

// ─── Helper to build node map ─────────────────────────────────────────────────

function buildNodeMap(nodes: IVRNode[]): Map<string, IVRNode> {
  return new Map(nodes.map(n => [n.id, n]));
}

// ─── SVG edge path ────────────────────────────────────────────────────────────

function edgePath(
  fx: number, fy: number, // from center-bottom
  tx: number, ty: number, // to center-top
): string {
  const dy = ty - fy;
  const cp = Math.max(60, Math.abs(dy) * 0.45);
  return `M ${fx} ${fy} C ${fx} ${fy + cp}, ${tx} ${ty - cp}, ${tx} ${ty}`;
}

// ─── IVR Flow Map Component ───────────────────────────────────────────────────

export default function IvrFlowMap() {
  const containerRef  = useRef<HTMLDivElement>(null);
  const [zoom, setZoom]   = useState(0.45);
  const [pan, setPan]     = useState({ x: -1100, y: -20 });
  const [dragging, setDragging] = useState(false);
  const [lastMouse, setLastMouse] = useState({ x: 0, y: 0 });
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [search, setSearch]   = useState("");
  const [hovered, setHovered] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  const nodeMap = buildNodeMap(NODES);

  // ── Pan/zoom handlers ──────────────────────────────────────────────────────

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.07 : 0.07;
    setZoom(z => Math.max(0.12, Math.min(2, z + delta)));
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest(".ivr-node")) return;
    setDragging(true);
    setLastMouse({ x: e.clientX, y: e.clientY });
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragging) return;
    setPan(p => ({ x: p.x + e.clientX - lastMouse.x, y: p.y + e.clientY - lastMouse.y }));
    setLastMouse({ x: e.clientX, y: e.clientY });
  }, [dragging, lastMouse]);

  const handleMouseUp = useCallback(() => setDragging(false), []);

  // ── Zoom controls ──────────────────────────────────────────────────────────

  const zoomIn  = () => setZoom(z => Math.min(2, z + 0.1));
  const zoomOut = () => setZoom(z => Math.max(0.12, z - 0.1));
  const resetView = () => { setZoom(0.45); setPan({ x: -1100, y: -20 }); };

  // ── Collapse toggle ────────────────────────────────────────────────────────

  const toggleCollapse = (id: string) => {
    setCollapsed(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  // ── Highlight search results ───────────────────────────────────────────────

  const searchLower = search.toLowerCase();
  const matchingIds = new Set(
    search
      ? NODES.filter(n =>
          n.label.toLowerCase().includes(searchLower) ||
          n.description.toLowerCase().includes(searchLower) ||
          (n.endpoint?.toLowerCase().includes(searchLower))
        ).map(n => n.id)
      : []
  );

  // ── Selected node details ──────────────────────────────────────────────────

  const selectedNode = selected ? nodeMap.get(selected) : null;

  // ── Edges visible ─────────────────────────────────────────────────────────

  const visibleEdges = EDGES.filter(e => nodeMap.has(e.from) && nodeMap.has(e.to));

  return (
    <div className="flex flex-col h-full bg-gray-950 overflow-hidden" style={{ minHeight: 0 }}>
      {/* ── Toolbar ───────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 px-4 py-2 bg-gray-900 border-b border-gray-800 flex-shrink-0">
        <div className="flex items-center gap-1.5">
          <GitBranch size={15} className="text-teal-400" />
          <span className="font-mono text-xs text-teal-300 tracking-widest uppercase">IVR Flow Map</span>
        </div>

        <div className="h-4 border-l border-gray-700 mx-1" />

        {/* Legend */}
        <div className="flex items-center gap-3 flex-wrap">
          {(Object.entries(NODE_STYLES) as [NodeType, typeof NODE_STYLES[NodeType]][]).map(([type, s]) => (
            <div key={type} className="flex items-center gap-1">
              <span className={`w-2 h-2 rounded-full ${s.dot}`} />
              <span className="text-xs text-gray-400 font-mono">{NODE_TYPE_LABELS[type]}</span>
            </div>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-2">
          {/* Search */}
          <div className="relative">
            <Search size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-500" />
            <input
              className="bg-gray-800 border border-gray-700 rounded text-xs font-mono text-gray-300 pl-7 pr-7 py-1 w-48 outline-none focus:border-teal-500"
              placeholder="Search nodes..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            {search && (
              <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300">
                <X size={12} />
              </button>
            )}
          </div>

          {/* Zoom controls */}
          <div className="flex items-center gap-1 bg-gray-800 rounded border border-gray-700 px-1">
            <button onClick={zoomOut}  className="p-1 text-gray-400 hover:text-white" title="Zoom out"><ZoomOut  size={13} /></button>
            <span className="text-xs font-mono text-gray-400 w-10 text-center">{Math.round(zoom * 100)}%</span>
            <button onClick={zoomIn}   className="p-1 text-gray-400 hover:text-white" title="Zoom in"> <ZoomIn   size={13} /></button>
            <button onClick={resetView} className="p-1 text-gray-400 hover:text-white" title="Reset view"><Maximize2 size={13} /></button>
          </div>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden" style={{ minHeight: 0 }}>
        {/* ── Canvas ──────────────────────────────────────────────────────── */}
        <div
          ref={containerRef}
          className="flex-1 overflow-hidden relative"
          style={{ cursor: dragging ? "grabbing" : "grab", background: "#0a0a0f" }}
          onWheel={handleWheel}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        >
          {/* Grid dots background */}
          <svg
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}
          >
            <defs>
              <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse"
                patternTransform={`translate(${pan.x % 40} ${pan.y % 40}) scale(${zoom})`}>
                <circle cx="20" cy="20" r="1" fill="#1f2937" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#grid)" />
          </svg>

          {/* Pan/zoom container */}
          <div
            style={{
              position: "absolute",
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              transformOrigin: "0 0",
              width: CANVAS_W,
              height: CANVAS_H,
            }}
          >
            {/* ── SVG edges layer ─────────────────────────────────────── */}
            <svg
              width={CANVAS_W}
              height={CANVAS_H}
              style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "visible" }}
            >
              <defs>
                <marker id="arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
                  <path d="M0,0 L0,6 L8,3 z" fill="#4b5563" />
                </marker>
                <marker id="arrow-teal" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
                  <path d="M0,0 L0,6 L8,3 z" fill="#14b8a6" />
                </marker>
                <marker id="arrow-amber" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
                  <path d="M0,0 L0,6 L8,3 z" fill="#f59e0b" />
                </marker>
              </defs>

              {visibleEdges.map((edge, i) => {
                const from = nodeMap.get(edge.from)!;
                const to   = nodeMap.get(edge.to)!;
                const fx = from.x + NODE_WIDTH / 2;
                const fy = from.y + NODE_HEIGHT;
                const tx = to.x + NODE_WIDTH / 2;
                const ty = to.y;

                const isHighlighted = hovered === edge.from || hovered === edge.to ||
                  selected === edge.from || selected === edge.to;
                const isDashed = edge.style === "dashed";
                const isSearch = search && (matchingIds.has(edge.from) || matchingIds.has(edge.to));

                const strokeColor = isHighlighted ? "#14b8a6" : isSearch ? "#f59e0b" : isDashed ? "#374151" : "#374151";
                const opacity = search && !isSearch && !isHighlighted ? 0.1 : isDashed ? 0.4 : 0.6;
                const markerId = isHighlighted ? "url(#arrow-teal)" : isSearch ? "url(#arrow-amber)" : "url(#arrow)";

                return (
                  <g key={i} opacity={opacity}>
                    <path
                      d={edgePath(fx, fy, tx, ty)}
                      fill="none"
                      stroke={strokeColor}
                      strokeWidth={isHighlighted ? 2.5 : 1.5}
                      strokeDasharray={isDashed ? "6,4" : undefined}
                      markerEnd={markerId}
                    />
                    {edge.label && (
                      <text
                        x={(fx + tx) / 2}
                        y={(fy + ty) / 2 - 4}
                        textAnchor="middle"
                        fill={isHighlighted ? "#5eead4" : "#6b7280"}
                        fontSize={isHighlighted ? 11 : 10}
                        fontFamily="monospace"
                        fontWeight={isHighlighted ? "600" : "normal"}
                      >
                        {edge.label}
                      </text>
                    )}
                  </g>
                );
              })}
            </svg>

            {/* ── Node divs layer ─────────────────────────────────────── */}
            {NODES.map(node => {
              const s = NODE_STYLES[node.type];
              const isHov = hovered === node.id;
              const isSel = selected === node.id;
              const isMatch = search ? matchingIds.has(node.id) : false;
              const isDimmed = search && !matchingIds.has(node.id);
              const isConnected = hovered != null &&
                EDGES.some(e => (e.from === hovered && e.to === node.id) || (e.to === hovered && e.from === node.id));

              const heightPx = NODE_HEIGHT + (node.options ? node.options.length * 22 : 0);

              return (
                <div
                  key={node.id}
                  className={`ivr-node absolute rounded-lg border overflow-hidden transition-all duration-150 select-none ${s.bg} ${s.border}
                    ${isSel ? "ring-2 ring-teal-400 ring-offset-1 ring-offset-black" : ""}
                    ${isHov ? "shadow-lg shadow-black/60" : ""}
                    ${isDimmed && !isConnected ? "opacity-20" : "opacity-100"}
                    ${isMatch ? "ring-2 ring-amber-400" : ""}
                  `}
                  style={{
                    left: node.x,
                    top: node.y,
                    width: NODE_WIDTH,
                    minHeight: heightPx,
                    zIndex: isSel || isHov ? 10 : 1,
                    cursor: "pointer",
                  }}
                  onMouseEnter={() => setHovered(node.id)}
                  onMouseLeave={() => setHovered(null)}
                  onClick={(e) => { e.stopPropagation(); setSelected(s => s === node.id ? null : node.id); }}
                >
                  {/* Header */}
                  <div className={`${s.header} px-2.5 py-1.5 flex items-center gap-1.5`}>
                    <span className={`${s.text} flex-shrink-0`}>{NODE_ICON[node.type]}</span>
                    <span className={`font-mono text-[10px] tracking-widest uppercase ${s.text} truncate`}>
                      {NODE_TYPE_LABELS[node.type]}
                    </span>
                    <button
                      onClick={e => { e.stopPropagation(); toggleCollapse(node.id); }}
                      className={`ml-auto ${s.text} hover:text-white`}
                    >
                      {collapsed.has(node.id) ? <ChevronRight size={11} /> : <ChevronDown size={11} />}
                    </button>
                  </div>

                  {/* Node label */}
                  <div className="px-2.5 pt-1.5 pb-1">
                    <div className="text-white font-semibold text-xs leading-tight">{node.label}</div>
                    {node.endpoint && !collapsed.has(node.id) && (
                      <div className="text-gray-500 font-mono text-[9px] mt-0.5 truncate">{node.endpoint}</div>
                    )}
                  </div>

                  {/* Options */}
                  {!collapsed.has(node.id) && node.options && node.options.length > 0 && (
                    <div className={`border-t ${s.border} mx-2 mt-1`}>
                      {node.options.map((opt, i) => (
                        <div key={i} className="flex items-center gap-1.5 py-0.5 px-0.5">
                          <span className={`font-mono text-[10px] font-bold ${s.text} w-8 flex-shrink-0 text-right`}>
                            {opt.key}
                          </span>
                          <span className="text-gray-400 text-[10px] leading-tight truncate">{opt.label}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Detail panel ──────────────────────────────────────────────────── */}
        {selectedNode && (
          <div className="w-72 bg-gray-900 border-l border-gray-800 flex flex-col flex-shrink-0 overflow-y-auto">
            <div className={`${NODE_STYLES[selectedNode.type].header} px-4 py-3 flex items-center justify-between`}>
              <div className="flex items-center gap-2">
                <span className={NODE_STYLES[selectedNode.type].text}>
                  {NODE_ICON[selectedNode.type]}
                </span>
                <span className={`font-mono text-xs uppercase tracking-widest ${NODE_STYLES[selectedNode.type].text}`}>
                  {NODE_TYPE_LABELS[selectedNode.type]}
                </span>
              </div>
              <button onClick={() => setSelected(null)} className="text-gray-400 hover:text-white">
                <X size={14} />
              </button>
            </div>

            <div className="p-4 flex flex-col gap-4">
              <div>
                <div className="text-white font-semibold text-sm">{selectedNode.label}</div>
                {selectedNode.endpoint && (
                  <div className="font-mono text-[10px] text-gray-500 mt-1 bg-gray-800 px-2 py-1 rounded">
                    {selectedNode.endpoint}
                  </div>
                )}
              </div>

              <div>
                <div className="text-gray-500 text-[10px] uppercase tracking-widest font-mono mb-1">Description</div>
                <div className="text-gray-300 text-xs leading-relaxed">{selectedNode.description}</div>
              </div>

              {selectedNode.options && selectedNode.options.length > 0 && (
                <div>
                  <div className="text-gray-500 text-[10px] uppercase tracking-widest font-mono mb-2">Key Options</div>
                  <div className="flex flex-col gap-1">
                    {selectedNode.options.map((opt, i) => (
                      <div key={i} className="flex items-start gap-2 bg-gray-800 rounded px-2 py-1.5">
                        <span className={`font-mono text-xs font-bold ${NODE_STYLES[selectedNode.type].text} w-8 flex-shrink-0 text-right`}>
                          {opt.key}
                        </span>
                        <span className="text-gray-300 text-xs">{opt.label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Connected nodes */}
              <div>
                <div className="text-gray-500 text-[10px] uppercase tracking-widest font-mono mb-2">Connections</div>
                <div className="flex flex-col gap-1">
                  {EDGES.filter(e => e.from === selectedNode.id).map((e, i) => {
                    const target = nodeMap.get(e.to);
                    if (!target) return null;
                    return (
                      <button
                        key={i}
                        onClick={() => setSelected(e.to)}
                        className="flex items-center gap-2 bg-gray-800 hover:bg-gray-750 rounded px-2 py-1.5 text-left group"
                      >
                        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${NODE_STYLES[target.type].dot}`} />
                        <span className="text-gray-300 text-xs truncate group-hover:text-white">{target.label}</span>
                        {e.label && <span className="ml-auto text-gray-600 font-mono text-[10px]">{e.label}</span>}
                      </button>
                    );
                  })}
                  {EDGES.filter(e => e.to === selectedNode.id).map((e, i) => {
                    const source = nodeMap.get(e.from);
                    if (!source) return null;
                    return (
                      <button
                        key={`in-${i}`}
                        onClick={() => setSelected(e.from)}
                        className="flex items-center gap-2 bg-gray-800/50 hover:bg-gray-800 rounded px-2 py-1.5 text-left group border border-dashed border-gray-700"
                      >
                        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${NODE_STYLES[source.type].dot}`} />
                        <span className="text-gray-500 text-xs truncate group-hover:text-gray-300">← {source.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Status bar ──────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-4 px-4 py-1 bg-gray-900 border-t border-gray-800 flex-shrink-0">
        <span className="font-mono text-[10px] text-gray-500">{NODES.length} nodes · {EDGES.length} connections</span>
        <span className="font-mono text-[10px] text-gray-600">Scroll to zoom · Drag to pan · Click node for details</span>
        {search && (
          <span className="font-mono text-[10px] text-amber-400">{matchingIds.size} results for "{search}"</span>
        )}
        <span className="ml-auto font-mono text-[10px] text-gray-600">Phase 1 — Read-only · Phase 2: Edit prompts · Phase 3: Drag & drop</span>
      </div>
    </div>
  );
}
