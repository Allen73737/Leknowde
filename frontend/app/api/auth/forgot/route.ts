import { NextResponse } from "next/server";

import { API_BASE } from "@/lib/config";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  try {
    const upstream = await fetch(`${API_BASE}/api/v1/auth/forgot-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    const payload = await upstream.json().catch(() => ({}));
    return NextResponse.json(payload, { status: upstream.status });
  } catch {
    return NextResponse.json(
      { error: "api_unreachable", message: "The LeKnowde API is unreachable." },
      { status: 503 },
    );
  }
}
