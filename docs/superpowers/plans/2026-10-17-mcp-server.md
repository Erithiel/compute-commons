# MCP Server (work + team management) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the `/api/mcp` endpoint. A member's Claude uses it to fetch, claim and finish team tasks. A lead's Claude uses it to set up the team's work from a plain-language request: it creates and edits tasks and routines, assigns members, and manages members and the team policy.

**Architecture:** One Next.js route handler (`web/app/api/mcp/route.ts`) built with `mcp-handler` 2.x. `withMcpAuth` turns the `Authorization: Bearer cc_…` header into a `Caller` through the existing `verifyBearer`. Tools sit in two files: `lib/mcp/work.ts` (do work: any member) and `lib/mcp/manage.ts` (read the team: any member; write: leads only). Each tool is a thin wrapper over the existing libs (`claims.ts`, `tasks.ts`, the store in `mock.ts`) plus a new `lib/team.ts`. The web app's server actions and the MCP tools share those writes, so both follow the same role and audit rules. Small pure helpers in `lib/mcp/reply.ts` handle the reply shape, the role check and name-or-id lookup, and they are unit tested.

**Tech Stack:** Next.js 16.4.2 route handler, `mcp-handler` 2.3.0, `@modelcontextprotocol/server` 2.3.1 (MCP SDK v2), `zod` 4.6.7, `node-appwrite` 22.1.3 (unchanged), `vitest`, `@modelcontextprotocol/client` 2.3.1 (dev only, for the smoke script).

**Spec:** the user's request of 2026-10-17 ("MCP fetches tasks and changes their state. Also tools to create routines, assign team members, list team members and everything the AI needs, so a person explains what they want and the AI creates and edits everything"). Also `TECH.md` §5 and §6, and `docs/superpowers/plans/2026-10-17-team-mode-features.md` §F5. `DECISIONS.md` D16 to D25 still apply.

## How the AI sees it

```
Member's Claude ("work through our queue")       Lead's Claude ("every week audit acme.ge and green.ge, give it to Nino")
  next_task → (do it) → heartbeat → complete       list_members → list_tasks → create_task { title, prompt,
  list_work / claim / get_task (pick one)          repeatDays: 7, rows: [acme.ge, green.ge], assignees: ["Nino"] }
  fail / skip, save_my_note, board                 view_task / update_task / delete_task, list_logs
                                                   add_member / set_member_role / remove_member, get_policy / set_policy
```

A **routine** is just a task with `repeatDays > 0` (D16), and there is no separate routine tool. Members and tasks can be named **by name or by id**. Unknown or ambiguous names come back as an error that lists the valid choices, so the AI can correct itself.

## Global Constraints

- Pinned versions: `mcp-handler@2.3.0`, `@modelcontextprotocol/server@2.3.1`, `zod@4.6.7`, dev `@modelcontextprotocol/client@2.3.1`. `node-appwrite` stays at exactly `22.1.3`.
- MCP SDK v2: `registerTool(name, { description, inputSchema: z.object({...}), annotations }, (args, ctx) => …)`. The caller is read from `ctx.http?.authInfo`. Do not use the old `server.tool(...)` or raw zod shapes.
- Endpoint: `web/app/api/mcp/route.ts`, stateless, URL `https://<app>/api/mcp`. Any request without a valid token gets `401`. When F1 adds `web/proxy.ts`, it must not redirect `/api/mcp`.
- Roles match the web app: any member can read everything and write their own note. Only leads create, edit or delete tasks, change members or set the policy. A member calling a lead tool gets a tool error, not a crash.
- Every change to tasks, members or the policy writes an audit entry. Task audits from MCP add `via: "mcp"` to `after`.
- Only Claude claims, and only for itself: no tool claims or finishes for another member. The web app still never claims.
- No new tables or columns. The schema in `TECH.md` §3 is unchanged.
- Tool replies are one plain-language line for the AI, then a blank line and pretty JSON (`ok(line, data)`). Expected refusals ("taken", "not a lead", "unknown member") are readable text, never stack traces.
- The `settings` row has the fixed id `"settings"` and is shared by every `TEAM_ID`. Test scripts must never write the policy.
- What Claude receives for an item is always `buildPrompt(policy, latest prompt, the caller's own note, row)` (feature plan Global Constraints).

## File map

| File | Status | Responsibility |
|---|---|---|
| `web/lib/mcp/reply.ts` | create | Pure: reply shape (`ok`, `fail`), `callerOf`, `leadOnly`, `run`, `pickOne` |
| `web/lib/__tests__/reply.test.ts` | create | Unit tests for `reply.ts` |
| `web/lib/tasks.ts` | modify | Add `TaskPatch`, `patchTask` (pure) and `deleteTask` |
| `web/lib/__tests__/tasks.test.ts` | modify | Add `patchTask` test |
| `web/lib/team.ts` | create | Member and policy writes with audit, shared by actions and MCP |
| `web/app/actions.ts` | modify | Member and policy actions call `lib/team.ts` |
| `web/lib/mock.ts` | modify | Split `loadStore()` out of `db()`; add `promptOf`, `claudePrompt` |
| `web/lib/mcp/work.ts` | create | Worker tools |
| `web/lib/mcp/manage.ts` | create | Read and management tools |
| `web/app/api/mcp/route.ts` | create | Handler, auth, server instructions |
| `web/lib/mcp/instructions.ts` | modify | Add the "setting up work" section |
| `web/lib/__tests__/instructions.test.ts` | modify | Check the new section |
| `web/scripts/mcp-smoke.ts` | create | End-to-end check against a running dev server in its own team |
| `web/package.json` | modify | Dependencies + `mcp-smoke` script |
| `TECH.md`, `DECISIONS.md`, feature plan | modify | Tool table, D26, F5 status |

---

### Task 1: Pure MCP helpers (`reply.ts`)

**Files:**
- Create: `web/lib/mcp/reply.ts`
- Test: `web/lib/__tests__/reply.test.ts`

**Interfaces:**
- Consumes: `Caller` from `web/lib/types.ts`.
- Produces:
  - `type Reply = { content: Array<{ type: "text"; text: string }>; isError?: boolean }`
  - `ok(line: string, data?: unknown): Reply`
  - `fail(message: string): Reply`
  - `callerOf(ctx: Ctx): Caller` (throws when there is no caller)
  - `leadOnly(caller: Caller): void` (throws `"Only a team lead can do this. …"`)
  - `run(ctx: Ctx, body: (caller: Caller) => Promise<Reply>): Promise<Reply>`
  - `pickOne<X extends { $id: string }>(list: X[], ref: string, nameOf: (x: X) => string, kind: string): X`
  - `Ctx = { http?: { authInfo?: { extra?: Record<string, unknown> } } }`. The SDK's `ServerContext` fits this shape, so tool callbacks pass their `ctx` straight in.

- [ ] **Step 1: Write the failing test**

`web/lib/__tests__/reply.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { leadOnly, ok, pickOne, run } from "../mcp/reply";
import type { Caller } from "../types";

const lead: Caller = { kind: "member", memberId: "m1", role: "lead", scheduled: false };
const ctx = (caller?: Caller) => ({ http: { authInfo: { extra: caller ? { caller } : {} } } });
const people = [{ $id: "m1", name: "Nino" }, { $id: "m2", name: "Giorgi" }, { $id: "m3", name: "giorgi " }];
const name = (p: { name: string }) => p.name;

describe("pickOne", () => {
  it("finds by id", () => expect(pickOne(people, "m2", name, "member").$id).toBe("m2"));
  it("finds by name, ignoring case and spaces", () => expect(pickOne(people, " nino ", name, "member").$id).toBe("m1"));
  it("unknown lists the choices", () => expect(() => pickOne(people, "Ana", name, "member")).toThrow(/No member "Ana". Known: Nino \(m1\)/));
  it("ambiguous asks for the id", () => expect(() => pickOne(people, "Giorgi", name, "member")).toThrow(/Several members.*m2.*m3/));
});

it("ok puts the plain line first, then JSON", () => {
  expect(ok("Done.").content[0].text).toBe("Done.");
  expect(ok("Done.", { a: 1 }).content[0].text).toBe('Done.\n\n{\n  "a": 1\n}');
});

it("run needs a caller and turns thrown errors into tool errors", async () => {
  expect((await run(ctx(), async () => ok("x"))).isError).toBe(true);
  const r = await run(ctx(lead), async (c) => { leadOnly({ ...c, role: "member" }); return ok("x"); });
  expect(r.isError).toBe(true);
  expect(r.content[0].text).toContain("Only a team lead");
  expect((await run(ctx(lead), async (c) => ok(c.memberId))).content[0].text).toBe("m1");
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run (in `web/`): `npx vitest run lib/__tests__/reply.test.ts`
Expected: FAIL, `Failed to resolve import "../mcp/reply"`.

- [ ] **Step 3: Write the implementation**

`web/lib/mcp/reply.ts`:

```ts
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run lib/__tests__/reply.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add web/lib/mcp/reply.ts web/lib/__tests__/reply.test.ts
git commit -m "feat(mcp): reply, caller and name-or-id helpers"
```

---

### Task 2: Partial task edits and task delete (`tasks.ts`)

**Files:**
- Modify: `web/lib/tasks.ts` (append after `saveTask`, before `syncItems`)
- Test: `web/lib/__tests__/tasks.test.ts`

**Interfaces:**
- Consumes: `TaskInput`, `cleanRows`, `saveTask` (already in `tasks.ts`); `allRows`, `adminTables`, `DB_ID`, `T` from `./appwrite`.
- Produces:
  - `type TaskPatch = Partial<TaskInput> & { addAssignees?: string[]; removeAssignees?: string[]; addRows?: string[]; removeRows?: string[] }`
  - `patchTask(cur: TaskInput, p: TaskPatch): TaskInput` (pure). Assignees must already be member **ids**; the tool resolves names first.
  - `deleteTask(taskId: string): Promise<void>` deletes the task, its items, their claims and members' notes on it. Logs and prompt versions stay as history.

- [ ] **Step 1: Write the failing test**

Append to `web/lib/__tests__/tasks.test.ts`, and add `patchTask` to its import from `"../tasks"`:

```ts
it("patches only what is given; adds and removes rows and assignees", () => {
  const cur = { title: "Audit", prompt: "Do X", repeatDays: 0, assignees: ["m1"], rows: ["Acme", "Green"] };
  expect(patchTask(cur, {})).toEqual(cur);
  expect(patchTask(cur, { repeatDays: 7, addRows: ["Blue", "Acme"], removeRows: [" Green "], addAssignees: ["m2"], removeAssignees: ["m1"] }))
    .toEqual({ ...cur, repeatDays: 7, rows: ["Acme", "Blue"], assignees: ["m2"] });
  expect(patchTask(cur, { assignees: [], rows: ["Only"] })).toEqual({ ...cur, assignees: [], rows: ["Only"] });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run lib/__tests__/tasks.test.ts`
Expected: FAIL, `patchTask is not a function` (or a TS import error).

- [ ] **Step 3: Write the implementation**

In `web/lib/tasks.ts`, add right after the `saveTask` function:

```ts
export type TaskPatch = Partial<TaskInput> & { addAssignees?: string[]; removeAssignees?: string[]; addRows?: string[]; removeRows?: string[] };

/** A partial edit (the update_task MCP tool) applied to the task as it is now. Fields not given stay. */
export function patchTask(cur: TaskInput, p: TaskPatch): TaskInput {
  const edit = (base: string[], add: string[] = [], remove: string[] = []) => {
    const drop = new Set(remove.map((x) => x.trim()));
    return cleanRows([...base, ...add]).filter((x) => !drop.has(x));
  };
  return {
    title: p.title ?? cur.title,
    prompt: p.prompt ?? cur.prompt,
    repeatDays: p.repeatDays ?? cur.repeatDays,
    assignees: edit(p.assignees ?? cur.assignees, p.addAssignees, p.removeAssignees),
    rows: edit(p.rows ?? cur.rows, p.addRows, p.removeRows),
  };
}

/** Delete a task with its rows, their claims and members' notes on it. Logs and prompt versions stay as history. */
export async function deleteTask(taskId: string) {
  const [items, notes] = await Promise.all([
    allRows<TaskItem>(T.taskItems, [Query.equal("taskId", taskId)]),
    allRows<MemberNote>(T.memberNotes, [Query.equal("taskId", taskId)]),
  ]);
  await Promise.all([
    ...items.flatMap((i) => [db().deleteRow(DB_ID, T.taskItems, i.$id), db().deleteRow(DB_ID, T.claims, i.$id).catch(() => {})]),
    ...notes.map((n) => db().deleteRow(DB_ID, T.memberNotes, n.$id)),
  ]);
  await db().deleteRow(DB_ID, T.tasks, taskId);
}
```

(`deleteTask` talks to the database. Task 5's smoke script checks it end to end.)

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run lib/__tests__/tasks.test.ts && npx tsc --noEmit`
Expected: PASS; no type errors.

- [ ] **Step 5: Commit**

```bash
git add web/lib/tasks.ts web/lib/__tests__/tasks.test.ts
git commit -m "feat(tasks): patchTask for partial edits, deleteTask"
```

---

### Task 3: Shared team writes (`lib/team.ts`) used by the web app

The member and policy writes live inline in `app/actions.ts` and depend on `FormData` and the cookie login. Move them into `lib/team.ts` so the MCP tools (Task 5) and the settings page share one implementation, with one audit and one set of guards.

**Files:**
- Create: `web/lib/team.ts`
- Modify: `web/app/actions.ts` (`saveSettings`, `addMember`, `setRole`, `removeMember`, and the imports)

**Interfaces:**
- Consumes: `audit` (`lib/audit.ts`), `normalise` (`lib/tasks.ts`), `rowOrNull`, `adminTables`, `DB_ID`, `T`, `TEAM_ID`.
- Produces (each writes its own audit entry; the caller has already checked that `actorId` is a lead):
  - `addMember(actorId: string, name: string, role: Role): Promise<Member>`
  - `setRole(actorId: string, memberId: string, role: Role): Promise<Member>` (throws `"You cannot demote yourself."`)
  - `removeMember(actorId: string, memberId: string): Promise<Member>` (throws `"You cannot remove yourself."`)
  - `savePolicy(actorId: string, text: string): Promise<void>`

- [ ] **Step 1: Create `web/lib/team.ts`**

```ts
// Team admin writes shared by the web app (server actions) and the MCP tools. Callers check the lead role first.
import "server-only";
import { ID } from "node-appwrite";
import { adminTables, DB_ID, rowOrNull, T, TEAM_ID } from "./appwrite";
import { audit } from "./audit";
import { normalise } from "./tasks";
import type { Member, Role, Settings } from "./types";

const db = () => adminTables();

async function teamMember(memberId: string) {
  const m = await rowOrNull<Member>(T.members, memberId);
  if (!m || m.teamId !== TEAM_ID) throw new Error("Member not found");
  return m;
}

// ponytail: members without Appwrite users until F1 (invite by email, first-lead bootstrap).
export async function addMember(actorId: string, name: string, role: Role) {
  const m = { teamId: TEAM_ID, userId: ID.unique(), name: name.trim(), role };
  const row = await db().createRow(DB_ID, T.members, ID.unique(), m);
  await audit(actorId, "member.add", row.$id, undefined, m);
  return row as unknown as Member;
}

/** A lead cannot demote themselves (the team could be left without a lead). */
export async function setRole(actorId: string, memberId: string, role: Role) {
  const m = await teamMember(memberId);
  if (m.$id === actorId && role !== "lead") throw new Error("You cannot demote yourself.");
  await db().updateRow(DB_ID, T.members, m.$id, { role });
  await audit(actorId, "member.role", m.$id, m.role, role);
  return { ...m, role };
}

/** A lead cannot remove themselves. The removed member's tokens stop working: verifyBearer needs the member row. */
export async function removeMember(actorId: string, memberId: string) {
  const m = await teamMember(memberId);
  if (m.$id === actorId) throw new Error("You cannot remove yourself.");
  await db().deleteRow(DB_ID, T.members, m.$id);
  await audit(actorId, "member.remove", m.$id, m);
  return m;
}

export async function savePolicy(actorId: string, text: string) {
  const before = await rowOrNull<Settings>(T.settings, "settings");
  const policy = normalise(text);
  await db().upsertRow(DB_ID, T.settings, "settings", { teamId: TEAM_ID, policy });
  await audit(actorId, "settings.edit", "settings", before?.policy, policy);
}
```

- [ ] **Step 2: Point the server actions at it**

In `web/app/actions.ts`, replace the whole `// --- Settings: policy (F3), members (F1), tokens (F5) ---` block up to (not including) `createToken` with:

```ts
// --- Settings: policy (F3), members (F1), tokens (F5). Member and policy writes live in lib/team.ts (shared with MCP). ---
export async function saveSettings(f: FormData) {
  const lead = await requireLead();
  await team.savePolicy(lead.$id, String(f.get("policy") ?? ""));
  done();
}
export async function addMember(f: FormData) {
  const lead = await requireLead();
  await team.addMember(lead.$id, str(f, "name"), role(f));
  done();
}
export async function setRole(f: FormData) {
  const lead = await requireLead();
  await team.setRole(lead.$id, str(f, "id"), role(f));
  done();
}
export async function removeMember(f: FormData) {
  const lead = await requireLead();
  await team.removeMember(lead.$id, str(f, "id"));
  done();
}
```

Then fix the imports at the top of `actions.ts`:
- add `import * as team from "@/lib/team";`
- `import { rowOrNull, T } from "@/lib/appwrite";` (`adminTables`, `DB_ID` and `TEAM_ID` are no longer used here)
- remove `import { ID } from "node-appwrite";`
- `import type { ApiToken, Role } from "@/lib/types";`
- delete the now-unused `const db = () => adminTables();`

The settings page already hides the role and remove controls on the lead's own row (`m.$id !== me.$id`, `settings/page.tsx:47`), so the new self-guards never fire from the UI.

- [ ] **Step 3: Typecheck, lint, test**

Run (in `web/`): `npx tsc --noEmit && npm run lint && npm test`
Expected: all clean; existing tests pass.

- [ ] **Step 4: Manual check in the web app**

Run `npm run dev`, sign in as a lead, and on `/settings`: add a member "Temp", make them lead, set them back to member, remove them, then save the policy unchanged. Each step should work as before. Four `member.*` rows and one `settings.edit` row should appear in the audit table (Appwrite console → `audit_log`).

- [ ] **Step 5: Commit**

```bash
git add web/lib/team.ts web/app/actions.ts
git commit -m "refactor(team): member and policy writes in lib/team.ts, shared by actions and MCP"
```

---

### Task 4: The endpoint, auth and worker tools

This is TECH §5 as written: `next_task`, `list_work`, `get_task`, `claim`, `heartbeat`, `complete`, `fail`, `skip`, `board`, plus `save_my_note` (D24 through MCP). The smoke script is this task's test.

**Files:**
- Modify: `web/package.json` (dependencies + `mcp-smoke` script)
- Modify: `web/lib/mock.ts` (split `loadStore`, add `promptOf`, `claudePrompt`)
- Create: `web/lib/mcp/work.ts`
- Create: `web/app/api/mcp/route.ts`
- Create: `web/scripts/mcp-smoke.ts`

**Interfaces:**
- Consumes: `ok`, `run`, `pickOne`, `Reply` (Task 1); `claim`, `claimNext`, `finish`, `heartbeat`, `listEligible`, `recordSkip` (`lib/claims.ts`); `saveNote`, `saveTask` (`lib/tasks.ts`); `verifyBearer`, `createToken` (`lib/tokens.ts`); `itemState`, `itemsOf`, `repeatLabel`, `noteOf`, `Store` (`lib/mock.ts`); `MCP_INSTRUCTIONS` (`lib/mcp/instructions.ts`).
- Produces:
  - `loadStore(): Promise<Store>`: the team snapshot without `connection()`. Usable from route handlers and scripts.
  - `promptOf(s: Store, task: Task): string`: the prompt of the version in use.
  - `claudePrompt(s: Store, task: Task, item: TaskItem, memberId: string): string`: exactly what that member's Claude receives.
  - `registerWorkTools(server: McpServer): void`
  - `web/scripts/mcp-smoke.ts` exports nothing. Task 5 extends its `main()`; the helpers `connect`, `call`, `text`, `json` are defined in this task.

- [ ] **Step 1: Install the packages and add the script**

Run (in `web/`):

```bash
npm i --save-exact mcp-handler@2.3.0 @modelcontextprotocol/server@2.3.1 zod@4.6.7
npm i -D --save-exact @modelcontextprotocol/client@2.3.1
```

Add to `"scripts"` in `web/package.json`:

```json
"mcp-smoke": "tsx --env-file=.env.local --conditions=react-server scripts/mcp-smoke.ts"
```

(`--env-file` does not override variables already set, so `TEAM_ID=mcp-smoke` from the shell wins. `race-test` relies on the same behaviour.)

- [ ] **Step 2: Write the failing smoke test**

`web/scripts/mcp-smoke.ts`:

```ts
// MCP acceptance against a running dev server, in its own team so the real team's tasks are never touched.
//   terminal 1: TEAM_ID=mcp-smoke npm run dev
//   terminal 2: TEAM_ID=mcp-smoke npm run mcp-smoke
// (PowerShell: $env:TEAM_ID='mcp-smoke'; npm run dev). Creates a lead and a member with tokens, drives the tools
// the way Claude would, then deletes everything it made. Never writes the policy: the settings row is shared by all teams.
import assert from "node:assert/strict";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { ID, Query } from "node-appwrite";
import { adminTables, allRows, DB_ID, T, TEAM_ID } from "../lib/appwrite";
import { saveTask } from "../lib/tasks";
import { createToken } from "../lib/tokens";

assert.equal(TEAM_ID, "mcp-smoke", "run as: TEAM_ID=mcp-smoke npm run mcp-smoke (and the dev server with the same TEAM_ID)");
const MCP_URL = new URL(process.env.MCP_URL ?? "http://localhost:3000/api/mcp");
const db = adminTables();

type Result = { content: unknown; isError?: boolean };
async function connect(token?: string) {
  const client = new Client({ name: "mcp-smoke", version: "0.0.0" });
  await client.connect(new StreamableHTTPClientTransport(MCP_URL, { requestInit: { headers: token ? { Authorization: `Bearer ${token}` } : {} } }));
  return client;
}
const call = async (c: Client, name: string, args: Record<string, unknown> = {}) => (await c.callTool({ name, arguments: args })) as Result;
const text = (r: Result) => (r.content as Array<{ text: string }>)[0].text;
const json = <X>(r: Result) => JSON.parse(text(r).split("\n\n").slice(1).join("\n\n")) as X;

async function main() {
  const member = (name: string, role: string) => db.createRow(DB_ID, T.members, ID.unique(), { teamId: TEAM_ID, userId: ID.unique(), name, role });
  const lead = await member("Smoke Lead", "lead");
  const mem = await member("Smoke Member", "member");

  // Auth
  await assert.rejects(connect(), "no token must get 401");
  await assert.rejects(connect("cc_wrong"), "an unknown token must get 401");
  const L = await connect((await createToken(lead.$id, "smoke", false)).token);
  const M = await connect((await createToken(mem.$id, "smoke", true)).token);
  assert.match(L.getInstructions() ?? "", /next_task/);

  // Worker tools
  const tools = (await M.listTools()).tools.map((t) => t.name);
  for (const n of ["next_task", "list_work", "get_task", "claim", "heartbeat", "complete", "fail", "skip", "save_my_note", "board"]) assert.ok(tools.includes(n), `missing tool ${n}`);
  await saveTask(null, { title: "Smoke work", prompt: "Say hi", repeatDays: 0, assignees: [], rows: ["a", "b"] }, lead.$id);
  assert.match(text(await call(M, "save_my_note", { task: "smoke work", text: "My files are in D:/x" })), /Saved your note/);

  const first = json<{ itemId: string; prompt: string }>(await call(M, "next_task"));
  assert.match(first.prompt, /Say hi[\s\S]*My files are in D:\/x[\s\S]*Item: a/);
  assert.match(text(await call(L, "claim", { itemId: first.itemId })), /Not claimed: Someone else/);
  assert.notEqual((await call(M, "heartbeat", { itemId: first.itemId })).isError, true);
  assert.equal((await call(L, "complete", { itemId: first.itemId, summary: "x" })).isError, true, "only the holder can finish");
  assert.match(text(await call(M, "complete", { itemId: first.itemId, summary: "said hi", details: "in chat" })), /Logged as done/);

  const second = json<{ itemId: string; prompt: string }>(await call(L, "next_task"));
  assert.match(second.prompt, /Item: b/);
  assert.doesNotMatch(second.prompt, /D:\/x/, "a note reaches only its owner");
  assert.match(text(await call(L, "skip", { itemId: second.itemId, reason: "smoke" })), /Logged as skipped/);
  const again = json<{ itemId: string }>(await call(M, "next_task"));
  assert.equal(again.itemId, second.itemId, "a skipped item comes back");
  await call(M, "complete", { itemId: again.itemId, summary: "said hi" });
  assert.match(text(await call(M, "next_task")), /Nothing left/);
  assert.match(text(await call(M, "board")), /0 in progress, 0 free, 2 done/);

  // (Task 5 adds the management checks here.)

  await Promise.all([L.close(), M.close()]);
  console.log("mcp-smoke: all checks passed");
}

/** Deletes every row this team made (members, tasks, items, claims, tokens, logs, notes, versions, audit). */
async function cleanup() {
  type Row = { $id: string };
  const team = [Query.equal("teamId", TEAM_ID)];
  const members = await allRows<Row>(T.members, team);
  const ids = members.map((m) => m.$id);
  const by = (table: string, col: string) => (ids.length ? allRows<Row>(table, [Query.equal(col, ids)]) : Promise.resolve([] as Row[]));
  const items = await allRows<Row>(T.taskItems, team);
  const sets: Array<[string, Row[]]> = [
    [T.claims, items], [T.taskItems, items],
    [T.tasks, await allRows<Row>(T.tasks, team)], [T.audit, await allRows<Row>(T.audit, team)],
    [T.apiTokens, await by(T.apiTokens, "owner")], [T.logs, await by(T.logs, "by")],
    [T.memberNotes, await by(T.memberNotes, "memberId")], [T.taskVersions, await by(T.taskVersions, "authorId")],
    [T.members, members],
  ];
  for (const [table, rows] of sets) await Promise.all(rows.map((r) => db.deleteRow(DB_ID, table, r.$id).catch(() => {})));
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(cleanup);
```

- [ ] **Step 3: Run it to verify it fails**

Start the dev server in the background with `TEAM_ID=mcp-smoke npm run dev` (PowerShell: `$env:TEAM_ID='mcp-smoke'; npm run dev`). Then run `TEAM_ID=mcp-smoke npm run mcp-smoke`.
Expected: FAIL. `/api/mcp` returns 404, so the first `connect` with a token rejects (`AssertionError` or a transport error), and cleanup still runs.

- [ ] **Step 4: Add the store helpers to `web/lib/mock.ts`**

Replace the existing `export const db = cache(async (): Promise<Store> => { await connection(); … });` with a plain loader plus the cached page wrapper. The body of `loadStore` is the old body of `db` without the `await connection();` line:

```ts
/** One snapshot of the team's data. MCP tools and scripts call this; pages use db() below. */
export async function loadStore(): Promise<Store> {
  const [members, tasks, taskVersions, taskItems, memberNotes, claims, logs, settings, apiTokens, audit] = await Promise.all([
    allRows<Member>(T.members, team),
    allRows<Task>(T.tasks, [...team, Query.orderAsc("$createdAt")]),
    allRows<TaskVersion>(T.taskVersions),
    allRows<TaskItem>(T.taskItems, team),
    allRows<MemberNote>(T.memberNotes),
    allRows<Claim>(T.claims),
    allRows<Log>(T.logs, [Query.orderDesc("finishedAt"), Query.limit(500)]), // ponytail: newest 500; page it when Logs needs more
    rowOrNull<Settings>(T.settings, "settings"),
    allRows<ApiToken>(T.apiTokens),
    allRows<AuditEntry>(T.audit, [...team, Query.orderDesc("at"), Query.limit(200)]),
  ]);
  return {
    members, tasks, taskVersions, taskItems, memberNotes, claims, logs, apiTokens, audit,
    settings: settings ?? { $id: "settings", teamId: TEAM_ID, policy: DEFAULT_POLICY },
  };
}

/** Await before reading: marks the render as request-time (cacheComponents is on). Loaded once per request (layout + page share it). */
export const db = cache(async (): Promise<Store> => {
  await connection();
  return loadStore();
});
```

Then add, after `noteOf`:

```ts
/** The prompt of the version in use (every run uses the latest). */
export const promptOf = (s: Store, task: Task) =>
  s.taskVersions.find((v) => v.taskId === task.$id && v.version === task.currentVersion)?.prompt ?? "";

/** Exactly what this member's Claude receives for the item: policy, prompt, their own note, the row. */
export const claudePrompt = (s: Store, task: Task, item: TaskItem, memberId: string) =>
  buildPrompt(s.settings.policy, promptOf(s, task), noteOf(s, task.$id, memberId), item.text);
```

- [ ] **Step 5: Create the worker tools**

`web/lib/mcp/work.ts`:

```ts
// Worker tools (TECH §5): what a member's Claude uses to take, do and report work. Any member; each acts only for the caller.
import "server-only";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/server";
import { claim, claimNext, finish, heartbeat, listEligible, recordSkip, type ClaimFail } from "../claims";
import { claudePrompt, itemState, itemsOf, loadStore, repeatLabel } from "../mock";
import { saveNote } from "../tasks";
import { ok, pickOne, run } from "./reply";

const itemIdArg = z.string().describe("The itemId from next_task, list_work or view_task.");
const rowLabel = (text: string) => (text ? ` (row "${text}")` : "");
const REFUSED: Record<ClaimFail, string> = {
  taken: "Someone else is on it. Choose another.",
  done: "Already done. Choose another.",
  "not-assigned": "This task is assigned to other members.",
  "not-found": "No such item.",
};

export function registerWorkTools(server: McpServer) {
  server.registerTool("next_task", {
    description: "Main path. Claims the next free task (or one row of a task) for you and returns exactly what to do. When it says nothing is left, stop.",
    inputSchema: z.object({}),
  }, async (_args, ctx) => run(ctx, async (caller) => {
    const got = await claimNext(caller);
    if (!got) return ok("Nothing left for you. Stop.", { empty: true });
    const s = await loadStore();
    return ok(`Claimed "${got.task.title}"${rowLabel(got.item.text)} until ${got.leaseUntil}. Do the prompt, then call complete, fail or skip with this itemId.`, {
      itemId: got.item.$id, task: got.task.title, item: got.item.text, leaseUntil: got.leaseUntil,
      prompt: claudePrompt(s, got.task, got.item, caller.memberId),
    });
  }));

  server.registerTool("list_work", {
    description: "Free items you may claim now, best first. To pick a specific one, then call claim with its itemId.",
    inputSchema: z.object({ limit: z.number().int().min(1).max(50).optional().describe("Default 10.") }),
    annotations: { readOnlyHint: true },
  }, async ({ limit }, ctx) => run(ctx, async (caller) => {
    const work = await listEligible(caller, limit ?? 10);
    return ok(work.length ? `${work.length} free item(s).` : "Nothing free for you.", work.map(({ item, task, lastLog }) => ({
      itemId: item.$id, task: task.title, item: item.text, repeat: repeatLabel(task),
      lastLog: lastLog && { outcome: lastLog.outcome, summary: lastLog.summary, at: lastLog.finishedAt },
    })));
  }));

  server.registerTool("get_task", {
    description: "The full prompt for one item (team policy, task prompt, your own note, the row), plus who is on it now.",
    inputSchema: z.object({ itemId: itemIdArg }),
    annotations: { readOnlyHint: true },
  }, async ({ itemId }, ctx) => run(ctx, async (caller) => {
    const s = await loadStore();
    const item = s.taskItems.find((i) => i.$id === itemId);
    const task = item && s.tasks.find((t) => t.$id === item.taskId);
    if (!item || !task) throw new Error(`No item ${itemId}. Use list_work or view_task to find item ids.`);
    return ok(`"${task.title}"${rowLabel(item.text)}: ${itemState(s, item).label}.`, {
      itemId, task: task.title, item: item.text, prompt: claudePrompt(s, task, item, caller.memberId),
    });
  }));

  server.registerTool("claim", {
    description: "Claim one item so nobody else does it. Never work on an item you have not claimed.",
    inputSchema: z.object({ itemId: itemIdArg }),
  }, async ({ itemId }, ctx) => run(ctx, async (caller) => {
    const r = await claim(itemId, caller);
    return r.ok ? ok(`Claimed until ${r.leaseUntil}. Call get_task for the prompt.`, r) : ok(`Not claimed: ${REFUSED[r.reason]}`, r);
  }));

  server.registerTool("heartbeat", {
    description: "Extend your claim on long work. Call at least every 30 minutes.",
    inputSchema: z.object({ itemId: itemIdArg }),
  }, async ({ itemId }, ctx) => run(ctx, async (caller) => {
    const r = await heartbeat(itemId, caller);
    if (!r.ok) throw new Error("You do not hold this item. Claim it again before you continue.");
    return ok(`Lease extended until ${r.leaseUntil}.`, r);
  }));

  server.registerTool("complete", {
    description: "Finish an item you hold: a short summary, and details (what you did, where the result is, anything a human should know).",
    inputSchema: z.object({ itemId: itemIdArg, summary: z.string().min(1), details: z.string().optional() }),
  }, async ({ itemId, summary, details }, ctx) => run(ctx, async (caller) => {
    const log = await finish(itemId, caller, "done", { summary, details });
    return ok(`Logged as done (log ${log.$id}). Call next_task for more.`, { logId: log.$id });
  }));

  server.registerTool("fail", {
    description: "Give up on an item you hold, with the reason. It becomes free again for someone else.",
    inputSchema: z.object({ itemId: itemIdArg, reason: z.string().min(1), details: z.string().optional() }),
  }, async ({ itemId, reason, details }, ctx) => run(ctx, async (caller) => {
    const log = await finish(itemId, caller, "failed", { summary: reason, details });
    return ok(`Logged as failed (log ${log.$id}).`, { logId: log.$id });
  }));

  server.registerTool("skip", {
    description: "Decide not to do an item, with the reason (logged so the lead sees why). No claim needed.",
    inputSchema: z.object({ itemId: itemIdArg, reason: z.string().min(1) }),
  }, async ({ itemId, reason }, ctx) => run(ctx, async (caller) => {
    const log = await recordSkip(itemId, caller, reason);
    return ok(`Logged as skipped (log ${log.$id}).`, { logId: log.$id });
  }));

  server.registerTool("save_my_note", {
    description: "Save your own note on a task (e.g. where your files are). Only your Claude receives it, after the task prompt. Empty text removes it.",
    inputSchema: z.object({ task: z.string().describe("Task id or exact title."), text: z.string() }),
  }, async ({ task, text }, ctx) => run(ctx, async (caller) => {
    const s = await loadStore();
    const t = pickOne(s.tasks, task, (x) => x.title, "task");
    await saveNote(t.$id, caller.memberId, text);
    return ok(text.trim() ? `Saved your note on "${t.title}". Only your Claude receives it.` : `Removed your note on "${t.title}".`);
  }));

  server.registerTool("board", {
    description: "Who is working on what, what is free, what is done: every task and row with its state.",
    inputSchema: z.object({}),
    annotations: { readOnlyHint: true },
  }, async (_args, ctx) => run(ctx, async () => {
    const s = await loadStore();
    const states = s.taskItems.map((i) => itemState(s, i).key);
    const n = (key: string) => states.filter((k) => k === key).length;
    return ok(`${n("in progress")} in progress, ${n("free")} free, ${n("done")} done, ${n("failed")} failed.`, s.tasks.map((t) => ({
      taskId: t.$id, task: t.title, repeat: repeatLabel(t),
      items: itemsOf(s, t.$id).map((i) => ({ itemId: i.$id, item: i.text, state: itemState(s, i).label })),
    })));
  }));
}
```

- [ ] **Step 6: Create the route**

`web/app/api/mcp/route.ts`:

```ts
// MCP endpoint (TECH §5): https://<app>/api/mcp, stateless Streamable HTTP. Every request needs "Authorization: Bearer cc_…".
import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { MCP_INSTRUCTIONS } from "@/lib/mcp/instructions";
import { registerWorkTools } from "@/lib/mcp/work";
import { verifyBearer } from "@/lib/tokens";

const mcp = createMcpHandler((server) => {
  registerWorkTools(server);
}, { instructions: MCP_INSTRUCTIONS, serverInfo: { name: "commons", version: "0.1.0" } });

/** The token's member becomes the caller of every tool (read back with callerOf in lib/mcp/reply.ts). */
const handler = withMcpAuth(mcp, async (req, bearer) => {
  const caller = await verifyBearer(req.headers.get("authorization"));
  return caller ? { token: bearer ?? "", clientId: caller.memberId, scopes: [], extra: { caller } } : undefined;
}, { required: true });

export { handler as GET, handler as POST, handler as DELETE };
```

- [ ] **Step 7: Run everything to verify it passes**

With the `TEAM_ID=mcp-smoke` dev server still running (restart it if it was started before the packages were installed):

Run: `TEAM_ID=mcp-smoke npm run mcp-smoke`
Expected: `mcp-smoke: all checks passed`, exit code 0. In the Appwrite console, no rows with `teamId = mcp-smoke` are left.

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: all clean.

If `assert.rejects(connect())` fails because the client does not throw on 401, run `curl -i -X POST http://localhost:3000/api/mcp -H "content-type: application/json" -d "{}"`. It must answer `401`. If it does, the route is right; adjust the assertion to match how the client reports it.

- [ ] **Step 8: Commit**

```bash
git add web/package.json web/package-lock.json web/lib/mock.ts web/lib/mcp/work.ts web/app/api/mcp/route.ts web/scripts/mcp-smoke.ts
git commit -m "feat(mcp): /api/mcp endpoint with token auth and worker tools"
```

---

### Task 5: Read and management tools (tasks, routines, assignments, members, policy)

This is the part the user asked for: "explain to the AI what you want and it creates and edits everything".

**Files:**
- Create: `web/lib/mcp/manage.ts`
- Modify: `web/app/api/mcp/route.ts` (register the new tools)
- Modify: `web/scripts/mcp-smoke.ts` (add the management checks)

**Interfaces:**
- Consumes: `ok`, `run`, `pickOne`, `leadOnly` (Task 1); `patchTask`, `deleteTask`, `saveTask`, `TaskInput` (Task 2, `tasks.ts`); `addMember`, `setRole`, `removeMember`, `savePolicy` (Task 3, `lib/team.ts`); `loadStore`, `promptOf`, `noteOf`, `itemState`, `itemsOf`, `repeatLabel`, `who`, `Store` (Task 4, `mock.ts`); `audit`.
- Produces: `registerManageTools(server: McpServer): void` with these tools:

| Tool | Who | Input | Does |
|---|---|---|---|
| `list_members` | any | – | Members with id, name, role; `you: true` on the caller |
| `list_tasks` | any | `query?` | Tasks: id, title, repeat, assigned to (names), rows, done, in progress |
| `view_task` | any | `task` | One task: prompt, version, items with state and itemId, assignees, your note, last 5 logs |
| `list_logs` | any | `task?`, `member?`, `outcome?`, `limit?` | Who did what, newest first, with details |
| `get_policy` | any | – | The team policy placed before every prompt |
| `create_task` | lead | `title`, `prompt`, `repeatDays?`, `assignees?`, `rows?` | New task or routine |
| `update_task` | lead | `task` + any of `title`, `prompt`, `repeatDays`, `assignees`, `addAssignees`, `removeAssignees`, `rows`, `addRows`, `removeRows` | Partial edit; a changed prompt becomes a new version |
| `delete_task` | lead | `task` | Delete; logs stay |
| `set_policy` | lead | `policy` | Replace the team policy |
| `add_member` | lead | `name`, `role?` | Add a member |
| `set_member_role` | lead | `member`, `role` | Make lead / member |
| `remove_member` | lead | `member` | Remove; their tokens stop working |

- [ ] **Step 1: Write the failing smoke checks**

In `web/scripts/mcp-smoke.ts`, replace the line `// (Task 5 adds the management checks here.)` with:

```ts
  // Management tools
  const all = (await L.listTools()).tools.map((t) => t.name);
  for (const n of ["list_members", "list_tasks", "view_task", "list_logs", "get_policy", "create_task", "update_task", "delete_task", "set_policy", "add_member", "set_member_role", "remove_member"]) assert.ok(all.includes(n), `missing tool ${n}`);

  const people = json<Array<{ name: string; you: boolean }>>(await call(M, "list_members"));
  assert.equal(people.find((p) => p.you)?.name, "Smoke Member");

  assert.match(text(await call(M, "create_task", { title: "Nope", prompt: "x" })), /Only a team lead/);
  assert.match(text(await call(L, "create_task", { title: "Bad", prompt: "x", assignees: ["Nobody"] })), /No member "Nobody"/);
  assert.match(text(await call(L, "create_task", {
    title: "Weekly audit", prompt: "Audit the site", repeatDays: 7, assignees: ["smoke member"], rows: ["acme.ge", "green.ge"],
  })), /Created "Weekly audit"/);
  assert.match(text(await call(L, "update_task", {
    task: "weekly audit", prompt: "Audit the site v2", addRows: ["blue.ge"], removeRows: ["acme.ge"], addAssignees: ["Smoke Lead"],
  })), /prompt is now v2/);
  const view = json<{ items: Array<{ row: string }>; assignedTo: string[]; repeat: string; prompt: string }>(await call(L, "view_task", { task: "Weekly audit" }));
  assert.deepEqual(view.items.map((i) => i.row), ["green.ge", "blue.ge"]);
  assert.deepEqual(view.assignedTo, ["Smoke Member", "Smoke Lead"]);
  assert.equal(view.repeat, "every 7d");
  assert.equal(view.prompt, "Audit the site v2");

  await call(L, "create_task", { title: "Member only", prompt: "x", assignees: ["Smoke Member"] });
  const only = json<{ items: Array<{ itemId: string }> }>(await call(L, "view_task", { task: "Member only" }));
  assert.match(text(await call(L, "claim", { itemId: only.items[0].itemId })), /assigned to other members/);

  const mine = json<Array<{ outcome: string }>>(await call(L, "list_logs", { member: "Smoke Member" }));
  assert.deepEqual(mine.map((l) => l.outcome), ["done", "done"]);

  assert.match(text(await call(M, "remove_member", { member: "Smoke Lead" })), /Only a team lead/);
  assert.match(text(await call(L, "remove_member", { member: "Smoke Lead" })), /cannot remove yourself/);
  assert.match(text(await call(L, "add_member", { name: "Smoke Temp" })), /Added "Smoke Temp" as member/);
  assert.match(text(await call(L, "set_member_role", { member: "smoke temp", role: "lead" })), /"Smoke Temp" is now a lead/);
  assert.match(text(await call(L, "remove_member", { member: "Smoke Temp" })), /Removed "Smoke Temp"/);

  assert.match(text(await call(M, "set_policy", { policy: "x" })), /Only a team lead/); // never set it for real: the row is shared
  assert.match(text(await call(M, "get_policy")), /team policy/);

  assert.match(text(await call(L, "delete_task", { task: "Weekly audit" })), /Deleted "Weekly audit"/);
  assert.doesNotMatch(text(await call(L, "list_tasks")), /Weekly audit/);
```

- [ ] **Step 2: Run it to verify it fails**

Run (dev server with `TEAM_ID=mcp-smoke` running): `TEAM_ID=mcp-smoke npm run mcp-smoke`
Expected: FAIL with `missing tool list_members`. Cleanup still runs.

- [ ] **Step 3: Create the management tools**

`web/lib/mcp/manage.ts`:

```ts
// Read tools (any member) and management tools (leads): tasks, routines, assignments, members, the team policy.
// A routine is a task with repeatDays > 0 (D16). Members and tasks are named by name or id (pickOne).
import "server-only";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/server";
import { audit } from "../audit";
import { itemState, itemsOf, loadStore, noteOf, promptOf, repeatLabel, who, type Store } from "../mock";
import { deleteTask, patchTask, saveTask, type TaskInput } from "../tasks";
import * as team from "../team";
import type { Task } from "../types";
import { leadOnly, ok, pickOne, run } from "./reply";

const memberRef = (s: Store, ref: string) => pickOne(s.members, ref, (m) => m.name, "member");
const taskRef = (s: Store, ref: string) => pickOne(s.tasks, ref, (t) => t.title, "task");
const memberIds = (s: Store, refs: string[] = []) => refs.map((r) => memberRef(s, r).$id);
const names = (s: Store, ids: string[]) => (ids.length ? ids.map((id) => who(s, id)) : ["anyone"]);

const inputOf = (s: Store, t: Task): TaskInput => ({
  title: t.title, prompt: promptOf(s, t), repeatDays: t.repeatDays, assignees: t.assignees,
  rows: itemsOf(s, t.$id).map((i) => i.text).filter(Boolean),
});

function overview(s: Store, t: Task) {
  const items = itemsOf(s, t.$id);
  const keys = items.map((i) => itemState(s, i).key);
  return {
    taskId: t.$id, title: t.title, repeat: repeatLabel(t), assignedTo: names(s, t.assignees),
    rows: items.filter((i) => i.text).length, done: keys.filter((k) => k === "done").length, inProgress: keys.filter((k) => k === "in progress").length,
  };
}

const taskArg = z.string().describe("Task id or exact title (see list_tasks).");
const memberArg = z.string().describe("Member name or id (see list_members).");
const people = z.array(z.string()).describe("Member names or ids (see list_members).");
const repeatDays = z.number().int().min(0).max(365).describe("0 = do once. N = a routine: each row comes back N days after it was last done.");
const role = z.enum(["lead", "member"]);

export function registerManageTools(server: McpServer) {
  // --- Read (any member) ---
  server.registerTool("list_members", {
    description: "Everyone on the team with their role. 'you' marks the caller. Only leads can create or edit tasks and members.",
    inputSchema: z.object({}),
    annotations: { readOnlyHint: true },
  }, async (_args, ctx) => run(ctx, async (caller) => {
    const s = await loadStore();
    return ok(`${s.members.length} member(s).`, s.members.map((m) => ({ memberId: m.$id, name: m.name, role: m.role, you: m.$id === caller.memberId })));
  }));

  server.registerTool("list_tasks", {
    description: "All tasks and routines with who they are assigned to and progress. Optional query filters by title.",
    inputSchema: z.object({ query: z.string().optional() }),
    annotations: { readOnlyHint: true },
  }, async ({ query }, ctx) => run(ctx, async () => {
    const s = await loadStore();
    const q = query?.trim().toLowerCase() ?? "";
    const tasks = s.tasks.filter((t) => t.title.toLowerCase().includes(q));
    return ok(`${tasks.length} task(s).`, tasks.map((t) => overview(s, t)));
  }));

  server.registerTool("view_task", {
    description: "One task in full: its prompt (version in use), rows with their state and itemId, assignees, your own note and the last 5 logs. Read it before editing.",
    inputSchema: z.object({ task: taskArg }),
    annotations: { readOnlyHint: true },
  }, async ({ task }, ctx) => run(ctx, async (caller) => {
    const s = await loadStore();
    const t = taskRef(s, task);
    return ok(`"${t.title}", prompt v${t.currentVersion}, ${repeatLabel(t)}.`, {
      ...overview(s, t), version: t.currentVersion, prompt: promptOf(s, t), myNote: noteOf(s, t.$id, caller.memberId),
      items: itemsOf(s, t.$id).map((i) => ({ itemId: i.$id, row: i.text, state: itemState(s, i).label })),
      recentLogs: s.logs.filter((l) => l.taskId === t.$id).slice(0, 5)
        .map((l) => ({ at: l.finishedAt, by: who(s, l.by, l.scheduled), row: l.item, outcome: l.outcome, summary: l.summary })),
    });
  }));

  server.registerTool("list_logs", {
    description: "Who did what, newest first: filter by task, member and outcome. Includes the details each run reported.",
    inputSchema: z.object({
      task: taskArg.optional(), member: memberArg.optional(),
      outcome: z.enum(["done", "failed", "skipped"]).optional(), limit: z.number().int().min(1).max(100).optional().describe("Default 20."),
    }),
    annotations: { readOnlyHint: true },
  }, async ({ task, member, outcome, limit }, ctx) => run(ctx, async () => {
    const s = await loadStore();
    const t = task ? taskRef(s, task) : null;
    const m = member ? memberRef(s, member) : null;
    const logs = s.logs.filter((l) => (!t || l.taskId === t.$id) && (!m || l.by === m.$id) && (!outcome || l.outcome === outcome)).slice(0, limit ?? 20);
    return ok(`${logs.length} log(s), newest first.`, logs.map((l) => ({
      at: l.finishedAt, by: who(s, l.by, l.scheduled), task: s.tasks.find((x) => x.$id === l.taskId)?.title ?? "(deleted task)",
      row: l.item, outcome: l.outcome, summary: l.summary, details: l.details, version: l.version,
    })));
  }));

  server.registerTool("get_policy", {
    description: "The team policy: rules placed before every task prompt (how to deliver results, what never to touch).",
    inputSchema: z.object({}),
    annotations: { readOnlyHint: true },
  }, async (_args, ctx) => run(ctx, async () => ok("The team policy, placed before every task prompt.", { policy: (await loadStore()).settings.policy })));

  // --- Tasks and routines (leads) ---
  server.registerTool("create_task", {
    description: "Create a task: a title and a prompt (free text: what to do and where the result goes). With repeatDays it is a routine. Rows = the things to do it for (clients, sites, files); each row is claimed separately. No assignees = anyone.",
    inputSchema: z.object({
      title: z.string().min(1), prompt: z.string().min(1),
      repeatDays: repeatDays.optional(), assignees: people.optional(), rows: z.array(z.string()).optional(),
    }),
  }, async (a, ctx) => run(ctx, async (caller) => {
    leadOnly(caller);
    const s = await loadStore();
    const { task } = await saveTask(null, {
      title: a.title, prompt: a.prompt, repeatDays: a.repeatDays ?? 0, assignees: memberIds(s, a.assignees), rows: a.rows ?? [],
    }, caller.memberId);
    await audit(caller.memberId, "task.create", task.$id, undefined, { title: task.title, version: task.currentVersion, via: "mcp" });
    return ok(`Created "${task.title}".`, overview(await loadStore(), task));
  }));

  server.registerTool("update_task", {
    description: "Edit a task: give only what changes. A changed prompt becomes a new version (history kept). Removing a row drops its status; its logs stay. Confirm with the user before removing rows.",
    inputSchema: z.object({
      task: taskArg,
      title: z.string().min(1).optional(),
      prompt: z.string().min(1).optional().describe("Replaces the whole prompt."),
      repeatDays: repeatDays.optional(),
      assignees: people.optional().describe("Replaces the assignee list. [] = anyone."),
      addAssignees: people.optional(), removeAssignees: people.optional(),
      rows: z.array(z.string()).optional().describe("Replaces all rows."),
      addRows: z.array(z.string()).optional(), removeRows: z.array(z.string()).optional(),
    }),
  }, async ({ task, ...p }, ctx) => run(ctx, async (caller) => {
    leadOnly(caller);
    const s = await loadStore();
    const t = taskRef(s, task);
    const next = patchTask(inputOf(s, t), {
      ...p,
      assignees: p.assignees && memberIds(s, p.assignees),
      addAssignees: memberIds(s, p.addAssignees),
      removeAssignees: memberIds(s, p.removeAssignees),
    });
    const { task: saved, newVersion } = await saveTask(t.$id, next, caller.memberId);
    await audit(caller.memberId, "task.edit", saved.$id, undefined, { title: saved.title, version: saved.currentVersion, newVersion, via: "mcp" });
    return ok(`Updated "${saved.title}"${newVersion ? `; prompt is now v${newVersion}` : ""}.`, overview(await loadStore(), saved));
  }));

  server.registerTool("delete_task", {
    description: "Delete a task and its rows. Logs and prompt history stay. Confirm with the user first.",
    inputSchema: z.object({ task: taskArg }),
    annotations: { destructiveHint: true },
  }, async ({ task }, ctx) => run(ctx, async (caller) => {
    leadOnly(caller);
    const t = taskRef(await loadStore(), task);
    await deleteTask(t.$id);
    await audit(caller.memberId, "task.delete", t.$id, { title: t.title }, undefined);
    return ok(`Deleted "${t.title}". Its logs stay.`);
  }));

  // --- Team policy and members (leads) ---
  server.registerTool("set_policy", {
    description: "Replace the team policy (rules placed before every task prompt). Read get_policy first and keep what still applies.",
    inputSchema: z.object({ policy: z.string().min(1) }),
  }, async ({ policy }, ctx) => run(ctx, async (caller) => {
    leadOnly(caller);
    await team.savePolicy(caller.memberId, policy);
    return ok("Saved the team policy.");
  }));

  server.registerTool("add_member", {
    description: "Add a team member (default role: member). They then create their own Claude token in the web app (Connect Claude).",
    inputSchema: z.object({ name: z.string().min(1), role: role.optional() }),
  }, async ({ name, role: r }, ctx) => run(ctx, async (caller) => {
    leadOnly(caller);
    const m = await team.addMember(caller.memberId, name, r ?? "member");
    return ok(`Added "${m.name}" as ${m.role}.`, { memberId: m.$id });
  }));

  server.registerTool("set_member_role", {
    description: "Make a member a lead (can create and edit tasks) or a member.",
    inputSchema: z.object({ member: memberArg, role }),
  }, async ({ member, role: r }, ctx) => run(ctx, async (caller) => {
    leadOnly(caller);
    const m = await team.setRole(caller.memberId, memberRef(await loadStore(), member).$id, r);
    return ok(`"${m.name}" is now a ${r}.`);
  }));

  server.registerTool("remove_member", {
    description: "Remove a member from the team. Their tokens stop working; their logs stay. Confirm with the user first.",
    inputSchema: z.object({ member: memberArg }),
    annotations: { destructiveHint: true },
  }, async ({ member }, ctx) => run(ctx, async (caller) => {
    leadOnly(caller);
    const m = await team.removeMember(caller.memberId, memberRef(await loadStore(), member).$id);
    return ok(`Removed "${m.name}".`);
  }));
}
```

- [ ] **Step 4: Register them in the route**

In `web/app/api/mcp/route.ts`, add the import and the call:

```ts
import { registerManageTools } from "@/lib/mcp/manage";
```

```ts
const mcp = createMcpHandler((server) => {
  registerWorkTools(server);
  registerManageTools(server);
}, { instructions: MCP_INSTRUCTIONS, serverInfo: { name: "commons", version: "0.1.0" } });
```

- [ ] **Step 5: Run everything to verify it passes**

Run: `TEAM_ID=mcp-smoke npm run mcp-smoke`
Expected: `mcp-smoke: all checks passed`.

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: all clean.

- [ ] **Step 6: Commit**

```bash
git add web/lib/mcp/manage.ts web/app/api/mcp/route.ts web/scripts/mcp-smoke.ts
git commit -m "feat(mcp): tools to list and manage tasks, routines, assignments, members and policy"
```

---

### Task 6: Teach the AI the management workflow, and update the docs

The server's `instructions` (sent when Claude connects) only describe doing work. Add how to set work up from a plain-language request, so a lead can say "every Monday audit our three client sites, Nino does it" and Claude knows which tools to call in which order.

**Files:**
- Modify: `web/lib/mcp/instructions.ts`
- Test: `web/lib/__tests__/instructions.test.ts`
- Modify: `TECH.md` §5, `DECISIONS.md`, `docs/superpowers/plans/2026-10-17-team-mode-features.md` (Current state and F5)

**Interfaces:**
- Produces: `MCP_INSTRUCTIONS` (same export, longer text). `SETUP_PROMPT` is unchanged.

- [ ] **Step 1: Write the failing test**

Append to `web/lib/__tests__/instructions.test.ts`:

```ts
it("explains how to set up work from a plain-language request", () => {
  for (const word of ["list_members", "create_task", "update_task", "repeatDays", "rows", "Confirm with the user"]) expect(MCP_INSTRUCTIONS).toContain(word);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run lib/__tests__/instructions.test.ts`
Expected: FAIL, `expected '…' to contain 'list_members'`.

- [ ] **Step 3: Write the new instructions**

Replace `MCP_INSTRUCTIONS` in `web/lib/mcp/instructions.ts`:

```ts
/** Sent by the MCP server as its `instructions` when Claude connects (F5), never pasted anywhere. */
export const MCP_INSTRUCTIONS = [
  "This server is a team's shared task queue.",
  "",
  "DOING WORK (any member):",
  "1. Call next_task. It claims the next free task (or one row of a task) for you and returns what to do. If it returns nothing, stop.",
  "2. (To pick a specific one instead: call list_work, then claim it. If claim says taken or done, choose another.)",
  "3. Do what the prompt says, for the item it names if there is one. Never work on something you have not claimed.",
  "4. On long work, call heartbeat at least every 30 minutes.",
  "5. Finish with complete (a short summary, and details: what you did, where the result is, anything a human should know), fail (reason), or skip (reason).",
  "6. Repeat from step 1 until next_task returns nothing.",
  "",
  "SETTING UP WORK (team leads; members can read everything):",
  "- When the user describes work in plain words, turn it into tasks. A task is a title and a prompt: free text saying what to do and where the result goes.",
  "- A routine is a task with repeatDays (7 = weekly). Rows are the things to do it for (clients, sites, files): the same prompt runs once per row, and each row is claimed separately.",
  "- Call list_members and list_tasks first. Assign people by name; no assignees means anyone may take it. Then create_task, or view_task and update_task to change one.",
  "- Confirm with the user before delete_task, remove_member, or removing rows.",
  "- get_policy / set_policy: rules placed before every prompt. add_member / set_member_role / remove_member manage the team. board and list_logs show who did what.",
].join("\n");
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS (all files).

- [ ] **Step 5: Update the docs**

- `TECH.md` §5: replace the route line with `Route: app/api/mcp/route.ts with mcp-handler 2.x (MCP SDK v2), stateless Streamable HTTP.` Below the tool table, add the management tools table from Task 5 of this plan with the sentence "Read tools for any member; write tools for leads only, same rules and audit as the web app (shared code in `lib/team.ts` and `lib/tasks.ts`)." In the §2 Stack table, change the MCP row versions to `mcp-handler` 2.3.0 + `@modelcontextprotocol/server` 2.3.1 (installed).
- `DECISIONS.md`: add a row at the end of the table:
  `| D26 | Manage through MCP | Leads can set up the team's work from Claude: create, edit and delete tasks and routines, assign members, manage members and the team policy, through the same MCP connector. Same role rules and audit as the web app; members get read tools and their own note. A routine is still just a task with repeatDays (D16). |`
- Feature plan, "Current state": add a bullet `- **MCP endpoint is live:** /api/mcp with worker and management tools (plan: docs/superpowers/plans/2026-10-17-mcp-server.md); TEAM_ID=mcp-smoke npm run mcp-smoke passes against a dev server.` In §F5's file list, replace `web/lib/mcp/tools.ts` with `web/lib/mcp/work.ts, web/lib/mcp/manage.ts, web/lib/mcp/reply.ts` and the route path with `web/app/api/mcp/route.ts`.

- [ ] **Step 6: Final check with a real Claude Code session**

1. On `/setup`, create a token "for my own Claude Code sessions" as a lead.
2. Run `claude mcp add --transport http commons http://localhost:3000/api/mcp --header "Authorization: Bearer <token>"` (dev server on the real `TEAM_ID`).
3. In Claude Code, say: *"Make a weekly routine to check the homepage of acme.ge and green.ge for broken links, assigned to me, and write the result into the log."* Claude should call `list_members`, then `create_task` with `repeatDays: 7` and two rows. The task should appear on `/tasks` and `/board`.
4. Say: *"Work through the queue."* Claude should call `next_task`, do the work, then `complete`. The log should appear on `/logs`.
5. Delete the test task with *"delete that routine"*. Claude should ask to confirm before calling `delete_task`.

- [ ] **Step 7: Commit**

```bash
git add web/lib/mcp/instructions.ts web/lib/__tests__/instructions.test.ts TECH.md DECISIONS.md docs/superpowers/plans/2026-10-17-team-mode-features.md
git commit -m "docs(mcp): server instructions for setting up work; record D26"
```

---

## Not in this plan (add when needed)

- **OAuth for claude.ai cloud connectors.** Header tokens work for Claude Code. Cloud routines depend on the request-headers beta (TECH §6, open question in the feature plan).
- **A "run again" tool for a done one-off.** Today a lead removes and re-adds the row with `update_task` (feature plan F4).
- **Hiding lead tools from members in `tools/list`.** Members see them and get "Only a team lead…". Hide them only if that confuses people.
- **MCP prompts or resources.** Tools plus `instructions` cover the flow.
