const STORAGE_KEY = "malebox_admin_config";

export interface AdminConfig {
  serverUrl: string;
  secretKey: string;
}

export function getConfig(): AdminConfig | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AdminConfig;
    if (!parsed.serverUrl || !parsed.secretKey) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveConfig(config: AdminConfig): void {
  const clean: AdminConfig = {
    serverUrl: config.serverUrl.replace(/\/$/, ""),
    secretKey: config.secretKey.trim(),
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(clean));
}

export function clearConfig(): void {
  localStorage.removeItem(STORAGE_KEY);
}

// Resolve a relative URL like "/uploads/mm/file.mp3" against the configured
// backend server URL so that <audio src> and new Audio() work from the desktop
// app (which runs on a different origin than the backend).
export function resolveUrl(url: string): string {
  if (!url || !url.startsWith("/")) return url;
  const config = getConfig();
  if (!config) return url;
  return config.serverUrl + url;
}
