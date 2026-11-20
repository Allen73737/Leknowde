import { errorFromResponse } from "./api-error";

/**
 * Browser-side calls go through the same-origin BFF at /api/lk. The JWT stays in
 * an httpOnly cookie and is attached to the upstream request by the route
 * handler, so no token is ever readable from client JavaScript.
 */
export async function apiClient<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  headers.set("Accept", "application/json");
  const response = await fetch(`/api/lk${path}`, {
    ...init,
    headers,
    credentials: "same-origin",
  });
  if (!response.ok) throw await errorFromResponse(response);
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  return apiClient<T>(path, { method: "POST", body: JSON.stringify(body) });
}

export async function apiPatch<T>(path: string, body: unknown): Promise<T> {
  return apiClient<T>(path, { method: "PATCH", body: JSON.stringify(body) });
}

export async function apiDelete<T>(path: string): Promise<T> {
  return apiClient<T>(path, { method: "DELETE" });
}
