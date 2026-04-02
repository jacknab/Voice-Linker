import { randomUUID } from "crypto";
import { storage } from "./storage";

export interface IVRLogEntry {
  type: "say" | "play" | "keypress" | "system" | "record" | "conference" | "hangup" | "pay";
  content: string;
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
  numDigits: number | null;
}

export const ivrTestSessions = new Map<string, IVRTestSession>();

const MAX_REDIRECTS = 15;

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
    session.log.push({ type: "play", content: audioPath, ts });
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
      session.log.push({ type: "play", content: audioPath, ts });
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
      RecordingDuration: "0",
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
