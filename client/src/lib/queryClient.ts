import { QueryClient, QueryFunction } from "@tanstack/react-query";

const ADMIN_KEY_STORAGE = "malebox_admin_key";
const VPS_URL_STORAGE = "malebox_vps_url";

export function getVpsUrl(): string | null {
  return localStorage.getItem(VPS_URL_STORAGE);
}

export function setVpsUrl(url: string): void {
  localStorage.setItem(VPS_URL_STORAGE, url.replace(/\/$/, ""));
}

export function clearVpsUrl(): void {
  localStorage.removeItem(VPS_URL_STORAGE);
}

export async function pushAudioToVps(
  localAudioUrl: string,
  filename: string,
  subfolder?: string,
): Promise<void> {
  const vpsUrl = getVpsUrl();
  if (!vpsUrl) throw new Error("VPS URL not configured — set it in the Audio Gen config bar");
  const adminKey = getAdminKey();

  const fileRes = await fetch(localAudioUrl);
  if (!fileRes.ok) throw new Error("Failed to fetch local audio file");
  const blob = await fileRes.blob();

  const form = new FormData();
  form.append("audio", blob, filename);
  form.append("filename", filename);
  if (subfolder) form.append("subfolder", subfolder);

  const pushRes = await fetch(`${vpsUrl}/api/admin/receive-audio`, {
    method: "POST",
    headers: adminKey ? { "X-Admin-Key": adminKey } : {},
    body: form,
  });

  if (!pushRes.ok) {
    const err = await pushRes.json().catch(() => ({ message: "Push failed" }));
    throw new Error(err.message || `Push failed (${pushRes.status})`);
  }
}

export function getAdminKey(): string | null {
  return localStorage.getItem(ADMIN_KEY_STORAGE);
}

export function setAdminKey(key: string): void {
  localStorage.setItem(ADMIN_KEY_STORAGE, key);
}

export function clearAdminKey(): void {
  localStorage.removeItem(ADMIN_KEY_STORAGE);
}

function buildAdminHeaders(url: string, base: Record<string, string> = {}): Record<string, string> {
  if (url.includes("/api/admin")) {
    const key = getAdminKey();
    if (key) base["X-Admin-Key"] = key;
  }
  return base;
}

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    if (res.status === 403 && res.url?.includes("/api/admin")) {
      window.dispatchEvent(new CustomEvent("admin-forbidden"));
    }
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const headers = buildAdminHeaders(url, data ? { "Content-Type": "application/json" } : {});
  const res = await fetch(url, {
    method,
    headers,
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const url = queryKey.join("/") as string;
    const res = await fetch(url, {
      headers: buildAdminHeaders(url),
      credentials: "include",
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
