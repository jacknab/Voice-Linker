import Redis from "ioredis";
import type { CallerBrowseState } from "./ivr-browse-state";

const BROWSE_STATE_TTL = 1800; // 30 minutes in seconds

type SerializableBrowseState = Omit<CallerBrowseState, "blockedUserIds"> & {
  blockedUserIds: string[];
};

function serialize(state: CallerBrowseState): SerializableBrowseState {
  return {
    ...state,
    blockedUserIds: Array.from(state.blockedUserIds),
  };
}

function deserialize(raw: SerializableBrowseState): CallerBrowseState {
  return {
    ...raw,
    blockedUserIds: new Set(raw.blockedUserIds),
  };
}

// In-memory fallback used when Redis is unavailable or REDIS_URL is not set
const memoryFallback = new Map<string, CallerBrowseState>();

let redisClient: Redis | null = null;
let redisAvailable = false;
let redisConfigured = false;

function getClient(): Redis | null {
  if (redisClient) return redisAvailable ? redisClient : null;

  const url = process.env.REDIS_URL;
  if (!url) {
    console.log("[redis] REDIS_URL not set — using in-memory fallback for browse state");
    return null;
  }

  redisConfigured = true;

  try {
    const client = new Redis(url, {
      lazyConnect: false,
      maxRetriesPerRequest: 1,
      connectTimeout: 3000,
      enableReadyCheck: true,
    });

    client.on("ready", () => {
      redisAvailable = true;
      console.log("[redis] Connected successfully");
    });

    client.on("error", (err) => {
      if (redisAvailable) {
        console.error("[redis] Connection error — falling back to in-memory:", err.message);
      }
      redisAvailable = false;
    });

    client.on("reconnecting", () => {
      console.log("[redis] Reconnecting...");
    });

    redisClient = client;
    return client;
  } catch (err) {
    console.error("[redis] Failed to initialize client:", err);
    return null;
  }
}

// Initialize eagerly so connection is established before first request
getClient();

export interface RedisStatus {
  configured: boolean;
  connected: boolean;
  mode: "redis" | "memory";
  latencyMs: number | null;
  activeSessions: number;
  error: string | null;
}

export async function getRedisStatus(): Promise<RedisStatus> {
  const configured = redisConfigured || !!process.env.REDIS_URL;
  const client = getClient();

  if (!client || !redisAvailable) {
    return {
      configured,
      connected: false,
      mode: "memory",
      latencyMs: null,
      activeSessions: memoryFallback.size,
      error: configured ? "Redis configured but not reachable" : null,
    };
  }

  let latencyMs: number | null = null;
  let activeSessions = 0;
  let error: string | null = null;

  try {
    const start = Date.now();
    await client.ping();
    latencyMs = Date.now() - start;

    // Count active browse sessions (keys matching browse:*)
    const keys = await client.keys("browse:*");
    activeSessions = keys.length;
  } catch (err) {
    error = err instanceof Error ? err.message : "Unknown error";
  }

  return {
    configured,
    connected: redisAvailable,
    mode: "redis",
    latencyMs,
    activeSessions,
    error,
  };
}

export async function getBrowseState(callSid: string): Promise<CallerBrowseState | undefined> {
  const client = getClient();
  if (!client || !redisAvailable) {
    return memoryFallback.get(callSid);
  }
  try {
    const raw = await client.get(`browse:${callSid}`);
    if (!raw) return undefined;
    return deserialize(JSON.parse(raw) as SerializableBrowseState);
  } catch (err) {
    console.error("[redis] getBrowseState error — using fallback:", err);
    return memoryFallback.get(callSid);
  }
}

export async function setBrowseState(callSid: string, state: CallerBrowseState): Promise<void> {
  const client = getClient();
  if (!client || !redisAvailable) {
    memoryFallback.set(callSid, state);
    return;
  }
  try {
    await client.set(`browse:${callSid}`, JSON.stringify(serialize(state)), "EX", BROWSE_STATE_TTL);
    // Keep fallback in sync so a sudden Redis failure mid-session degrades gracefully
    memoryFallback.set(callSid, state);
  } catch (err) {
    console.error("[redis] setBrowseState error — using fallback:", err);
    memoryFallback.set(callSid, state);
  }
}

export async function deleteBrowseState(callSid: string): Promise<void> {
  memoryFallback.delete(callSid);
  const client = getClient();
  if (!client || !redisAvailable) return;
  try {
    await client.del(`browse:${callSid}`);
  } catch (err) {
    console.error("[redis] deleteBrowseState error:", err);
  }
}
