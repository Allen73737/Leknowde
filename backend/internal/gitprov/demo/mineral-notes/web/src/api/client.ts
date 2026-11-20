export interface ApiUser {
  id: string;
  email: string;
  display_name: string;
}

export interface ApiNote {
  id: string;
  title: string;
  body: string;
  updated_at: string;
}

export interface ApiError {
  error: string;
  message?: string;
}

const BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:4000";

let accessToken: string | null = null;

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${BASE_URL}/api/v1${path}`, {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...init.headers,
    },
  });

  if (response.status === 401 && accessToken) {
    const refreshed = await refreshSession();
    if (refreshed) {
      return request<T>(path, init);
    }
  }

  if (!response.ok) {
    const error = (await response.json().catch(() => ({ error: "request_failed" }))) as ApiError;
    throw new Error(error.message ?? error.error);
  }

  if (response.status === 204) {
    return undefined as T;
  }
  return (await response.json()) as T;
}

export async function login(email: string, password: string): Promise<ApiUser> {
  const result = await request<{ access_token: string; user: ApiUser }>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  setAccessToken(result.access_token);
  return result.user;
}

export async function refreshSession(): Promise<boolean> {
  const result = await request<{ access_token: string }>("/auth/refresh", { method: "POST" });
  if (!result.access_token) {
    return false;
  }
  setAccessToken(result.access_token);
  return true;
}

export async function listNotes(): Promise<ApiNote[]> {
  const result = await request<{ notes: ApiNote[] }>("/notes");
  return result.notes;
}

export async function createNote(title: string, body: string): Promise<ApiNote> {
  return request<ApiNote>("/notes", { method: "POST", body: JSON.stringify({ title, body }) });
}
