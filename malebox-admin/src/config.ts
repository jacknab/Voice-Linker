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
