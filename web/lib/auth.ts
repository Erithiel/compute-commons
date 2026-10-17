// Stub (F0). F1 replaces this with the Appwrite session lookup; the exports stay the same.
import { cookies } from "next/headers";
import { db } from "./mock";
import type { Member } from "./types";

export async function getMember(): Promise<Member | null> {
  const as = (await cookies()).get("mock_member")?.value;
  if (!as) return null;
  return (await db()).members.find((m) => m.$id === as) ?? null;
}

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
