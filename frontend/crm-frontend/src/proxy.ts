import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const COOKIE_NAME = process.env.COOKIE_NAME ?? "access_token";
const DEFAULT_APP_PAGE = "/app/buildings";

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const hasToken = req.cookies.has(COOKIE_NAME);

  // Logged-in user hitting root or login → send to app
  if (hasToken && (pathname === "/" || pathname === "/login")) {
    const next = req.nextUrl.searchParams.get("next");
    const dest = next && next.startsWith("/app/") ? next : DEFAULT_APP_PAGE;
    return NextResponse.redirect(new URL(dest, req.url));
  }

  // Not logged in hitting /app/* → send to login
  if (!hasToken && pathname.startsWith("/app")) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("next", pathname + req.nextUrl.search);
    return NextResponse.redirect(loginUrl);
  }

  // Not logged in hitting root → send to login
  if (!hasToken && pathname === "/") {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/", "/login", "/app/:path*"],
};
