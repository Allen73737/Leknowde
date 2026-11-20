import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { API_BASE, SESSION_COOKIE } from "@/lib/config";

type Context = { params: Promise<{ path: string[] }> };

async function proxy(request: Request, context: Context): Promise<Response> {
  const { path } = await context.params;
  if (!path || path.length === 0) {
    return NextResponse.json({ error: "not_found", message: "Missing API path." }, { status: 404 });
  }

  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) {
    return NextResponse.json(
      { error: "unauthorized", message: "Your session has expired. Sign in again." },
      { status: 401 },
    );
  }

  const url = new URL(request.url);
  const upstreamURL = `${API_BASE}/api/v1/${path.map(encodeURIComponent).join("/")}${url.search}`;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
  };
  const contentType = request.headers.get("content-type");
  if (contentType) headers["Content-Type"] = contentType;

  let body: ArrayBuffer | undefined;
  if (request.method !== "GET" && request.method !== "HEAD") {
    body = await request.arrayBuffer();
  }

  let upstream: Response;
  try {
    upstream = await fetch(upstreamURL, {
      method: request.method,
      headers,
      body: body && body.byteLength > 0 ? body : undefined,
      cache: "no-store",
      redirect: "manual",
    });
  } catch {
    return NextResponse.json(
      { error: "api_unreachable", message: "The LeKnowde API is unreachable. Start the Go service on port 8080." },
      { status: 503 },
    );
  }

  const responseHeaders = new Headers();
  const upstreamType = upstream.headers.get("content-type");
  if (upstreamType) responseHeaders.set("Content-Type", upstreamType);
  const location = upstream.headers.get("location");
  if (location) responseHeaders.set("Location", location);
  responseHeaders.set("Cache-Control", "no-store");
  return new Response(upstream.body, {
    status: upstream.status,
    headers: responseHeaders,
  });
}

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
