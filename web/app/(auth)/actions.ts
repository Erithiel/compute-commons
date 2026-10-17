"use server";
import { redirect } from "next/navigation";
import { isCode } from "@/lib/appwrite";
import { getMember, getUser, signIn, signOut, signUp } from "@/lib/auth";
import { ALREADY, createTeam, joinTeam } from "@/lib/teams";
import { safeNext } from "@/lib/team-rules";

type State = { error: string } | null;
const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

export async function login(_: State, f: FormData): Promise<State> {
  const error = await signIn(str(f, "email"), String(f.get("password") ?? ""));
  if (error) return { error };
  redirect(safeNext(str(f, "next"), "/board"));
}

export async function signup(_: State, f: FormData): Promise<State> {
  if (str(f, "name").length > 128) return { error: "Name is too long (max 128 characters)." };
  const error = await signUp(str(f, "name"), str(f, "email"), String(f.get("password") ?? ""));
  if (error) return { error };
  redirect(safeNext(str(f, "next"), "/welcome"));
}

export async function logout() {
  await signOut();
  redirect("/login");
}

export async function newTeam(_: State, f: FormData): Promise<State> {
  const user = await getUser();
  if (!user) redirect("/login");
  if (await getMember()) redirect("/board");
  const name = str(f, "team");
  if (!name) return { error: "Give your team a name." };
  if (name.length > 128) return { error: "Team name is too long (max 128 characters)." };
  try {
    await createTeam(user, name);
  } catch (e) {
    if (isCode(e, 409)) return { error: ALREADY };
    throw e;
  }
  redirect("/board");
}

export async function acceptInvite(_: State, f: FormData): Promise<State> {
  const user = await getUser();
  const code = str(f, "code");
  if (!user) redirect(`/signup?next=/join/${encodeURIComponent(code)}`);
  const error = await joinTeam(user, code);
  if (error) return { error };
  redirect("/board");
}
