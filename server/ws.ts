import { WebSocketServer, WebSocket } from "ws";
import type { Server } from "http";
import type { IncomingMessage } from "http";
import type { CallerBrowseState, BrowseQueueItem } from "./ivr-browse-state";
import { onBrowseStateChange } from "./redis";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface QueueEntry {
  callSid: string;
  phoneNumber: string;
  queue: BrowseQueueItem[];
  greetingsPlayed: number;
  lastUpdate: number;
}

// ── State ─────────────────────────────────────────────────────────────────────

const activeQueues  = new Map<string, QueueEntry>();
const callerPhones  = new Map<string, string>();   // callSid → E.164 phone
const adminSockets  = new Set<WebSocket>();

let wss: WebSocketServer | null = null;

// ── Helpers ───────────────────────────────────────────────────────────────────

function broadcast(msg: unknown): void {
  if (adminSockets.size === 0) return;
  const data = JSON.stringify(msg);
  for (const ws of adminSockets) {
    if (ws.readyState === WebSocket.OPEN) {
      try { ws.send(data); } catch { /* ignore */ }
    }
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/** Call this from the IVR entry handler so the queue can display phone numbers. */
export function registerCallerPhone(callSid: string, phoneNumber: string): void {
  callerPhones.set(callSid, phoneNumber);
}

/**
 * Returns the CallSids of all callers currently active in the live queue.
 * Used by liveQueue.ts to broadcast new-caller injections and departures.
 */
export function getActiveCallSids(): string[] {
  return Array.from(activeQueues.keys());
}

/**
 * Called by the Redis setBrowseState wrapper so every queue write is reflected
 * in real-time on connected admin clients.
 */
export function broadcastQueueState(callSid: string, state: CallerBrowseState): void {
  const phoneNumber = callerPhones.get(callSid) ?? callSid;
  const entry: QueueEntry = {
    callSid,
    phoneNumber,
    queue: state.queue,
    greetingsPlayed: state.greetingsPlayed,
    lastUpdate: Date.now(),
  };
  activeQueues.set(callSid, entry);
  broadcast({ type: "queue:update", ...entry });
}

/** Call this when a call ends so the admin panel shows the caller has left. */
export function removeCallerQueue(callSid: string): void {
  activeQueues.delete(callSid);
  callerPhones.delete(callSid);
  broadcast({ type: "caller:removed", callSid });
  broadcast({ type: "callers:changed" });
}

/**
 * Broadcast a generic "callers list changed" event so the admin dashboard
 * can immediately re-fetch active-caller data without waiting for a poll cycle.
 * Call this whenever a real call is added or removed.
 */
export function broadcastCallersChanged(): void {
  broadcast({ type: "callers:changed" });
}

/**
 * Broadcast a real-time balance update for a caller that is currently on the
 * IVR (not in a live conference). Called by the periodic IVR billing ticker
 * every 30 seconds so the admin dashboard shows balances draining live.
 */
export function broadcastBalanceUpdate(
  callSid: string,
  userId: string | null,
  remainingSeconds: number,
): void {
  broadcast({ type: "balance:update", callSid, userId, remainingSeconds });
}

// ── Server init ───────────────────────────────────────────────────────────────

export function initWebSocketServer(httpServer: Server): void {
  wss = new WebSocketServer({ noServer: true });

  // Intercept HTTP upgrade events for /ws/queues only; leave other paths
  // (e.g. Vite HMR /@vite/client) untouched.
  httpServer.on("upgrade", (req: IncomingMessage, socket: any, head: Buffer) => {
    if ((req.url ?? "").startsWith("/ws/queues")) {
      wss!.handleUpgrade(req, socket, head, (ws) => {
        wss!.emit("connection", ws, req);
      });
    }
  });

  wss.on("connection", (ws: WebSocket, req: IncomingMessage) => {
    // Auth: require ADMIN_SECRET_KEY when set; skip in dev (key not set)
    const url      = new URL(req.url ?? "/", "http://localhost");
    const provided = url.searchParams.get("key") ?? (req.headers["x-admin-key"] as string ?? "");
    const required = process.env.ADMIN_SECRET_KEY ?? "";
    if (required && provided !== required) {
      ws.send(JSON.stringify({ type: "error", message: "unauthorized" }));
      ws.close(1008, "unauthorized");
      return;
    }

    adminSockets.add(ws);

    // Full snapshot of every active caller's queue on connect
    const queues: Record<string, QueueEntry> = {};
    for (const [sid, entry] of activeQueues) queues[sid] = entry;
    ws.send(JSON.stringify({ type: "snapshot", queues }));

    ws.on("message", async (raw) => {
      try {
        const msg = JSON.parse(raw.toString()) as {
          type: string;
          callSid?: string;
          userId?: string;
          profile?: BrowseQueueItem;
        };

        const sid = msg.callSid;
        if (!sid) return;

        // Lazy-import to avoid circular dep with redis.ts
        const { getBrowseState, setBrowseState } = await import("./redis");

        if (msg.type === "queue:inject" && msg.profile?.userId) {
          const state = await getBrowseState(sid);
          if (!state) return;
          // Insert at front, deduplicate
          state.queue = [
            msg.profile,
            ...state.queue.filter(p => p.userId !== msg.profile!.userId),
          ];
          await setBrowseState(sid, state);

        } else if (msg.type === "queue:remove" && msg.userId) {
          const state = await getBrowseState(sid);
          if (!state) return;
          state.queue = state.queue.filter(p => p.userId !== msg.userId);
          await setBrowseState(sid, state);
        }
      } catch (err) {
        console.error("[ws:queues] message error:", err);
      }
    });

    ws.on("close", () => adminSockets.delete(ws));
    ws.on("error", () => adminSockets.delete(ws));
  });

  // Register as a listener on Redis browse-state writes so every queue change
  // is automatically pushed to connected admin clients.
  onBrowseStateChange((callSid, state) => broadcastQueueState(callSid, state));

  console.log("[ws:queues] WebSocket queue server ready at /ws/queues");
}
