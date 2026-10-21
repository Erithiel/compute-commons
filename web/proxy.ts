import { NextResponse, type NextRequest } from "next/server";
import { crmSupabase } from "@/lib/crm";

/**
 * Refreshes the CRM session cookie (Server Components cannot write cookies) and sends signed-out visitors to /login.
 * Pages still check that the user is approved in the CRM (lib/auth.ts).
 */
export async function proxy(req: NextRequest) {
  let res = NextResponse.next({ request: req });
  const supabase = crmSupabase({
    getAll: () => req.cookies.getAll(),
    setAll: (list, headers) => {
      for (const { name, value } of list) req.cookies.set(name, value);
      res = NextResponse.next({ request: req });
      for (const { name, value, options } of list) res.cookies.set(name, value, options);
      for (const [k, v] of Object.entries(headers ?? {})) res.headers.set(k, v); // no-cache: a CDN must never keep a session
    },
  });
  const { data } = await supabase.auth.getClaims();
  if (data?.claims) return res; // return this response: it carries the refreshed cookies
  const login = new URL("/login", req.url);
  login.searchParams.set("next", req.nextUrl.pathname);
  return NextResponse.redirect(login);
}

export const config = {
  // Everything except the login page, the OAuth callback, the MCP endpoint (bearer tokens) and static files.
  matcher: ["/((?!login|auth/callback|api/mcp|_next|favicon.ico|.*\\..*).*)"],
};
