import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { API_BASE, SESSION_COOKIE } from "@/lib/config";

export async function POST() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) {
    // Best-effort audit/logout upstream; the cookie is cleared regardless.
    await fetch(`${API_BASE}/api/v1/auth/logout`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      cache: "no-store",
    }).catch(() => undefined);
  }
  const response = NextResponse.json({ status: "signed_out" });
  response.cookies.set({ name: SESSION_COOKIE, value: "", httpOnly: true, path: "/", maxAge: 0 });
  return response;
}
