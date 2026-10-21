"use server";
import { redirect } from "next/navigation";
import { signInUrl, signOut } from "@/lib/auth";
import { safeNext } from "@/lib/team-rules";

/** Sign in with Google through the CRM. Signs out first, so "not approved" can retry with another account. */
export async function login(f: FormData) {
  await signOut();
  redirect(await signInUrl(safeNext(String(f.get("next") ?? ""), "/board")));
}

export async function logout() {
  await signOut();
  redirect("/login");
}
