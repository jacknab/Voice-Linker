const STORAGE_KEY = "malebox_admin_config";

export interface AdminConfig {
  secretKey: string;
}

export function getConfig(): AdminConfig | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AdminConfig;
    if (!parsed.secretKey) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveConfig(config: AdminConfig): void {
  const clean: AdminConfig = {
    secretKey: config.secretKey.trim(),
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(clean));
}

export function clearConfig(): void {
  localStorage.removeItem(STORAGE_KEY);
}

// Since the admin is now served from the same origin as the backend,
// relative URLs work as-is — no prefix needed.
export function resolveUrl(url: string): string {
  return url;
}
