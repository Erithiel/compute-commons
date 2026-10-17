// Stub (F0): picks the member from a cookie (mock login). F1 replaces it with the Appwrite session lookup; the exports stay the same.
import { cache } from "react";
import { cookies } from "next/headers";
import { rowOrNull, T, TEAM_ID } from "./appwrite";
import type { Member } from "./types";

export const getMember = cache(async (): Promise<Member | null> => {
  const as = (await cookies()).get("mock_member")?.value;
  if (!as) return null;
  const m = await rowOrNull<Member>(T.members, as);
  return m?.teamId === TEAM_ID ? m : null;
});

export async function requireMember(): Promise<Member> {
  const m = await getMember();
  if (!m) throw new Error("Forbidden");
  return m;
}

export async function requireLead(): Promise<Member> {
  const m = await requireMember();
  if (m.role !== "lead") throw new Error("Forbidden");
  return m;
}
