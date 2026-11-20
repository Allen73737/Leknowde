import { NextResponse } from "next/server";

import { API_BASE, IS_PRODUCTION, SESSION_COOKIE, SESSION_MAX_AGE } from "@/lib/config";

export async function POST(request: Request) {
  let body: { name?: string; email?: string; password?: string };
  try {
    body = (await request.json()) as { name?: string; email?: string; password?: string };
  } catch {
    return NextResponse.json({ error: "invalid_request", message: "Invalid request body." }, { status: 400 });
  }

  if (!body.email || !body.password) {
    return NextResponse.json(
      { error: "invalid_request", message: "Email and password are required." },
      { status: 400 },
    );
  }

  let upstream: Response;
  try {
    upstream = await fetch(`${API_BASE}/api/v1/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ name: body.name ?? "", email: body.email, password: body.password }),
      cache: "no-store",
    });
  } catch {
    return NextResponse.json(
      { error: "api_unreachable", message: "The LeKnowde API is unreachable. Start the Go service on port 8080." },
      { status: 503 },
    );
  }

  const payload = (await upstream.json().catch(() => ({}))) as Record<string, unknown>;
  if (!upstream.ok) {
    return NextResponse.json(payload, { status: upstream.status });
  }

  const token = typeof payload.token === "string" ? payload.token : "";
  if (!token) {
    return NextResponse.json(
      { error: "session_failed", message: "The API did not return a session token." },
      { status: 502 },
    );
  }

  const response = NextResponse.json({
    user: payload.user,
    organization_id: payload.organization_id,
    expires_at: payload.expires_at,
  });
  response.cookies.set({
    name: SESSION_COOKIE,
    value: token,
    httpOnly: true,
    secure: IS_PRODUCTION,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
  return response;
}
