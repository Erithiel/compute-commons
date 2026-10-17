// Shared bits for MCP tools: who is calling, the lead check, name-or-id lookup, and the reply shape
// (one plain line for the AI, then JSON). Pure: no Appwrite, so it is unit tested.
import type { Caller } from "../types";

export type Reply = { content: Array<{ type: "text"; text: string }>; isError?: boolean };
type Ctx = { http?: { authInfo?: { extra?: Record<string, unknown> } } };

export const ok = (line: string, data?: unknown): Reply =>
  ({ content: [{ type: "text", text: data === undefined ? line : `${line}\n\n${JSON.stringify(data, null, 2)}` }] });

export const fail = (message: string): Reply => ({ isError: true, content: [{ type: "text", text: message }] });

/** The member behind the bearer token (route.ts puts it in authInfo.extra). */
export function callerOf(ctx: Ctx): Caller {
  const caller = ctx.http?.authInfo?.extra?.caller as Caller | undefined;
  if (!caller) throw new Error("Not signed in: send Authorization: Bearer <token>.");
  return caller;
}

export function leadOnly(caller: Caller) {
  if (caller.role !== "lead") throw new Error("Only a team lead can do this. Members can read with list_tasks and view_task.");
}

/** Runs a tool body for the caller. Anything thrown becomes a tool error the AI can read and act on. */
export async function run(ctx: Ctx, body: (caller: Caller) => Promise<Reply>): Promise<Reply> {
  try {
    return await body(callerOf(ctx));
  } catch (e) {
    return fail(e instanceof Error ? e.message : String(e));
  }
}

/** Find one by id, or by name ignoring case. Unknown or ambiguous: an error listing the choices. */
export function pickOne<X extends { $id: string }>(list: X[], ref: string, nameOf: (x: X) => string, kind: string): X {
  const r = ref.trim();
  const byId = list.find((x) => x.$id === r);
  if (byId) return byId;
  const hits = list.filter((x) => nameOf(x).trim().toLowerCase() === r.toLowerCase());
  if (hits.length === 1) return hits[0];
  const choices = (hits.length ? hits : list).map((x) => `${nameOf(x)} (${x.$id})`).join(", ") || "none";
  throw new Error(hits.length ? `Several ${kind}s are called "${r}"; use the id: ${choices}` : `No ${kind} "${r}". Known: ${choices}`);
}
