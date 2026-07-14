export const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080/api";
export const API_KEY = process.env.NEXT_PUBLIC_API_KEY || "dev-api-key-change-me";

export async function api(path: string, options: RequestInit = {}) {
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string> || {}),
  };
  if (!(options.method === "GET" && path.startsWith("/pdfs") && !path.includes("/highlights") && !path.includes("/comments") && !path.includes("/content"))) {
    headers["X-API-Key"] = API_KEY;
  }
  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  return res;
}

export async function apiJson(path: string, options: RequestInit = {}) {
  const res = await api(path, options);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `API error ${res.status}`);
  }
  return res.json();
}
