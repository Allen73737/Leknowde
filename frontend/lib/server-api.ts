import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { ApiError, errorFromResponse } from "./api-error";
import { API_BASE, SESSION_COOKIE } from "./config";
import type { MeResponse } from "./types";

export async function getSessionToken(): Promise<string | null> {
  const store = await cookies();
  return store.get(SESSION_COOKIE)?.value ?? null;
}

export async function requireSession(): Promise<string> {
  const token = await getSessionToken();
  if (!token) redirect("/login");
  return token;
}

interface ServerFetchOptions extends Omit<RequestInit, "headers"> {
  token?: string | null;
  headers?: Record<string, string>;
}

export async function serverFetch<T>(path: string, options: ServerFetchOptions = {}): Promise<T> {
  const token = options.token === undefined ? await getSessionToken() : options.token;
  const url = path.startsWith("http") ? path : `${API_BASE}/api/v1${path}`;
  const headers: Record<string, string> = {
    Accept: "application/json",
    ...options.headers,
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (options.body && !headers["Content-Type"]) headers["Content-Type"] = "application/json";

  let response: Response;
  try {
    response = await fetch(url, {
      ...options,
      headers,
      cache: "no-store",
    });
  } catch {
    throw new ApiError(
      503,
      "The LeKnowde API is unreachable. Start the Go service on port 8080 and reload.",
      "api_unreachable",
    );
  }
  if (!response.ok) throw await errorFromResponse(response);
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export type SafeResult<T> = { data: T; error: null } | { data: null; error: ApiError };

export async function safeGet<T>(path: string): Promise<SafeResult<T>> {
  try {
    return { data: await serverFetch<T>(path), error: null };
  } catch (error) {
    if (error instanceof ApiError) {
      if (error.status === 401) redirect("/login");
      return { data: null, error };
    }
    return {
      data: null,
      error: new ApiError(500, error instanceof Error ? error.message : "Unexpected error."),
    };
  }
}

export async function safePost<T>(
  path: string,
  body: unknown,
): Promise<SafeResult<T>> {
  try {
    return {
      data: await serverFetch<T>(path, { method: "POST", body: JSON.stringify(body) }),
      error: null,
    };
  } catch (error) {
    if (error instanceof ApiError) {
      if (error.status === 401) redirect("/login");
      return { data: null, error };
    }
    return {
      data: null,
      error: new ApiError(500, error instanceof Error ? error.message : "Unexpected error."),
    };
  }
}

export async function getMe(): Promise<MeResponse> {
  return serverFetch<MeResponse>("/auth/me");
}
