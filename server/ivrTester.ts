import { randomUUID } from "crypto";
import { storage } from "./storage";

export interface IVRLogEntry {
  type: "say" | "play" | "keypress" | "system" | "record" | "conference" | "hangup" | "pay";
  content: string;
  text?: string;
  ts: number;
}

export interface IVRTestSession {
  id: string;
  fromNumber: string;
  callSid: string;
  gatherAction: string | null;
  numDigits: number | null;
  finishOnKey: string | null;
  log: IVRLogEntry[];
  status: "active" | "ended";
  waitingForInput: boolean;
  recordAction: string | null;
}

export interface IVRStepResult {
  entries: IVRLogEntry[];
  status: "active" | "ended";
  waitingForInput: boolean;
  waitingForRecording: boolean;
  numDigits: number | null;
}

export const ivrTestSessions = new Map<string, IVRTestSession>();

const MAX_REDIRECTS = 15;

// ── Expected text lookup table ────────────────────────────────────────────────
// Maps audio filenames to the text the IVR expects the audio to speak.
// Used by the admin tester to surface mismatches between recorded audio and IVR intent.
const PROMPT_TEXTS: Record<string, string> = {
  "system_greeting.mp3":          "Welcome to the Male Box. This service assumes no responsibility for personal meetings.",
  "disclaimer.mp3":               "(disclaimer — content policy audio)",
  "gender_select.mp3":            "Guys, press one to talk to women. Women, press three to talk to guys.",
  "free_mode_announcement.mp3":   "Great news! All calls are completely free right now. No membership required. Enjoy unlimited time on the system. Connecting you now.",
  "membership_entry_prompt.mp3":  "Enter your membership card number now, or press pound to skip.",
  "membership_center.mp3":        "Membership center. To sign in to your membership press 1. To return to the main menu press pound.",
  "main_menu.mp3":                "Main menu. To enter the male box press 1. For mailboxes and personal ads press 3. To add time or purchase a membership press 2. For your voicemail press 6. For information on membership prices press 4. To manage your membership press 8. For customer service press 0. To repeat these choices press 9.",
  "mw_main_menu.mp3":             "Main menu. If you're ready to join the action press 1. To buy membership time press 2. To manage your membership press 8. For customer service press 0. To repeat these choices press 9.",
  "free_trial_offer.mp3":         "We would like to offer you a free trial. To get your free trial now press 1. To get your free trial later press the pound key.",
  "free_trial_terms.mp3":         "Your free trial will expire in seven days and it must be used from this phone number.",
  "phone_booth_welcome.mp3":      "Welcome to the live connector. Greetings from all the local guys here right now. Swap private messages and then connect live for a totally private conversation. You can leave the connector anytime you want by pressing the pound sign.",
  "welcome_record_name.mp3":      "You need to record a greeting to introduce yourself to the other guys first. Let's record the name you want to use. After the tone, record just your first name.",
  "no_caller_id.mp3":             "We could not identify your call. Goodbye.",
  "error_generic.mp3":            "An error occurred. Please try again later.",
  "invalid_choice.mp3":           "Invalid choice.",
  "membership_linked.mp3":        "Your membership has been verified. Welcome.",
  "membership_invalid.mp3":       "We could not find a card with that number. Please check your card and try again.",
  "link_code_invalid.mp3":        "That code is invalid or has expired. Please generate a new code from your web account and try again.",
  "access_expired.mp3":           "Your access has expired.",
  "goodbye.mp3":                  "Thank you for calling. Goodbye.",
  "name_retry.mp3":               "We didn't catch your name. Please try again.",
  "name_saved_record_greeting.mp3": "Great. Now record your greeting for other callers. After the tone, press any key when done.",
  "greeting_error.mp3":           "That greeting was too short. Please try again after the tone. Press any key when done.",
  "profile_save_error.mp3":       "We could not save your profile. Please try again.",
  "package_cancelled.mp3":        "Cancelled. Returning to the main menu.",
  "mailbox_setup_dob_invalid.mp3":"We did not receive a valid date of birth. Please try again.",
  "mailbox_setup_cancelled.mp3":  "Mailbox setup cancelled.",
  "mailbox_setup_passcode_reenter.mp3": "Please re-enter your four digit passcode.",
  "record_reply.mp3":             "Record your reply after the tone. Press any key when done.",
  "record_message.mp3":           "Record your message after the tone. Press any key when done.",
  "no_greeting_found.mp3":        "No greeting found.",
  "no_profiles.mp3":              "There are no profiles available right now. Please call back later.",
  "profile_saved.mp3":            "Your greeting has been saved.",
  "live_invite_options.mp3":      "To accept, press 1. To decline and hear the next caller's greeting, press 2. To hear this caller's greeting, press 3. To block this caller, press 4.",
  "message_options.mp3":          "To connect live with this caller, press 1. To reply with a message, press 2. To skip this message, press 3. To hear the last message you sent them, press 4. To save this message, press 5. To block this caller, press 7. To hear this caller's greeting and location, press 8. To repeat this message and menu choices, press 9. To exit or change your greeting, press pound.",
  "new_caller_closest_to_you.mp3":"New caller closest to you.",
  "profile_options.mp3":          "Press 1 to send this caller a message. Press 2 to skip to the next profile. Press 3 to connect live with this caller. Press 4 to block this caller. Press 5 to hear the previous profile. Press 6 to hear this caller's location. Press 7 to flag this profile for review. Press 9 to return to main menu.",
  "nearby_callers_offer.mp3":     "You have heard all the callers close to you.",
  "zip_code_saved.mp3":           "Got it. We'll use your zip code to show you nearby callers.",
  "motd.mp3":                     "(message of the day)",
  "motd_phone_booth.mp3":         "(phone booth message of the day)",
  "motd_main_menu.mp3":           "(main menu message of the day)",
  "backdoor_expires_soon.mp3":    "Your backdoor access pass expires soon.",
  "time_deduction_start.mp3":     "(time deduction start notification)",
  "time_deduction_stop.mp3":      "(time deduction stop notification)",
  "phrase_you_have.mp3":          "You have",
  "phrase_minute_of_pbtr.mp3":    "minute of phone booth time remaining.",
  "phrase_minutes_of_pbtr.mp3":   "minutes of phone booth time remaining.",
  "phrase_there_is.mp3":          "There is",
  "phrase_there_are.mp3":         "There are",
};

function lookupPromptText(audioPath: string): string | undefined {
  const filename = audioPath.split("/").pop() ?? audioPath;
  if (PROMPT_TEXTS[filename]) return PROMPT_TEXTS[filename];
  // num_XXX.mp3 → the number itself
  const numMatch = filename.match(/^num_(\d+)\.mp3$/);
  if (numMatch) return numMatch[1];
  // backdoor_expires_Xhr.mp3
  const bdMatch = filename.match(/^backdoor_expires_(\d+)hr\.mp3$/);
  if (bdMatch) return `Your backdoor access pass expires in ${bdMatch[1]} hour${bdMatch[1] === "1" ? "" : "s"}.`;
  return undefined;
}

function extractAudioPath(rawUrl: string, serverBase: string): string {
  if (!rawUrl) return "";
  try {
    const u = new URL(rawUrl);
    return u.pathname;
  } catch {
    if (rawUrl.startsWith("/")) return rawUrl;
    return `/${rawUrl}`;
  }
}

function parseTwiMLAndAdvance(
  xml: string,
  session: IVRTestSession,
  serverBase: string
): { redirect: string | null; hangup: boolean; waitingForInput: boolean } {
  const ts = Date.now();

  // ── Extract Gather block first to avoid double-matching inner Say/Play ──
  const gatherRe = /<Gather([^>]*)>([\s\S]*?)<\/Gather>/;
  const gatherMatch = xml.match(gatherRe);
  const xmlWithoutGather = gatherMatch ? xml.replace(gatherMatch[0], "<!--GATHER-->") : xml;

  // ── Top-level Say/Play (NOT inside Gather) ──
  const topSayRe = /<Say[^>]*>([\s\S]*?)<\/Say>/g;
  for (const m of Array.from(xmlWithoutGather.matchAll(topSayRe))) {
    const text = m[1].trim();
    if (text) session.log.push({ type: "say", content: text, ts });
  }
  const topPlayRe = /<Play[^>]*>([\s\S]*?)<\/Play>/g;
  for (const m of Array.from(xmlWithoutGather.matchAll(topPlayRe))) {
    const rawUrl = m[1].trim();
    const audioPath = extractAudioPath(rawUrl, serverBase);
    session.log.push({ type: "play", content: audioPath, text: lookupPromptText(audioPath), ts });
  }

  // ── Gather ──
  if (gatherMatch) {
    const attrs = gatherMatch[1];
    const inner = gatherMatch[2];

    const actionMatch = attrs.match(/action="([^"]+)"/);
    const numDigitsMatch = attrs.match(/numDigits="(\d+)"/);
    const finishOnKeyMatch = attrs.match(/finishOnKey="([^"]*)"/);

    if (actionMatch) {
      const a = actionMatch[1];
      session.gatherAction = a.startsWith("http") ? a : `${serverBase}${a}`;
    }
    session.numDigits = numDigitsMatch ? parseInt(numDigitsMatch[1], 10) : null;
    session.finishOnKey = finishOnKeyMatch ? finishOnKeyMatch[1] : null;

    // Inner Say/Play
    for (const m of Array.from(inner.matchAll(/<Say[^>]*>([\s\S]*?)<\/Say>/g))) {
      const text = m[1].trim();
      if (text) session.log.push({ type: "say", content: text, ts });
    }
    for (const m of Array.from(inner.matchAll(/<Play[^>]*>([\s\S]*?)<\/Play>/g))) {
      const rawUrl = m[1].trim();
      const audioPath = extractAudioPath(rawUrl, serverBase);
      session.log.push({ type: "play", content: audioPath, text: lookupPromptText(audioPath), ts });
    }

    return { redirect: null, hangup: false, waitingForInput: true };
  }

  // ── Record ──
  const recordMatch = xml.match(/<Record([^>]*)>/);
  if (recordMatch) {
    const attrs = recordMatch[1];
    const actionMatch = attrs.match(/action="([^"]+)"/);
    session.log.push({ type: "record", content: "Recording prompt (recording simulated)", ts });
    if (actionMatch) {
      const a = actionMatch[1];
      session.recordAction = a.startsWith("http") ? a : `${serverBase}${a}`;
    }
    return { redirect: null, hangup: false, waitingForInput: true };
  }

  // ── Conference / Dial ──
  if (/<Conference/.test(xml) || /<Dial/.test(xml)) {
    session.log.push({ type: "conference", content: "Live conference bridge initiated (not simulatable)", ts });
    return { redirect: null, hangup: true, waitingForInput: false };
  }

  // ── Pay ──
  if (/<Pay/.test(xml)) {
    session.log.push({ type: "pay", content: "Secure payment collection (not simulatable)", ts });
    return { redirect: null, hangup: true, waitingForInput: false };
  }

  // ── Redirect ──
  const redirectMatch = xml.match(/<Redirect[^>]*>([\s\S]*?)<\/Redirect>/);
  if (redirectMatch) {
    const url = redirectMatch[1].trim();
    const redirect = url.startsWith("http") ? url : `${serverBase}${url}`;
    return { redirect, hangup: false, waitingForInput: false };
  }

  // ── Hangup ──
  if (/<Hangup/.test(xml) || /<Reject/.test(xml)) {
    session.log.push({ type: "hangup", content: "Call ended.", ts });
    return { redirect: null, hangup: true, waitingForInput: false };
  }

  // Response with no further action — treat as ended
  return { redirect: null, hangup: true, waitingForInput: false };
}

async function internalPost(
  url: string,
  params: Record<string, string>
): Promise<string> {
  const body = new URLSearchParams(params).toString();
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  return resp.text();
}

export async function executeIVRStep(
  session: IVRTestSession,
  startUrl: string,
  extraParams: Record<string, string> = {}
): Promise<void> {
  const serverBase = `http://localhost:${process.env.PORT || "5000"}`;

  const baseParams: Record<string, string> = {
    From: session.fromNumber,
    CallSid: session.callSid,
    To: "+18007302508",
    CallStatus: "in-progress",
    ...extraParams,
  };

  let url = startUrl.startsWith("http") ? startUrl : `${serverBase}${startUrl}`;
  let redirectCount = 0;

  while (redirectCount < MAX_REDIRECTS) {
    let xml: string;
    try {
      xml = await internalPost(url, baseParams);
    } catch (err) {
      session.log.push({
        type: "system",
        content: `Error reaching ${url}: ${(err as Error).message}`,
        ts: Date.now(),
      });
      session.status = "ended";
      session.waitingForInput = false;
      return;
    }

    // Remove extra params after first call so subsequent redirects don't carry Digits
    delete baseParams.Digits;

    const { redirect, hangup, waitingForInput } = parseTwiMLAndAdvance(xml, session, serverBase);

    if (hangup) {
      session.status = "ended";
      session.waitingForInput = false;
      return;
    }

    if (waitingForInput) {
      session.waitingForInput = true;
      return;
    }

    if (redirect) {
      url = redirect;
      redirectCount++;
      continue;
    }

    // No redirect, no gather, no hangup — treat as ended
    session.status = "ended";
    session.waitingForInput = false;
    return;
  }

  session.log.push({
    type: "system",
    content: "Max redirect depth reached — stopping.",
    ts: Date.now(),
  });
  session.status = "ended";
  session.waitingForInput = false;
}

export async function createIVRSession(fromNumber: string): Promise<IVRTestSession> {
  const id = randomUUID();
  const callSid = `TEST-${randomUUID().replace(/-/g, "").toUpperCase().slice(0, 20)}`;
  const session: IVRTestSession = {
    id,
    fromNumber,
    callSid,
    gatherAction: null,
    numDigits: null,
    finishOnKey: null,
    log: [],
    status: "active",
    waitingForInput: false,
    recordAction: null,
  };
  ivrTestSessions.set(id, session);
  session.log.push({ type: "system", content: `Connected from ${fromNumber} (simulated)`, ts: Date.now() });
  const serverBase = `http://localhost:${process.env.PORT || "5000"}`;
  await executeIVRStep(session, `${serverBase}/voice`);
  return session;
}

export async function sendIVRInput(
  session: IVRTestSession,
  digits: string
): Promise<void> {
  session.log.push({ type: "keypress", content: digits, ts: Date.now() });
  session.waitingForInput = false;

  // Handle record simulation: any key press submits empty recording and advances
  if (session.recordAction) {
    const action = session.recordAction;
    session.recordAction = null;
    session.gatherAction = null;
    await executeIVRStep(session, action, {
      Digits: digits,
      RecordingUrl: "",
      RecordingDuration: "5",
      RecordingSid: `TEST-REC-${Date.now()}`,
    });
    return;
  }

  if (!session.gatherAction) {
    session.log.push({ type: "system", content: "No pending input expected.", ts: Date.now() });
    return;
  }

  const action = session.gatherAction;
  session.gatherAction = null;
  session.numDigits = null;
  await executeIVRStep(session, action, { Digits: digits });
}

export async function endIVRSession(session: IVRTestSession): Promise<void> {
  try {
    await storage.removeActiveCallsByUser(
      (await storage.getUserByPhone(session.fromNumber))?.id ?? ""
    ).catch(() => {});
  } catch {
    // best-effort
  }
  session.status = "ended";
  session.waitingForInput = false;
  session.log.push({ type: "hangup", content: "Disconnected by admin.", ts: Date.now() });
  ivrTestSessions.delete(session.id);
}
