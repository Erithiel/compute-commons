# Team Mode: Feature Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Before starting a feature, write its detailed step plan from the feature's section below (superpowers:writing-plans), on its own branch.

**Goal:** Build team mode: a web app where a team writes **tasks** (a prompt for any repeatable job), and a remote MCP server from which a person's Claude Code or a scheduled Claude task fetches work, claims it without collisions, does it, and writes a **log** back (who, when, what, branch).

**Architecture:** One Next.js app in `web/` holds the pages, server actions and the MCP endpoint (`/api/mcp`). Appwrite 1.8 TablesDB on api.rando.ge stores everything. Claude's scheduled tasks are the scheduler; we run no background jobs.

**Tech Stack:** Next.js 16 + TypeScript, React 19, Appwrite TablesDB (`node-appwrite` 22.1.3, matching server 1.8.1), `mcp-handler` + `@modelcontextprotocol/server`, `zod`, Tailwind 4, `vitest`, Vercel.

**Spec:** `IDEA.md` (sections 2–8), `TECH.md` (all), `DECISIONS.md` (D6, D9–D16).

## The model in one paragraph

A **task** is a title, a description and a prompt. It is either **one-off** (done once) or **routine** (comes back every N days). A task can optionally have an **item list** (for example 10 websites): one prompt, and each line becomes its own unit of work with its own claim, so "add the SEO skill to every site" is one task and nobody does the same site twice. There are no separate targets, skills or routines (D16). Every attempt writes a **log**: who, when, outcome, summary, branch. A Claude scheduled task holds one line ("use the commons connector and work through our team's queue"); everything else comes from our server.

## Current state (2026-10-17)

A clickable **mock UI** exists in `web/` and is the starting point for every feature:
- Pages built: Board, Skills, Targets, Routines, Connect Claude (`/setup`), Settings, Login. Data comes from an in-memory store, `web/lib/mock.ts`, which resets on restart. Mock server actions are in `web/app/actions.ts`.
- **⚠ The mock UI still uses the old model** (skills × targets, routines). The first UI change is to rework it to this plan: one **Tasks** page (list + editor with mode, redo days, item list) replaces Skills, Targets and Routines; Board shows task items; a **Logs** list is added. Do this before F2 starts.
- **How a feature replaces the mock:** keep the page, swap its data calls and actions for Appwrite, move its actions into the feature's own `actions.ts`, and delete its slice of `mock.ts`. When `mock.ts` is empty, delete it and the "mock data" badge in the sidebar.
- **Pages use route groups:** `web/app/(app)/<page>` for signed-in pages, sharing the sidebar layout and auth guard, and `web/app/(auth)/login`.
- **Appwrite is connected:** project `hakatoni` (`6ad3926b000731cc9576`) on api.rando.ge. The sidebar pings it on every load. `node-appwrite` is pinned to **22.1.3**, the last SDK built for API 1.8.1; its `ping()` returns `{ message: "Pong!" }`, not a string. An API key is still needed in `web/.env.local`.
- **Next.js 16 quirk:** this scaffold enables `cacheComponents`. Request-time data must sit under a `<Suspense>`: `(app)/layout.tsx` wraps the shell and `(app)/loading.tsx` wraps pages. Read data through an async function that calls `await connection()` (see `db()` in `mock.ts`). A dev-only "Insight" badge about instant navigation is expected and harmless.
- **Styling:** plain Tailwind with tokens in `globals.css` and primitives in `web/components/ui.tsx`. shadcn is deferred until a component needs it.

## Global Constraints

- Team mode only. Clan mode is parked; do not build trust ladders or security-checker roles.
- Tasks are not only about code. Our system never assumes git, branches, PRs or files: where and how a result is delivered is written in the task prompt or the team policy, and Claude reports it back as free text in the log. (A code task's prompt can say "commit on a new branch, never main".)
- The browser never talks to Appwrite directly in v1. All data access is server-side with the API key, after a role check.
- Roles: `lead` and `member` only (permission table in `IDEA.md` §7).
- Task prompt edits create a new immutable version. Unattended (schedule) runs only take tasks with an approved version, and run that version.
- Prompt order is always: team policy, then task prompt.
- Tasks are generic: any repeatable job. No hard-coded kinds of work (websites, repos, PRs…); those are just words in a prompt or lines in an item list.
- No scheduler, cron or background worker in our code. Lease expiry is checked when a claim is read.
- No double work: Claude works on an item only after a successful `claim`. The claim is atomic (F4), `list_work` never offers claimed items, and a second claim returns "taken".
- The Claude schedule holds only a one-line setup prompt. How to work (MCP server `instructions`) and the task itself (`get_task`) always come from our server, so changes never need a re-paste.
- No tokens in URLs. MCP auth uses a header (`Authorization: Bearer <token>`).
- Store only hashes of API tokens.
- Every change to tasks, the team policy, settings, members and tokens writes an audit entry.
- Secrets live in environment variables, never in the repo.

---

## 1. Feature map and order

```
F0 Foundation (setup, schema, shared contracts)  ← owner: you
 ├─► F1 Auth & members ─────────────────┐
 ├─► F2 Tasks (editor, versions, items) ┤
 ├─► F3 Prompt builder + team policy ───┤ (pure)
 ├─► F4 Claim engine + work queue ──────┤ (pure + DB)
 │                                      ▼
 │                ┌─────────────────────┴───────┐
 │                ▼                             ▼
 │      F5 MCP endpoint + Connect Claude   F6 Board + logs
 │                └─────────────┬───────────────┘
 │                              ▼
 └──────────────────────► F7 Demo: one real schedule end to end
```

| ID | Feature | Depends on | Can start after | Size |
|---|---|---|---|---|
| F0 | Foundation: app, UI shell, Appwrite schema, shared types, CI, deploy | – | now | M |
| F1 | Auth & members (login, session, role guard, members page) | F0 | F0 | M |
| F2 | Tasks (list, editor, one-off/routine, item list, versions, approve, suggest) | F0 (+F1 guard, can stub) | F0 | M |
| F3 | Prompt builder (team policy + task prompt, fill `{{item}}`) + team policy & budget settings | F0 types | F0 | S |
| F4 | Claim engine + work queue (claim, heartbeat, finish, skip, eligibility, ordering) | F0 types + schema | F0 | M |
| F5 | MCP endpoint + tokens + Connect Claude page (8 tools, server instructions, one-line setup prompt) | F1, F2, F3, F4 | F2+F4 | M |
| F6 | Board + logs (who is on what, free, done, failed, log history, add a quick one-off task) | F2, F4 | F2+F4 | S |
| F7 | Demo: a real Claude schedule runs a real task over 3–5 items | all | F5+F6 | S |

**Parallel tracks (example for 3–4 people):**
- **Track A (you):** F0, then F1.
- **Track B (logic):** F3 and F4 right after F0. Pure functions with tests; little UI.
- **Track C (UI):** rework the mock UI to the Task model, then F2, using the stub role guard until F1 lands.
- **Then:** F5 and F6 in parallel, then F7 together.

## 2. Working agreement

- **Branches:** `feat/f0-foundation`, `feat/f1-auth`, `feat/f2-tasks`, … One feature per branch, PR into `main`.
- **Folder ownership** (avoids merge conflicts): each feature owns the folders listed under its **Files**. Shared files (`web/lib/types.ts`, `web/lib/appwrite.ts`, `web/scripts/setup-appwrite.ts`) are owned by F0; later changes to them go in a small separate PR announced to the team.
- **Definition of done:** typecheck, lint and `vitest` pass in CI; the feature's acceptance checks below pass on a preview deploy; audit entries are written where required; PR reviewed by one other person.
- **Commits:** small, imperative ("feat(tasks): approve a version").

---

## 3. Shared contracts (created in F0, used by everyone)

Everyone codes against these names. If one must change, change it in one PR and tell the team.

### 3.1 Types — `web/lib/types.ts`

```ts
export type Role = "lead" | "member";
export type TaskMode = "once" | "routine";
export type ItemStatus = "available" | "done" | "failed" | "skipped";
export type Outcome = "done" | "failed" | "skipped";

export type Caller =
  | { kind: "member"; memberId: string; role: Role }
  | { kind: "team" }; // a Claude schedule's token: takes approved tasks only

export interface Member { $id: string; teamId: string; userId: string; name: string; role: Role }
export interface Task {
  $id: string; teamId: string; title: string; description: string;
  mode: TaskMode; redoDays: number;      // routine: comes back after redoDays; once: 0
  items: string[];                       // optional list; [] = the task is a single item
  priority: number;
  currentVersion: number; approvedVersion: number | null;
}
export interface TaskVersion {
  $id: string; taskId: string; version: number; prompt: string; // markdown, may use {{item}}
  authorId: string; createdAt: string;
}
export interface TaskItem {              // the unit of work and of claiming
  $id: string; teamId: string; taskId: string; item: string; // "" when the task has no list
  status: ItemStatus; lastDoneAt: string | null; lastLogId: string | null;
}
export interface Claim { $id: string /* = taskItemId */; by: string /* memberId or "team" */; claimedAt: string; leaseUntil: string }
export interface Log {
  $id: string; taskItemId: string; taskId: string; by: string; outcome: Outcome; summary: string;
  details: string | null;                // free text from Claude: what it did, where the result is (link, file, branch…), notes
  version: number; startedAt: string; finishedAt: string;
}
export interface Settings { $id: string; teamId: string; policy: string; maxItemsPerRun: number; maxMinutesPerRun: number }
export interface ApiToken { $id: string; owner: string /* memberId or "team" */; name: string; tokenHash: string; lastUsedAt: string | null; revoked: boolean }
export interface AuditEntry { $id: string; teamId: string; actor: string; action: string; entity: string; before: string | null; after: string | null; at: string }
```

Notes: `teamId` is a constant from env in v1 (`TEAM_ID`). The only blank in v1 is `{{item}}`; a task without an item list should not use it.

### 3.2 Module signatures

| Module | Owner | Exports |
|---|---|---|
| `web/lib/appwrite.ts` | F0 | `adminTables(): TablesDB`, `adminUsers(): Users`, `sessionAccount(): Promise<Account \| null>`, `ping(): Promise<boolean>`, `DB_ID`, `T` (table ids: `T.members`, `T.tasks`, `T.taskVersions`, `T.taskItems`, `T.claims`, `T.logs`, `T.settings`, `T.apiTokens`, `T.audit`), `TEAM_ID` |
| `web/lib/audit.ts` | F0 | `audit(actor: string, action: string, entity: string, before?: unknown, after?: unknown): Promise<void>` |
| `web/lib/auth.ts` | F1 (stub in F0) | `getMember(): Promise<Member \| null>`, `requireMember(): Promise<Member>`, `requireLead(): Promise<Member>` (throw `Forbidden`) |
| `web/lib/tasks.ts` | F2 | `nextVersion(current: number): number`, `parseItems(text: string): string[]`, `ensureItems(taskId: string, items: string[]): Promise<number>` (rows created) |
| `web/lib/prompt.ts` | F3 | `fillBlanks(template: string, values: Record<string,string>): { text: string; missing: string[] }`, `buildPrompt(p: { teamPolicy: string; taskPrompt: string; values: Record<string,string> }): { text: string; missing: string[] }` |
| `web/lib/claims.ts` | F4 | `isEligible(item: TaskItem, claim: Claim \| null, now: Date, redoDays: number): boolean`, `claim(itemId: string, by: string, leaseMinutes?: number): Promise<{ ok: true; leaseUntil: string } \| { ok: false; reason: "taken" \| "not-found" }>`, `heartbeat(itemId: string, by: string, leaseMinutes?: number): Promise<{ ok: boolean; leaseUntil?: string }>`, `finish(itemId: string, by: string, outcome: "done" \| "failed", data: { summary: string; details?: string; version: number }): Promise<Log>` (startedAt = the claim's `claimedAt`), `recordSkip(itemId: string, by: string, reason: string, version: number): Promise<Log>` |
| `web/lib/work.ts` | F4 | `sortWork(rows)`, `listEligible(opts: { approvedOnly: boolean; limit?: number }): Promise<Array<{ item: TaskItem; task: Task; lastLog: Log \| null }>>` |
| `web/lib/tokens.ts` | F5 | `createToken(owner: string /* memberId or "team" */, name: string): Promise<{ token: string; row: ApiToken }>`, `verifyBearer(header: string \| null): Promise<Caller \| null>`, `revokeToken(id: string): Promise<void>` |

---

## 4. Features

### F0 — Foundation (owner: you)

**Goal:** a deployed app everyone can branch from, with the database created and the shared contracts in place.

**Files (✓ = exists in the mock UI):**
- ✓ `web/` (Next.js 16.4.2 app), `app/layout.tsx`, `app/page.tsx` (redirects to `/board`)
- ✓ `web/app/(app)/layout.tsx` (sidebar shell + auth guard + Appwrite ping), `web/app/(app)/loading.tsx`
- ✓ `web/components/ui.tsx` (Badge, Card, PageHeader, button/input classes), `web/components/client.tsx` (Nav, CopyButton, TokenForm)
- ✓ `web/lib/appwrite.ts`, `web/lib/auth.ts` (stub), `web/lib/mock.ts` (temporary), `web/.env.example`
- Update: `web/lib/types.ts` to §3.1 (today it still has the old skills/targets types), `T` in `web/lib/appwrite.ts` to the new table ids
- Create: `web/lib/audit.ts` (today `logAudit` in `mock.ts`)
- Create: `web/scripts/setup-appwrite.ts` (idempotent: creates database `commons` and all tables, columns, indexes)
- Create: `.github/workflows/ci.yml`, `web/vitest.config.ts`, `web/lib/__tests__/smoke.test.ts`

- [x] **Step 1: Create the app.** Done with `create-next-app@16.4.2` (Tailwind 4, ESLint, `@/*` alias). shadcn deferred (see Current state).
- [ ] **Step 2: Appwrite project.** Project `hakatoni` (`6ad3926b000731cc9576`) exists on api.rando.ge. Still to do: create an API key with Databases (read/write) and Users (read) scopes, and enable Email/Password auth. Put values in `web/.env.local` (copy `.env.example`):

```
APPWRITE_ENDPOINT=https://api.rando.ge/v1
APPWRITE_PROJECT_ID=6ad3926b000731cc9576
APPWRITE_API_KEY=
APPWRITE_DATABASE_ID=commons
TEAM_ID=rando
SESSION_COOKIE_NAME=commons_session
```

- [x] **Step 3: Pin `node-appwrite`.** Pinned exactly to `22.1.3` (README at that tag: "API version 1.8.1, compatible with server 1.8.x"; 23.x targets 1.9). Recorded in `TECH.md` §2.
- [ ] **Step 4: `lib/types.ts`** exactly as §3.1 (rework together with the mock UI).
- [x] **Step 5: `lib/appwrite.ts`** with the exports in §3.2 plus `ping()`. `sessionAccount()` reads the session cookie and returns `null` when absent. Admin calls throw a clear error until `APPWRITE_API_KEY` is set. (Update `T` to the new table ids.)
- [ ] **Step 6: `scripts/setup-appwrite.ts`** creates the tables from `TECH.md` §3 with columns matching §3.1 (strings, integers, booleans, string arrays, datetimes). Indexes: `taskItems(taskId, item)` unique, `taskItems(status)`, `logs(taskItemId)`, `logs(taskId)`, `apiTokens(tokenHash)` unique, `audit(at)`. Seeds one `settings` row with the default policy and a budget of 5 items / 90 minutes. Running it twice must not fail. Add `"setup:appwrite": "tsx scripts/setup-appwrite.ts"` to `package.json` scripts (`npm i -D tsx`).
- [ ] **Step 7: `lib/audit.ts`** writes one row to `T.audit` with JSON-stringified `before`/`after` (same signature as `logAudit` in `mock.ts`).
- [x] **Step 8: `lib/auth.ts` stub:** `getMember()` reads the `mock_member` cookie set by the mock login page and the sidebar "Signed in as" switcher. F1 replaces it and removes the switcher.
- [x] **Step 9: App shell** with nav and every page built on mock data. Nav after the rework: Board, Tasks, Logs, Connect Claude, Settings.
- [ ] **Step 10: CI** runs `npm ci`, `npm run lint`, `npx tsc --noEmit`, `npx vitest run` in `web/`.
- [ ] **Step 11: Deploy** to Vercel (root directory `web`, region close to the Appwrite server, env vars set). Confirm the preview URL loads.
- [ ] **Step 12: Commit and open PR** `feat/f0-foundation`.

**Acceptance:** preview URL shows the shell with "Appwrite: connected"; `npm run setup:appwrite` creates all tables on a fresh project and is a no-op the second time; CI is green.

### F1 — Auth & members

**Depends on:** F0.
**Files:** `web/app/(auth)/login/page.tsx`, `web/app/(auth)/login/actions.ts`, `web/lib/auth.ts` (replace stub), `web/proxy.ts` (Next.js 16 renamed `middleware.ts` to `proxy.ts`; check the bundled docs in `node_modules/next/dist/docs`), `web/app/(app)/settings/members/*`.

- Login with email + password via a server action: `account.createEmailPasswordSession` with the admin client, store the session secret in an httpOnly, secure, sameSite=lax cookie (`SESSION_COOKIE_NAME`). Logout deletes the session and cookie.
- `proxy.ts` redirects to `/login` when the cookie is missing (except `/login` and `/api/mcp`).
- `getMember()` resolves the Appwrite user from the session, then the `members` row for `TEAM_ID`. A user without a members row sees "Ask your lead to add you".
- Members page (lead only): invite by email (creates the Appwrite user with a temporary password shown once, or an Appwrite invite), change role, remove. Each change calls `audit()`.
- First user bootstrap: `setup-appwrite.ts --first-lead you@example.com` creates the first lead.
- Remove the mock "Signed in as" switcher.

**Acceptance:** a member cannot open `/settings/members` (403 page); a lead can add a member who can then log in; role change appears in the audit table.

### F2 — Tasks

**Depends on:** F0 (uses `requireLead`, stubbed until F1).
**Files:** `web/app/(app)/tasks/page.tsx`, `web/app/(app)/tasks/[id]/page.tsx`, `web/app/(app)/tasks/actions.ts`, `web/lib/tasks.ts`, `web/lib/__tests__/tasks.test.ts`.

- **List:** title, one-off/routine (with "every N days"), number of items and how many are done, current and approved version.
- **Editor (lead):** title, description, prompt (textarea, markdown), mode (one-off / routine + redo after N days), item list (textarea, one per line, optional), priority. No code-specific fields (D17): tools needed, risk, and where to deliver the result all go in the prompt.
- **Save** = a new `task_versions` row with `version = currentVersion + 1`, update the task, and `ensureItems` for the item list (a task with no list gets one item `""`). Versions are never edited. Removing a line from the list does not delete its item or its logs (it stops being offered; see §6).
- **Approve (lead):** sets `approvedVersion`. Version history shows each version with a plain line diff against the previous one. Schedules only take approved tasks.
- **Preview:** pick one item and see the full prompt Claude will get (`buildPrompt` from F3: team policy + task prompt with `{{item}}` filled).
- **Members** can read everything and leave a "suggest change" note (stored in audit as `task.suggest`); no editing.
- `lib/tasks.ts` exports `nextVersion` and `parseItems` (trim, drop blank lines, drop duplicates, keep order). Test:

```ts
import { describe, it, expect } from "vitest";
import { nextVersion, parseItems } from "../tasks";

describe("tasks", () => {
  it("increments versions from 0", () => {
    expect(nextVersion(0)).toBe(1);
    expect(nextVersion(4)).toBe(5);
  });
  it("parses an item list: trims, skips blanks and duplicates", () => {
    expect(parseItems(" https://a.ge \n\nhttps://b.ge\nhttps://a.ge")).toEqual(["https://a.ge", "https://b.ge"]);
  });
});
```

**Acceptance:** editing a task creates version N+1 and leaves N unchanged; saving a task with 5 items twice creates 5 task items; only a lead can approve; audit rows exist for create, edit, approve.

### F3 — Prompt builder + team policy

**Depends on:** F0 types.
**Files:** `web/lib/prompt.ts`, `web/lib/__tests__/prompt.test.ts`, `web/app/(app)/settings/policy/page.tsx`, `web/app/(app)/settings/policy/actions.ts`.

- `fillBlanks` replaces `{{ name }}` (spaces allowed) with values; unknown blanks stay as-is and are listed in `missing`.
- `buildPrompt` joins the non-empty team policy and task prompt with a separator line, then fills blanks once over the whole text. Values in v1: `{ item }`.
- Settings page (lead): edit the team policy (rules placed before every task prompt, e.g. how to deliver results, what never to touch; for code teams this is where the branching strategy goes, D15) and the per-run budget (`maxItemsPerRun`, `maxMinutesPerRun`) that `list_work` returns to schedules. Default policy:

```
Rules for every task:
- Use no secrets and do not touch anything the task does not ask for.
- If the task is unclear or needs a human decision, stop and call fail with the reason.
- Finish by calling complete with a short summary and details (what you did, where the result is, anything a human should know).
```

Test:

```ts
import { describe, it, expect } from "vitest";
import { fillBlanks, buildPrompt } from "../prompt";

describe("prompt", () => {
  it("fills known blanks and reports missing ones", () => {
    expect(fillBlanks("Audit {{ item }} for {{goal}}", { item: "https://a.ge" }))
      .toEqual({ text: "Audit https://a.ge for {{goal}}", missing: ["goal"] });
  });
  it("puts the policy first and skips an empty policy", () => {
    expect(buildPrompt({ teamPolicy: "P", taskPrompt: "S {{item}}", values: { item: "1" } }).text).toBe("P\n\n---\n\nS 1");
    expect(buildPrompt({ teamPolicy: "", taskPrompt: "S", values: {} }).text).toBe("S");
  });
});
```

**Acceptance:** tests pass; the settings page saves policy and budget and audits the change.

### F4 — Claim engine + work queue

**Depends on:** F0 types and schema.
**Files:** `web/lib/claims.ts`, `web/lib/work.ts`, `web/lib/__tests__/claims.test.ts`, `web/lib/__tests__/work.test.ts`, `web/scripts/race-test.ts`.

This is what prevents double work.

- `isEligible` is pure:
  - an active claim (`leaseUntil` later than now) → not eligible;
  - status `done` with `redoDays = 0` (one-off) → not eligible (done once, until a lead resets it);
  - status `done` with `redoDays > 0` (routine) → eligible only when `lastDoneAt` is older than `redoDays`;
  - status `available`, `failed` or `skipped` → eligible.
- `claim`: `createRow(T.claims, itemId, {...})`. On HTTP 409, read the claim; if expired, delete and create **in one Appwrite transaction**; otherwise return `{ ok: false, reason: "taken" }`. Default lease 120 minutes.
- `heartbeat`: only the current holder (`by`) can extend.
- `finish`: in one transaction, create the `logs` row (startedAt = claim's `claimedAt`), update the task item (`status`, and `lastDoneAt` when done), delete the claim. Only the holder can finish.
- `recordSkip`: creates a `skipped` log and sets the item status to `skipped`. No claim needed; an active claim by someone else makes it fail with "taken".
- `listEligible` loads task items (only tasks with an approved version when `approvedOnly`), their claims, filters with `isEligible` using the task's `redoDays`, orders with `sortWork` (task priority desc, then `lastDoneAt` asc, never-done first) and returns at most `limit` (default 10) with the task and last log.
- `scripts/race-test.ts`: fires 10 concurrent `claim()` calls on one item against the real server and asserts exactly one `ok: true`; then sets an expired lease and fires 5 concurrent takeovers and asserts exactly one wins. Run manually: `npx tsx scripts/race-test.ts`.

Tests for the pure parts:

```ts
import { describe, it, expect } from "vitest";
import { isEligible } from "../claims";
import type { TaskItem, Claim } from "../types";

const item = (o: Partial<TaskItem> = {}): TaskItem => ({
  $id: "i1", teamId: "t", taskId: "k1", item: "https://a.ge", status: "available",
  lastDoneAt: null, lastLogId: null, ...o,
});
const now = new Date("2026-10-20T12:00:00Z");

describe("isEligible", () => {
  it("free item is eligible", () => expect(isEligible(item(), null, now, 0)).toBe(true));
  it("active claim blocks", () => {
    const c: Claim = { $id: "i1", by: "m1", claimedAt: "2026-10-20T11:00:00Z", leaseUntil: "2026-10-20T13:00:00Z" };
    expect(isEligible(item(), c, now, 0)).toBe(false);
  });
  it("expired claim does not block", () => {
    const c: Claim = { $id: "i1", by: "m1", claimedAt: "2026-10-20T08:00:00Z", leaseUntil: "2026-10-20T10:00:00Z" };
    expect(isEligible(item(), c, now, 0)).toBe(true);
  });
  it("one-off is done once", () => {
    expect(isEligible(item({ status: "done", lastDoneAt: "2026-01-01T00:00:00Z" }), null, now, 0)).toBe(false);
  });
  it("failed items can be retried", () => expect(isEligible(item({ status: "failed" }), null, now, 0)).toBe(true));
  it("routine comes back after redoDays", () => {
    expect(isEligible(item({ status: "done", lastDoneAt: "2026-10-18T12:00:00Z" }), null, now, 7)).toBe(false);
    expect(isEligible(item({ status: "done", lastDoneAt: "2026-10-01T12:00:00Z" }), null, now, 7)).toBe(true);
  });
});
```

```ts
import { it, expect } from "vitest";
import { sortWork } from "../work";

it("sorts by task priority then oldest done, never-done first", () => {
  const rows = [
    { task: { priority: 0 }, item: { $id: "a", lastDoneAt: "2026-10-10T00:00:00Z" } },
    { task: { priority: 0 }, item: { $id: "b", lastDoneAt: null } },
    { task: { priority: 5 }, item: { $id: "c", lastDoneAt: "2026-10-15T00:00:00Z" } },
  ] as any;
  expect(sortWork(rows).map((r: any) => r.item.$id)).toEqual(["c", "b", "a"]);
});
```

**Acceptance:** unit tests pass; the race test shows exactly one winner in both scenarios on our 1.8.1 server. If the transaction does not prevent a double takeover, stop and tell the team (fallback: a version column checked on update).

### F5 — MCP endpoint + tokens + Connect Claude

**Depends on:** F1, F2, F3, F4.
**Files:** `web/app/api/[transport]/route.ts`, `web/lib/tokens.ts`, `web/lib/mcp/tools.ts`, `web/lib/mcp/instructions.ts`, `web/lib/__tests__/tokens.test.ts`, `web/lib/__tests__/instructions.test.ts`, `web/app/(app)/setup/page.tsx`, `web/app/(app)/settings/tokens/*`.

- **Connect Claude page (`/setup`)**, the one-time setup, in four steps:
  1. Create a token (shown once). Owner: yourself (your own Claude Code) or the team (`team`, lead only, for Claude schedules).
  2. Guide to add the `commons` connector in Claude: the URL `https://<app>/api/mcp` and the `Authorization: Bearer <token>` request header. For Claude Code on a laptop, show `claude mcp add --transport http commons https://<app>/api/mcp --header "Authorization: Bearer <token>"`.
  3. "Copy prompt" for the Claude scheduled task: the one line `SETUP_PROMPT`.
  4. "Check it works": run the schedule once by hand and watch the board.
- Tokens page (`/settings/tokens`): list and revoke.
- `tokens.ts`: tokens are 32 random bytes, base64url, prefixed `cc_`. Store `sha256` hex. `verifyBearer` returns a `Caller` or `null`, updates `lastUsedAt`.
- `mcp/instructions.ts` exports `MCP_INSTRUCTIONS` (the workflow, sent as the MCP server's `instructions` in the initialize response) and `SETUP_PROMPT` (the one line pasted into Claude). The workflow lives only here, never in the pasted prompt:

```ts
export const MCP_INSTRUCTIONS = [
  "This server hands out team tasks. To work on them:",
  "1. Call list_work. It returns the items you may take and this run's budget.",
  "2. Take items in the order given. Call claim; if it is taken, move to the next one.",
  "3. Call get_task for the claimed item and follow the instructions it returns exactly.",
  "4. On long items, call heartbeat at least every 30 minutes.",
  "5. Finish each item with complete (a short summary, and details: what you did, where the result is, anything a human should know), fail (reason), or skip (reason).",
  "6. Stop when list_work is empty or the budget is used up.",
].join("\n");

export const SETUP_PROMPT = `Use the "commons" MCP connector and work through our team's task queue.`;
```

```ts
import { it, expect } from "vitest";
import { SETUP_PROMPT, MCP_INSTRUCTIONS } from "../mcp/instructions";

it("keeps the pasted prompt to one line and the workflow on the server", () => {
  expect(SETUP_PROMPT.split("\n")).toHaveLength(1);
  expect(MCP_INSTRUCTIONS).toContain("claim");
});
```

- Route: `mcp-handler` with stateless Streamable HTTP and `instructions: MCP_INSTRUCTIONS`. Every request without a valid token gets `401`. Tools (inputs with zod):

| Tool | Input | Returns |
|---|---|---|
| `list_work` | `{ limit?: number }` | eligible items: item id, task title, item text, last log, suggested order; plus `budget: { maxItems, maxMinutes }` from settings |
| `get_task` | `{ itemId: string }` | merged prompt via `buildPrompt` (approved version for `team` callers, current for members), `missing`, version |
| `claim` | `{ itemId: string }` | `{ ok, leaseUntil }` or `{ ok: false, reason }` |
| `heartbeat` | `{ itemId: string }` | `{ ok, leaseUntil }` |
| `complete` | `{ itemId: string, summary: string, details?: string }` | log id (via `finish(..., "done", ...)`) |
| `fail` | `{ itemId: string, reason: string, details?: string }` | log id (via `finish(..., "failed", ...)`) |
| `skip` | `{ itemId: string, reason: string }` | log id (via `recordSkip`, claim not required) |
| `board` | `{}` | counts and current claims |

- `team` callers (schedules) only see tasks with an approved version (`listEligible({ approvedOnly: true })`). Members also see unapproved tasks, running the current version.
- Budget: the AI stops itself using the `budget` from `list_work`. Optional hard stop (see §6): `claim` refuses once a caller has claimed `maxItems` items within the last `maxMinutes`.
- Test `tokens.ts` hashing and prefix:

```ts
import { it, expect } from "vitest";
import { hashToken, newTokenString } from "../tokens";

it("creates prefixed tokens and stable hashes", () => {
  const t = newTokenString();
  expect(t.startsWith("cc_")).toBe(true);
  expect(hashToken(t)).toBe(hashToken(t));
  expect(hashToken(t)).not.toBe(t);
});
```

**Acceptance:** with MCP Inspector and with `claude mcp add` from a laptop: no token → 401; the initialize response carries `MCP_INSTRUCTIONS`; a member token can list, claim, complete; a second claim on the same item returns "taken"; logs show on the board; following `/setup` alone is enough to connect a Claude scheduled task.

### F6 — Board + logs

**Depends on:** F2, F4.
**Files:** `web/app/(app)/board/page.tsx`, `web/app/(app)/board/components/*`, `web/app/(app)/logs/page.tsx`.

- **Board:** grouped by task. Each row is one item: item text (or "Whole task" when there is no list), status badge (free / in progress by X until HH:MM / done on date / failed / skipped), the last log's summary. Filters: task, status. Refresh button (realtime is a later feature).
- **Quick add (lead):** a one-line "Add task" bar (title + prompt) for a one-off job without opening the editor.
- **Lead actions:** release a stuck claim (deletes the claim, audited), reset an item to available.
- **Logs page (who executed what):** a table, newest first: finished at, executed by (person or Claude schedule), task + item + summary, result, duration (finished − started). Clicking a row expands `details` (what Claude did, where the result is, notes), start/finish times and the prompt version. Filter by task, person and result. The task page (F2) shows the same list for one task.
- Remove the mock-only Claim / Complete / Fail / Skip buttons once F5 lands; real claims come from Claude through MCP.

**Acceptance:** a claim made through MCP shows within one refresh; releasing it frees the item; a completed item's log appears on the Logs page with its details.

### F7 — Demo: one real schedule end to end

**Depends on:** all.

- [ ] Write a real task (for example a client brief for each lead, or the Rando SEO skill on every site) with an item list of 3–5 entries, and approve it. Check that what the prompt needs exists where a Claude schedule runs.
- [ ] Follow `/setup`: team token, connector (request headers if available, see `TECH.md` §6; otherwise the agreed fallback), and the one-line prompt in a Claude scheduled task.
- [ ] Trigger a run, watch the board, read the results in Logs.
- [ ] Run a teammate's own Claude Code session at the same time to show no double work.
- [ ] Record the demo and note anything that broke as issues.

**Acceptance:** at least 3 items done by the schedule with their results in the logs, and one collision prevented on camera.

---

## 5. Later (not in this plan)

GitHub sign-in (Appwrite OAuth) · OAuth for the MCP endpoint (Better Auth MCP plugin or Clerk) if request headers are unavailable · CodeMirror prompt editor · realtime board · more blanks than `{{item}}` · restricting a schedule to some tasks (tags) · spare-limit planner · multiple teams · shared task library between teams · clan mode (`POSITIONING.md`, `security/SECURITY.md`).

## 6. Open questions that affect features

| Question | Affects | Default until decided |
|---|---|---|
| Does our claude.ai organization have connector request headers? | F5, F7 | Build header auth; decide the fallback before F7. |
| Should a schedule take every approved task, or only some (e.g. only routine tasks, or a tag)? | F4, F5 | Every approved task. Add a tag filter later if two schedules need different work. |
| Who may write tasks: lead only or members too? | F2 | Lead edits, members suggest. |
| Where do results go? | F5 `complete` | Wherever the task prompt says; Claude reports a summary + free-text details (links included) in the log. |
| For code tasks: which branching strategy? | F3 settings | Free text in the team policy or the task prompt (D15). No field. |
| How long is a lease? | F4 | 120 minutes; `MCP_INSTRUCTIONS` tell Claude to heartbeat every 30. |
| What happens to an item removed from a task's list? | F2 | Kept with its logs but no longer offered (mark it `skipped` with reason "removed from list"). |
| Exact steps to add a custom connector with request headers in Claude (menu path, where headers go). | F5 `/setup` guide, F7 | Guide says "Settings → Connectors"; verify against Claude's docs and our organization before F7. |
| Should the server enforce the budget, or trust the AI to stop? | F5 `claim` | AI stops using `list_work.budget`; add the hard stop in `claim` if a run ever overspends. |
