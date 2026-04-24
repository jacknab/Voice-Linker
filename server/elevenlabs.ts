import fs from "fs";
import path from "path";

const UPLOADS_DIR = path.join(process.cwd(), "uploads");

export function getElevenLabsApiKey(): string | null {
  let apiKey = process.env.ELEVENLABS_API_KEY?.trim().replace(/[\u200B-\u200D\uFEFF]/g, "");
  if (
    apiKey &&
    ((apiKey.startsWith('"') && apiKey.endsWith('"')) ||
      (apiKey.startsWith("'") && apiKey.endsWith("'")))
  ) {
    apiKey = apiKey.slice(1, -1).trim();
  }
  return apiKey || "sk_74627d02e078932d8c32a216d38499df18da598a7a067c6b";
}

// Returns the correct ElevenLabs voice ID for a given folder (mm/mw/mw_m) or falls back to the legacy var.
// NOTE: MW and MW_M voice IDs are intentionally disabled — all folders use the MM voice only.
export function getVoiceIdForFolder(folder?: string | null): string {
  if (folder === "mm") {
    return process.env.ELEVENLABS_VOICE_ID_MM || "wSqOdjeNqDrHcoK0zorF";
  }
  // if (folder === "mw") {
  //   return process.env.ELEVENLABS_VOICE_ID_MW || "wSqOdjeNqDrHcoK0zorF";
  // }
  // if (folder === "mw_m") {
  //   return process.env.ELEVENLABS_VOICE_ID_MW_M || "wSqOdjeNqDrHcoK0zorF";
  // }
  return process.env.ELEVENLABS_VOICE_ID_MM || "wSqOdjeNqDrHcoK0zorF";
}

/** Returns Roger's dedicated ElevenLabs voice ID.
 *  NOTE: Disabled — using MM voice only to keep a consistent single voice.
 */
export function getVoiceIdForRoger(): string {
  // return process.env.ELEVENLABS_VOICE_ID_ROGER || "wSqOdjeNqDrHcoK0zorF";
  return process.env.ELEVENLABS_VOICE_ID_MM || "wSqOdjeNqDrHcoK0zorF";
}

/**
 * Returns the voice ID used for Busted Game AI caller greetings.
 * Set ELEVENLABS_VOICE_ID_GAME in .env to use a dedicated male voice
 * that sounds like a real caller (not Roger's host voice).
 */
export function getVoiceIdForGame(): string {
  return process.env.ELEVENLABS_VOICE_ID_GAME || "wSqOdjeNqDrHcoK0zorF";
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export async function generateTTS(
  text: string,
  outputFilename: string,
  subfolder?: string,
  voiceIdOverride?: string,
  modelId?: string
): Promise<string> {
  const apiKey = getElevenLabsApiKey();
  const voiceId = voiceIdOverride ?? getVoiceIdForFolder(subfolder ?? null);
  const model = modelId ?? "eleven_turbo_v2";

  // eleven_v3 benefits from lower stability to unlock full emotional range
  const stability       = model === "eleven_v3" ? 0.35 : 0.5;
  const similarityBoost = model === "eleven_v3" ? 0.80 : 0.75;

  if (!apiKey) {
    throw new Error("ELEVENLABS_API_KEY is not configured");
  }

  const body = JSON.stringify({
    text,
    model_id: model,
    voice_settings: { stability, similarity_boost: similarityBoost },
  });

  // Retry up to 4 times on 429 rate-limit responses with exponential backoff
  const MAX_RETRIES = 4;
  let lastError = "";

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
      {
        method: "POST",
        headers: {
          "xi-api-key": apiKey,
          "Content-Type": "application/json",
          Accept: "audio/mpeg",
        },
        body,
      }
    );

    if (response.status === 429) {
      // Respect Retry-After header if present, otherwise use exponential backoff
      const retryAfter = response.headers.get("Retry-After");
      const waitMs = retryAfter ? parseInt(retryAfter, 10) * 1000 : Math.min(5000 * 2 ** attempt, 30000);
      lastError = `Rate limited (429) — waiting ${Math.round(waitMs / 1000)}s before retry ${attempt + 1}/${MAX_RETRIES}`;
      console.warn(`[elevenlabs] ${lastError}`);
      if (attempt < MAX_RETRIES) {
        await sleep(waitMs);
        continue;
      }
      throw new Error("ElevenLabs rate limit reached. Please wait a moment and try again.");
    }

    if (!response.ok) {
      const errText = await response.text().catch(() => "Unknown error");
      throw new Error(`ElevenLabs API error ${response.status}: ${errText}`);
    }

    const targetDir = subfolder ? path.join(UPLOADS_DIR, subfolder) : UPLOADS_DIR;
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    const outputPath = path.join(targetDir, outputFilename);
    const buffer = Buffer.from(await response.arrayBuffer());
    fs.writeFileSync(outputPath, buffer);

    return outputPath;
  }

  throw new Error(lastError || "ElevenLabs generation failed after retries");
}

export async function listVoices(): Promise<{ voice_id: string; name: string }[]> {
  const apiKey = getElevenLabsApiKey();
  if (!apiKey) throw new Error("ELEVENLABS_API_KEY is not configured");

  const response = await fetch("https://api.elevenlabs.io/v1/voices", {
    headers: { "xi-api-key": apiKey },
  });

  if (!response.ok) {
    throw new Error(`ElevenLabs API error ${response.status}`);
  }

  const data = (await response.json()) as { voices: { voice_id: string; name: string }[] };
  return data.voices ?? [];
}
