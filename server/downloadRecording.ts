import fs from "fs";
import path from "path";

function extractSid(url: string): string | null {
  const m = url.match(/Recordings\/(RE[a-f0-9]+)/i);
  return m ? m[1] : null;
}

export async function downloadRecording(twilioUrl: string): Promise<string> {
  if (!twilioUrl) return twilioUrl;

  if (twilioUrl.startsWith("/uploads/") || twilioUrl.startsWith("/")) {
    return twilioUrl;
  }

  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken  = process.env.TWILIO_AUTH_TOKEN;

  if (!accountSid || !authToken) {
    console.warn("[download] Twilio credentials not set — keeping Twilio URL");
    return twilioUrl;
  }

  const sid = extractSid(twilioUrl);
  if (!sid) {
    console.warn("[download] Could not extract SID from:", twilioUrl);
    return twilioUrl;
  }

  const uploadsDir = path.join(process.cwd(), "uploads");
  if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

  const filename  = `${sid}.mp3`;
  const localPath = `/uploads/${filename}`;
  const fullPath  = path.join(uploadsDir, filename);

  if (fs.existsSync(fullPath)) {
    console.log(`[download] Already on disk: ${localPath}`);
    return localPath;
  }

  const downloadUrl  = twilioUrl.endsWith(".mp3") ? twilioUrl : `${twilioUrl}.mp3`;
  const authHeader   = "Basic " + Buffer.from(`${accountSid}:${authToken}`).toString("base64");

  try {
    const response = await fetch(downloadUrl, { headers: { Authorization: authHeader } });
    if (!response.ok) {
      console.error(`[download] HTTP ${response.status} downloading ${sid} — keeping Twilio URL`);
      return twilioUrl;
    }

    const buffer = await response.arrayBuffer();
    fs.writeFileSync(fullPath, Buffer.from(buffer));
    console.log(`[download] Saved ${localPath} (${buffer.byteLength} bytes)`);

    fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Recordings/${sid}`, {
      method: "DELETE",
      headers: { Authorization: authHeader },
    }).then(r => {
      if (r.ok || r.status === 404) {
        console.log(`[download] Deleted Twilio recording ${sid}`);
      } else {
        console.warn(`[download] Could not delete Twilio recording ${sid}: HTTP ${r.status}`);
      }
    }).catch(err => console.warn(`[download] Delete error for ${sid}:`, err));

    return localPath;
  } catch (err) {
    console.error(`[download] Error downloading ${sid}:`, err);
    return twilioUrl;
  }
}

export function twilioUrlToLocalPath(twilioUrl: string): string {
  if (!twilioUrl || twilioUrl.startsWith("/")) return twilioUrl;
  const sid = extractSid(twilioUrl);
  return sid ? `/uploads/${sid}.mp3` : twilioUrl;
}

export function deleteLocalRecording(url: string | null | undefined): void {
  if (!url || !url.startsWith("/uploads/")) return;
  const fullPath = path.join(process.cwd(), url.substring(1));
  try {
    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath);
      console.log(`[download] Deleted old recording: ${url}`);
    }
  } catch (err) {
    console.warn(`[download] Could not delete old recording ${url}:`, err);
  }
}
