import fs from "fs";
import path from "path";

const MIN_FILE_BYTES = 5 * 1024; // < 5 KB = silence / no speech detected

export async function transcribeLocalFile(localPath: string): Promise<{ text: string | null; status: "completed" | "failed" | "silent" }> {
  const apiKey = process.env.GROQ_API_KEY;

  const fullPath = path.join(process.cwd(), localPath.startsWith("/") ? localPath.substring(1) : localPath);

  if (!fs.existsSync(fullPath)) {
    console.warn(`[transcribe] File not found: ${localPath}`);
    return { text: null, status: "failed" };
  }

  const fileSizeBytes = fs.statSync(fullPath).size;
  if (fileSizeBytes < MIN_FILE_BYTES) {
    console.log(`[transcribe] Silent recording detected (${fileSizeBytes} bytes): ${localPath}`);
    return { text: "", status: "silent" };
  }

  if (!apiKey) {
    console.warn("[transcribe] GROQ_API_KEY not set — transcription skipped");
    return { text: null, status: "failed" };
  }

  try {
    const fileBuffer = fs.readFileSync(fullPath);
    const blob = new Blob([fileBuffer], { type: "audio/mpeg" });

    const formData = new FormData();
    formData.append("file", blob, path.basename(fullPath));
    formData.append("model", "whisper-large-v3-turbo");
    formData.append("response_format", "text");
    formData.append("language", "en");

    const response = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: formData,
    });

    if (!response.ok) {
      const errBody = await response.text().catch(() => "");
      console.error(`[transcribe] Groq API error ${response.status}: ${errBody}`);
      return { text: null, status: "failed" };
    }

    const text = (await response.text()).trim();
    console.log(`[transcribe] Groq result for ${localPath}: "${text.substring(0, 80)}${text.length > 80 ? "…" : ""}"`);
    return { text, status: "completed" };
  } catch (err) {
    console.error(`[transcribe] Error transcribing ${localPath}:`, err);
    return { text: null, status: "failed" };
  }
}
