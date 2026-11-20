import { NextResponse, type NextRequest } from "next/server";

import { SESSION_COOKIE } from "@/lib/config";

export function middleware(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (!token) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    const next = `${request.nextUrl.pathname}${request.nextUrl.search}`;
    url.searchParams.set("next", next);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/app/:path*"],
};
