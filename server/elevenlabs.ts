import fs from "fs";
import path from "path";

const UPLOADS_DIR = path.join(process.cwd(), "uploads");

export async function generateTTS(text: string, outputFilename: string): Promise<string> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  const voiceId = process.env.ELEVENLABS_VOICE_ID || "21m00Tcm4TlvDq8ikWAM";

  if (!apiKey) {
    throw new Error("ELEVENLABS_API_KEY is not configured");
  }

  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
    {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body: JSON.stringify({
        text,
        model_id: "eleven_turbo_v2",
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
        },
      }),
    }
  );

  if (!response.ok) {
    const errText = await response.text().catch(() => "Unknown error");
    throw new Error(`ElevenLabs API error ${response.status}: ${errText}`);
  }

  if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  }

  const outputPath = path.join(UPLOADS_DIR, outputFilename);
  const buffer = Buffer.from(await response.arrayBuffer());
  fs.writeFileSync(outputPath, buffer);

  return outputPath;
}

export async function listVoices(): Promise<{ voice_id: string; name: string }[]> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
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
