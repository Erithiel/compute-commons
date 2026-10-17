import { NextResponse, type NextRequest } from "next/server";

const COOKIE = process.env.SESSION_COOKIE_NAME ?? "commons_session";

/** Optimistic: no session cookie → /login. Pages still verify the session (lib/auth.ts). */
export function proxy(req: NextRequest) {
  if (req.cookies.has(COOKIE)) return;
  const login = new URL("/login", req.url);
  login.searchParams.set("next", req.nextUrl.pathname);
  return NextResponse.redirect(login);
}

export const config = {
  // Everything except the auth pages, the MCP endpoint (bearer tokens) and static files.
  matcher: ["/((?!login|signup|join|api/mcp|_next|favicon.ico|.*\\..*).*)"],
};
