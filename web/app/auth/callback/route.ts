// Google → the CRM's Supabase → here with ?code=. Trade it for the session cookie, then go where the user was headed.
import { NextResponse, type NextRequest } from "next/server";
import { finishSignIn } from "@/lib/auth";
import { safeNext } from "@/lib/team-rules";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const ok = !!code && (await finishSignIn(code));
  const to = ok ? safeNext(req.nextUrl.searchParams.get("next"), "/board") : "/login?error=failed";
  return NextResponse.redirect(new URL(to, req.url));
}
