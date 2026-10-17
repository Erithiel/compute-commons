# Team Mode: Feature Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Before starting a feature, write its detailed step plan from the feature's section below (superpowers:writing-plans), on its own branch.

**Goal:** Build team mode: a web app where a team writes **tasks** (a title and a prompt that can ask for anything, optionally with rows), and a remote MCP server from which a person's Claude Code or their Claude schedule fetches work, claims it so nobody else does it, does it, and writes a **log** back.

**Architecture:** One Next.js app in `web/` holds the pages, server actions and the MCP endpoint (`/api/mcp`). Appwrite 1.8 TablesDB on api.rando.ge stores everything. Claude's scheduled tasks are the scheduler; we run no background jobs.

**Tech Stack:** Next.js 16 + TypeScript, React 19, Appwrite TablesDB (`node-appwrite` 22.1.3, matching server 1.8.1), `mcp-handler` + `@modelcontextprotocol/server`, `zod`, Tailwind 4, `vitest`, Vercel.

**Spec:** `IDEA.md` (sections 2–8), `TECH.md` (all), `DECISIONS.md` (D6, D9–D23).

## The model in one paragraph

A **task** is a **title and a prompt**. The prompt can ask for anything; our app only stores it, hands it out and tracks who did it (D22). A task can optionally have **rows** (a table you can grow: clients, sites, files…): the same prompt is done once per row, and each row is claimed separately so several people or runs can share the task without doing the same row twice (D23). A task without rows is one piece of work. Each member can add **their own note** to a task (e.g. where their files are); only their Claude receives it (D24). A task runs **once** or **repeats every N days**, and can be **assigned** to members (none = anyone). **Only Claude claims and finishes work, through MCP**; the web app shows who is on what, read-only. Every attempt writes a **log**: who (always a person, tagged "scheduled" for unattended runs), when, which row, outcome, summary and free-text details. A Claude scheduled task holds one line ("use the commons connector and work through our team's task queue"); everything else comes from our server.

## Current state (2026-10-17)

A clickable **mock UI** exists in `web/` and already follows this plan:
- Pages: Board (read-only), Tasks (list + editor with a rows table), Logs, Connect Claude (`/setup`), Settings, Login. Data comes from an in-memory store, `web/lib/mock.ts`, which resets on restart. Mock server actions are in `web/app/actions.ts`. `web/lib/types.ts` matches §3.1.
- **Backend is live (2026-10-17):** `npm run setup:appwrite` created the schema; `lib/tasks.ts`, `lib/claims.ts`, `lib/tokens.ts`, `lib/prompt.ts`, `lib/audit.ts` are implemented with tests; `app/actions.ts` writes to Appwrite; `lib/mock.ts` no longer holds data, it loads a per-request snapshot from Appwrite and keeps the page helpers (rename to `lib/data.ts` once the UI rework settles). Login is still the mock member picker (F1). `TEAM_ID=race-test npm run race-test` passes on 1.8.1.
- **How a feature replaces the mock:** keep the page, swap its data calls and actions for Appwrite, move its actions into the feature's own `actions.ts`, and delete its slice of `mock.ts`. When `mock.ts` is empty, delete it and the "mock data" badge in the sidebar.
- **Pages use route groups:** `web/app/(app)/<page>` for signed-in pages, sharing the sidebar layout and auth guard, and `web/app/(auth)/login`.
- **Appwrite is connected:** project `hakatoni` (`6ad3926b000731cc9576`) on api.rando.ge. The sidebar pings it on every load. `node-appwrite` is pinned to **22.1.3**, the last SDK built for API 1.8.1; its `ping()` returns `{ message: "Pong!" }`, not a string. An API key is still needed in `web/.env.local`.
- **Next.js 16 quirk:** this scaffold enables `cacheComponents`. Request-time data must sit under a `<Suspense>`: `(app)/layout.tsx` wraps the shell and `(app)/loading.tsx` wraps pages. Read data through an async function that calls `await connection()` (see `db()` in `mock.ts`). A dev-only "Insight" badge about instant navigation is expected and harmless.
- **Browsers send textarea line breaks as `\r\n`:** normalise to `\n` before comparing prompts, or every save looks like a new version.
- **Styling:** plain Tailwind with tokens in `globals.css` and primitives in `web/components/ui.tsx`. shadcn is deferred until a component needs it.

## Global Constraints

- Team mode only. Clan mode is parked; do not build trust ladders or security-checker roles.
- **A task is free text.** No fields for kinds of work, targets, tools, risk, branches, PRs or files, and no template syntax in prompts. Where and how a result is delivered is written in the prompt or the team policy, and Claude reports it back as free text in the log.
- The browser never talks to Appwrite directly in v1. All data access is server-side with the API key, after a role check.
- Roles: `lead` and `member` only (permission table in `IDEA.md` §7). Only leads create and edit tasks.
- Prompt edits create a new immutable version (history). Every run uses the latest version; no approval step (D20). Logs record which version ran.
- What Claude receives is always: team policy, then the task prompt, then the caller's own note on the task (if any), then `Item: <row>` when the claimed work is a row.
- No scheduler, cron or background worker in our code. Lease expiry and "repeat after N days" are checked when work is read.
- **No double work:** Claude works on something only after a successful `claim`. The server decides (atomic lock + eligibility + assignment); a second claim returns "taken". **The web app never claims**: it only shows claims, read-only.
- A Claude schedule always runs in **one person's** Claude, on their own account and limit. Every token belongs to a member (D19). No run budget in our app (D21).
- The Claude schedule holds only a one-line setup prompt. How to work (MCP server `instructions`) and the work itself (`next_task` / `get_task`) come from our server, so changes never need a re-paste.
- No tokens in URLs. MCP auth uses a header (`Authorization: Bearer <token>`). Store only hashes of API tokens.
- Every change to tasks, the team policy, members and tokens writes an audit entry.
- Secrets live in environment variables, never in the repo.

---

## 1. Feature map and order

```
F0 Foundation (setup, schema, shared contracts)  ← owner: you
 ├─► F1 Auth & members ─────────────┐
 ├─► F2 Tasks (editor, rows) ───────┤
 ├─► F3 Prompt + team policy ───────┤ (pure)
 ├─► F4 Claim engine ───────────────┤ (pure + DB)
 │                                  ▼
 │            ┌─────────────────────┴───────┐
 │            ▼                             ▼
 │  F5 MCP endpoint + Connect Claude   F6 Board + logs
 │            └─────────────┬───────────────┘
 │                          ▼
 └──────────────────► F7 Demo: a real Claude schedule end to end
```

| ID | Feature | Depends on | Can start after | Size |
|---|---|---|---|---|
| F0 | Foundation: app, UI shell, Appwrite schema, shared types, CI, deploy | – | now | M |
| F1 | Auth & members (login, session, role guard, members page) | F0 | F0 | M |
| F2 | Tasks (list, editor: title, prompt, rows table, repeat, assignees; prompt history; suggest) | F0 (+F1 guard, can stub) | F0 | M |
| F3 | Prompt (policy + prompt + row) + team policy setting | F0 types | F0 | S |
| F4 | Claim engine (claim, claim next, heartbeat, finish, skip, eligibility, assignment, order) | F0 types + schema | F0 | M |
| F5 | MCP endpoint + tokens + Connect Claude page (server instructions, one-line setup prompt) | F1, F2, F3, F4 | F2+F4 | M |
| F6 | Board + logs (read-only: who is on what; who executed what; quick add) | F2, F4 | F2+F4 | S |
| F7 | Demo: a real Claude schedule takes and completes real work | all | F5+F6 | S |

**Parallel tracks (example for 3–4 people):**
- **Track A (you):** F0, then F1.
- **Track B (logic):** F3 and F4 right after F0. Pure functions with tests; little UI.
- **Track C (UI):** F2, using the stub role guard until F1 lands.
- **Then:** F5 and F6 in parallel, then F7 together.

## 2. Working agreement

- **Branches:** `feat/f0-foundation`, `feat/f1-auth`, `feat/f2-tasks`, … One feature per branch, PR into `main`.
- **Folder ownership** (avoids merge conflicts): each feature owns the folders listed under its **Files**. Shared files (`web/lib/types.ts`, `web/lib/appwrite.ts`, `web/scripts/setup-appwrite.ts`) are owned by F0; later changes to them go in a small separate PR announced to the team.
- **Definition of done:** typecheck, lint and `vitest` pass in CI; the feature's acceptance checks below pass on a preview deploy; audit entries are written where required; PR reviewed by one other person.
- **Commits:** small, imperative ("feat(tasks): rows table").

---

## 3. Shared contracts (created in F0, used by everyone)

Everyone codes against these names. If one must change, change it in one PR and tell the team.

### 3.1 Types — `web/lib/types.ts`

```ts
export type Role = "lead" | "member";
export type ItemStatus = "available" | "done" | "failed" | "skipped";
export type Outcome = "done" | "failed" | "skipped";

export type Caller =
  { kind: "member"; memberId: string; role: Role; scheduled: boolean }; // scheduled = token made for a Claude schedule (logs are tagged "scheduled")

export interface Member { $id: string; teamId: string; userId: string; name: string; role: Role }

/** A task is a title and a prompt. The prompt can ask for anything; we only store, hand out and track it. */
export interface Task {
  $id: string; teamId: string; title: string;
  repeatDays: number;                    // 0 = once; N = each item comes back N days after it was last done
  assignees: string[];                   // member ids; [] = anyone
  currentVersion: number;                // the prompt lives in task_versions; every run uses the latest
}
export interface TaskVersion { $id: string; taskId: string; version: number; prompt: string; authorId: string; createdAt: string }

/** A member's own addition to a task's prompt (e.g. where their files are). Only their Claude receives it. */
export interface MemberNote { $id: string; taskId: string; memberId: string; text: string; updatedAt: string }

/** The unit that is claimed and done. A task without rows has one hidden item with text "". */
export interface TaskItem {
  $id: string; teamId: string; taskId: string; text: string; position: number;
  status: ItemStatus; lastDoneAt: string | null; lastLogId: string | null;
}
export interface Claim { $id: string /* = taskItemId */; by: string /* memberId */; scheduled: boolean; claimedAt: string; leaseUntil: string }
export interface Log {
  $id: string; taskId: string; itemId: string; item: string /* row text at the time, "" for the whole task */;
  by: string /* memberId */; scheduled: boolean; outcome: Outcome; summary: string;
  details: string | null;                // free text from Claude: what it did, where the result is, notes
  version: number; startedAt: string; finishedAt: string;
}
export interface Settings { $id: string; teamId: string; policy: string }
export interface ApiToken { $id: string; owner: string /* memberId */; scheduled: boolean; name: string; tokenHash: string; lastUsedAt: string | null; revoked: boolean }
export interface AuditEntry { $id: string; teamId: string; actor: string; action: string; entity: string; before: string | null; after: string | null; at: string }
```

Notes: `teamId` is a constant from env in v1 (`TEAM_ID`). Using one shape for both cases (a task without rows has a single hidden item `""`) keeps the claim engine to one code path. Logs copy the row text, so removing a row never breaks history.

### 3.2 Module signatures

| Module | Owner | Exports |
|---|---|---|
| `web/lib/appwrite.ts` | F0 | `adminTables(): TablesDB`, `adminUsers(): Users`, `sessionAccount(): Promise<Account \| null>`, `ping(): Promise<boolean>`, `DB_ID`, `T` (table ids: `T.members`, `T.tasks`, `T.taskVersions`, `T.taskItems`, `T.memberNotes`, `T.claims`, `T.takeovers`, `T.logs`, `T.settings`, `T.apiTokens`, `T.audit`), `TEAM_ID` |
| `web/lib/audit.ts` | F0 | `audit(actor: string, action: string, entity: string, before?: unknown, after?: unknown): Promise<void>` |
| `web/lib/auth.ts` | F1 (stub in F0) | `getMember(): Promise<Member \| null>`, `requireMember(): Promise<Member>`, `requireLead(): Promise<Member>` (throw `Forbidden`) |
| `web/lib/tasks.ts` | F2 | `nextVersion(current: number): number`, `cleanRows(texts: string[]): string[]`, `syncItems(taskId: string, rows: string[]): Promise<void>`, `getNote(taskId: string, memberId: string): Promise<string>`, `saveNote(taskId: string, memberId: string, text: string): Promise<void>` (empty text deletes) |
| `web/lib/prompt.ts` | F3 | `buildPrompt(policy: string, prompt: string, note?: string, item?: string): string` |
| `web/lib/claims.ts` | F4 | `canTake(task: Task, memberId: string): boolean`, `isEligible(item: TaskItem, task: Task, claim: Claim \| null, now: Date): boolean`, `sortWork(items: TaskItem[]): TaskItem[]`, `listEligible(caller: Caller, limit?: number): Promise<Array<{ item: TaskItem; task: Task; lastLog: Log \| null }>>`, `claim(itemId: string, caller: Caller, leaseMinutes?: number): Promise<{ ok: true; leaseUntil: string } \| { ok: false; reason: "taken" \| "done" \| "not-assigned" \| "not-found" }>`, `claimNext(caller: Caller): Promise<{ item: TaskItem; task: Task; leaseUntil: string } \| null>`, `heartbeat(itemId: string, caller: Caller, leaseMinutes?: number): Promise<{ ok: boolean; leaseUntil?: string }>`, `finish(itemId: string, caller: Caller, outcome: "done" \| "failed", data: { summary: string; details?: string }): Promise<Log>`, `recordSkip(itemId: string, caller: Caller, reason: string): Promise<Log>` |
| `web/lib/tokens.ts` | F5 | `createToken(memberId: string, name: string, scheduled: boolean): Promise<{ token: string; row: ApiToken }>`, `verifyBearer(header: string \| null): Promise<Caller \| null>`, `revokeToken(id: string): Promise<void>` |

---

## 4. Features

### F0 — Foundation (owner: you)

**Goal:** a deployed app everyone can branch from, with the database created and the shared contracts in place.

**Files (✓ = exists in the mock UI):**
- ✓ `web/` (Next.js 16.4.2 app), `app/layout.tsx`, `app/page.tsx` (redirects to `/board`)
- ✓ `web/app/(app)/layout.tsx` (sidebar shell + auth guard + Appwrite ping), `web/app/(app)/loading.tsx`
- ✓ `web/components/ui.tsx` (Badge, Card, PageHeader, button/input classes), `web/components/client.tsx` (Nav, CopyButton, ItemsTable, TokenForm)
- ✓ `web/lib/types.ts` (as §3.1), `web/lib/appwrite.ts`, `web/lib/auth.ts` (stub), `web/lib/mock.ts` (temporary), `web/.env.example`
- Create: `web/lib/audit.ts` (today `logAudit` in `mock.ts`)
- Create: `web/scripts/setup-appwrite.ts` (idempotent: creates database `commons` and all tables, columns, indexes)
- Create: `.github/workflows/ci.yml`, `web/vitest.config.ts`, `web/lib/__tests__/smoke.test.ts`

- [x] **Step 1: Create the app.** Done with `create-next-app@16.4.2` (Tailwind 4, ESLint, `@/*` alias). shadcn deferred (see Current state).
- [x] **Step 2: Appwrite project.** Project `hakatoni` (`6ad3926b000731cc9576`) exists on api.rando.ge; the API key is in `web/.env.local`. Still to do for F1: enable Email/Password auth. Put values in `web/.env.local` (copy `.env.example`):

```
APPWRITE_ENDPOINT=https://api.rando.ge/v1
APPWRITE_PROJECT_ID=6ad3926b000731cc9576
APPWRITE_API_KEY=
APPWRITE_DATABASE_ID=commons
TEAM_ID=rando
SESSION_COOKIE_NAME=commons_session
```

- [x] **Step 3: Pin `node-appwrite`.** Pinned exactly to `22.1.3` (README at that tag: "API version 1.8.1, compatible with server 1.8.x"; 23.x targets 1.9). Recorded in `TECH.md` §2.
- [x] **Step 4: `lib/types.ts`** exactly as §3.1.
- [x] **Step 5: `lib/appwrite.ts`** with the exports in §3.2 plus `ping()`. `sessionAccount()` reads the session cookie and returns `null` when absent. Admin calls throw a clear error until `APPWRITE_API_KEY` is set.
- [x] **Step 6: `scripts/setup-appwrite.ts`** (done; `-- --sample` loads the demo data into empty tables; additive only, see TECH §2 for the column-type quirk) creates the tables from `TECH.md` §3 with columns matching §3.1 (strings, integers, booleans, string arrays, datetimes). Indexes: `taskVersions(taskId, version)` unique, `taskItems(taskId, position)`, `taskItems(status)`, `logs(taskId)`, `logs(by)`, `apiTokens(tokenHash)` unique, `audit(at)`. Seeds one `settings` row with the default policy (F3). Running it twice must not fail. Add `"setup:appwrite": "tsx scripts/setup-appwrite.ts"` to `package.json` scripts (`npm i -D tsx`).
- [x] **Step 7: `lib/audit.ts`** writes one row to `T.audit` with JSON-stringified `before`/`after` (same signature as `logAudit` in `mock.ts`).
- [x] **Step 8: `lib/auth.ts` stub:** `getMember()` reads the `mock_member` cookie set by the mock login page and the sidebar "Signed in as" switcher. F1 replaces it and removes the switcher.
- [x] **Step 9: App shell** with nav (Board, Tasks, Logs, Connect Claude, Settings) and every page built on mock data.
- [x] **Step 10: CI** (`.github/workflows/ci.yml`) runs `npm ci`, `npm run lint`, `npx tsc --noEmit`, `npx vitest run` in `web/`.
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

- **List:** title, repeat (once / every N days), assigned to (or "anyone"), progress ("3/6 rows done", or done / not done), how many in progress.
- **Editor (lead):** **title**, **prompt** (big textarea, free text, can ask for anything), **rows** (optional table: add row, remove row, paste many lines into a row to add them all; each row shows its status and who is on it, read-only), **repeat** (once / every N days), **assigned to** (a checkbox per member; none = anyone). Nothing else.
- **Save:** normalise `\r\n` to `\n`; if the prompt changed, a new `task_versions` row with `version = currentVersion + 1` and update `currentVersion`. Then `syncItems`: rows removed from the table are deleted (their logs keep the row text), new rows become `available` items, existing rows keep their status and get their new `position`. A task with no rows has one hidden item `""`.
- **My note for this task (any member):** a textarea under the editor. Saved per task and member in `member_notes`, not versioned, editable by its owner only (a lead cannot edit someone else's note). Only that member's Claude receives it.
- **What your Claude receives:** a read-only preview of `buildPrompt(policy, prompt, myNote, firstRow)` (F3).
- **Prompt history:** each version (author, date, prompt), the latest marked "in use"; optional plain line diff against the previous one. Nothing to approve.
- **Log:** this task's logs, with the row each one was about.
- **Members** can read everything and leave a "suggest change" note (stored in audit as `task.suggest`); no editing.
- **No claim, complete or release buttons anywhere in the app.** Only Claude claims (F4/F5). A stuck claim frees itself when its lease expires.
- `lib/tasks.ts` test:

```ts
import { it, expect } from "vitest";
import { nextVersion, cleanRows } from "../tasks";

it("increments versions from 0", () => {
  expect(nextVersion(0)).toBe(1);
  expect(nextVersion(4)).toBe(5);
});
it("cleans rows: trims, drops blanks and duplicates, keeps order", () => {
  expect(cleanRows([" Acme ", "", "Green Cafe", "Acme"])).toEqual(["Acme", "Green Cafe"]);
});
```

**Acceptance:** editing a task's prompt creates version N+1 and leaves N unchanged; saving without changing the prompt creates no version; adding 20 rows (one paste) creates 20 items; a member's note appears in their own preview and not in anyone else's; removing a row keeps its old logs readable; only a lead can edit; audit rows exist for create and edit.

### F3 — Prompt + team policy

**Depends on:** F0 types.
**Files:** `web/lib/prompt.ts`, `web/lib/__tests__/prompt.test.ts`, `web/app/(app)/settings/policy/page.tsx`, `web/app/(app)/settings/policy/actions.ts`.

- `buildPrompt(policy, prompt, note?, item?)` joins the non-empty policy, the prompt, `My notes for this task:\n<note>` and `Item: <row>` with a separator line. No templating: the prompt is used as written.
- Settings page (lead): edit the team policy, free text placed before every task prompt (e.g. how to deliver results, what never to touch; for code teams, the branching strategy, D15). Default:

```
Rules for every task:
- Use no secrets and do not touch anything the task does not ask for.
- If the task is unclear or needs a human decision, stop and call fail with the reason.
- Finish by calling complete with a short summary and details (what you did, where the result is, anything a human should know).
```

Test:

```ts
import { it, expect } from "vitest";
import { buildPrompt } from "../prompt";

it("orders policy, prompt, note, row and skips empty parts", () => {
  expect(buildPrompt("P", "Do X")).toBe("P\n\n---\n\nDo X");
  expect(buildPrompt("", "Do X", "", "Acme")).toBe("Do X\n\n---\n\nItem: Acme");
  expect(buildPrompt("", "Do X", "Files in D:/x")).toBe("Do X\n\n---\n\nMy notes for this task:\nFiles in D:/x");
});
```

**Acceptance:** tests pass; the settings page saves the policy and audits the change.

### F4 — Claim engine

**Depends on:** F0 types and schema.
**Files:** `web/lib/claims.ts`, `web/lib/__tests__/claims.test.ts`, `web/scripts/race-test.ts`.

This is what prevents double work. The unit is a task item (a row, or the hidden item of a task without rows). The server is the only judge of "free"; Claude never decides it, and the web app never claims.

- `canTake(task, memberId)` is pure: no assignees → anyone; otherwise only listed members (their scheduled runs included).
- `isEligible(item, task, claim, now)` is pure:
  - an active claim (`leaseUntil` later than now) → not eligible;
  - status `done` with `task.repeatDays = 0` → not eligible (done once);
  - status `done` with `task.repeatDays > 0` → eligible only when `lastDoneAt` is older than `repeatDays`;
  - status `available`, `failed` or `skipped` → eligible.
- `sortWork(items)`: never-done first, then oldest `lastDoneAt`, then task order and row `position`.
- `listEligible(caller)`: items of tasks the caller `canTake`, their claims, filtered with `isEligible`, ordered with `sortWork`, at most `limit` (default 10), with the task and last log.
- `claim(itemId, caller)`: re-read the item and its task. Not found → `"not-found"`; `!canTake` → `"not-assigned"`; not eligible ignoring the lock → `"done"`. Then take the lock: `createRow(T.claims, itemId, {...})`. On HTTP 409, read the claim; if active → `"taken"`; if expired, create the `claim_takeovers` marker (id = hash(itemId + its claimedAt)) and, if that succeeds, overwrite the claim; a 409 on the marker → `"taken"`. After winning, re-read the item; if it is no longer eligible, release and return `"done"`. (Transactions were tried first and let two takeovers win on 1.8.1.) Default lease 120 minutes. The claim stores `scheduled` from the caller.
- `claimNext(caller)`: runs `listEligible` and tries `claim` on each item in order until one succeeds; `null` when nothing is left. Used by the `next_task` MCP tool.
- `heartbeat`: only the current holder can extend.
- `finish`: in one transaction, create the `logs` row (row text copied into `item`, startedAt = claim's `claimedAt`, `scheduled` from the claim, `version` = task's `currentVersion`), update the item (`status`, `lastLogId`, and `lastDoneAt` when done), delete the claim. Only the holder can finish.
- `recordSkip`: creates a `skipped` log and sets the item status to `skipped`. No claim needed; an active claim by someone else makes it fail with "taken".
- A lead can reset a done one-off by editing the task (removing and re-adding the row) — no reset button in v1.
- `scripts/race-test.ts`: fires 10 concurrent `claim()` calls on one item against the real server and asserts exactly one `ok: true`; then sets an expired lease and fires 5 concurrent takeovers and asserts exactly one wins; then 5 concurrent `claimNext()` with 3 free items assert 3 distinct items and 2 `null`. Run manually: `npx tsx scripts/race-test.ts`.

Tests for the pure parts:

```ts
import { describe, it, expect } from "vitest";
import { canTake, isEligible, sortWork } from "../claims";
import type { Task, TaskItem, Claim } from "../types";

const task = (o: Partial<Task> = {}): Task => ({ $id: "k1", teamId: "t", title: "T", repeatDays: 0, assignees: [], currentVersion: 1, ...o });
const item = (o: Partial<TaskItem> = {}): TaskItem => ({
  $id: "i1", teamId: "t", taskId: "k1", text: "Acme", position: 0, status: "available", lastDoneAt: null, lastLogId: null, ...o,
});
const now = new Date("2026-10-20T12:00:00Z");

describe("isEligible", () => {
  it("free item is eligible", () => expect(isEligible(item(), task(), null, now)).toBe(true));
  it("active claim blocks", () => {
    const c: Claim = { $id: "i1", by: "m1", scheduled: false, claimedAt: "2026-10-20T11:00:00Z", leaseUntil: "2026-10-20T13:00:00Z" };
    expect(isEligible(item(), task(), c, now)).toBe(false);
  });
  it("expired claim does not block", () => {
    const c: Claim = { $id: "i1", by: "m1", scheduled: false, claimedAt: "2026-10-20T08:00:00Z", leaseUntil: "2026-10-20T10:00:00Z" };
    expect(isEligible(item(), task(), c, now)).toBe(true);
  });
  it("once means done once", () => {
    expect(isEligible(item({ status: "done", lastDoneAt: "2026-01-01T00:00:00Z" }), task(), null, now)).toBe(false);
  });
  it("failed items can be retried", () => expect(isEligible(item({ status: "failed" }), task(), null, now)).toBe(true));
  it("repeating task: an item comes back after repeatDays", () => {
    const t = task({ repeatDays: 7 });
    expect(isEligible(item({ status: "done", lastDoneAt: "2026-10-18T12:00:00Z" }), t, null, now)).toBe(false);
    expect(isEligible(item({ status: "done", lastDoneAt: "2026-10-01T12:00:00Z" }), t, null, now)).toBe(true);
  });
});

it("no assignees means anyone; otherwise only those listed", () => {
  expect(canTake(task(), "m1")).toBe(true);
  expect(canTake(task({ assignees: ["m2"] }), "m1")).toBe(false);
  expect(canTake(task({ assignees: ["m1", "m2"] }), "m2")).toBe(true);
});

it("orders never-done first, then oldest done", () => {
  const is = [item({ $id: "a", lastDoneAt: "2026-10-10T00:00:00Z" }), item({ $id: "b" }), item({ $id: "c", lastDoneAt: "2026-10-01T00:00:00Z" })];
  expect(sortWork(is).map((i) => i.$id)).toEqual(["b", "c", "a"]);
});
```

**Acceptance:** unit tests pass; the race test passes all three scenarios on our 1.8.1 server. If the transaction does not prevent a double takeover, stop and tell the team (fallback: a version column checked on update).

### F5 — MCP endpoint + tokens + Connect Claude

**Depends on:** F1, F2, F3, F4.
**Files:** `web/app/api/[transport]/route.ts`, `web/lib/tokens.ts`, `web/lib/mcp/tools.ts`, `web/lib/mcp/instructions.ts`, `web/lib/__tests__/tokens.test.ts`, `web/lib/__tests__/instructions.test.ts`, `web/app/(app)/setup/page.tsx`, `web/app/(app)/settings/tokens/*`.

- **Connect Claude page (`/setup`)**, the one-time setup, in four steps:
  1. Create a token (shown once). It belongs to the member who creates it; they choose **for my Claude schedule** (`scheduled: true`, logged as "Nino · scheduled") or **for my own Claude Code sessions**. Work always uses that person's own Claude limit.
  2. Guide to add the `commons` connector in Claude: the URL `https://<app>/api/mcp` and the `Authorization: Bearer <token>` request header. For Claude Code, show `claude mcp add --transport http commons https://<app>/api/mcp --header "Authorization: Bearer <token>"`.
  3. "Copy prompt" for the Claude scheduled task: the one line `SETUP_PROMPT`.
  4. "Check it works": run the schedule once by hand and watch the board and Logs.
- Tokens page (`/settings/tokens`): list and revoke.
- `tokens.ts`: tokens are 32 random bytes, base64url, prefixed `cc_`. Store `sha256` hex. `verifyBearer` returns a `Caller` (`memberId`, `role`, `scheduled`) or `null`, updates `lastUsedAt`.
- `mcp/instructions.ts` exports `MCP_INSTRUCTIONS` (the workflow, sent as the MCP server's `instructions` in the initialize response) and `SETUP_PROMPT` (the one line pasted into Claude):

```ts
export const MCP_INSTRUCTIONS = [
  "This server hands out team tasks. To work on them:",
  "1. Call next_task. It claims the next free task (or one row of a task) for you and returns what to do. If it returns nothing, stop.",
  "2. (To pick a specific one instead: call list_work, then claim it. If claim says taken or done, choose another.)",
  "3. Do what the prompt says, for the item it names if there is one. Never work on something you have not claimed.",
  "4. On long work, call heartbeat at least every 30 minutes.",
  "5. Finish with complete (a short summary, and details: what you did, where the result is, anything a human should know), fail (reason), or skip (reason).",
  "6. Repeat from step 1 until next_task returns nothing.",
].join("\n");

export const SETUP_PROMPT = `Use the "commons" MCP connector and work through our team's task queue.`;
```

```ts
import { it, expect } from "vitest";
import { SETUP_PROMPT, MCP_INSTRUCTIONS } from "../mcp/instructions";

it("keeps the pasted prompt to one line and the workflow on the server", () => {
  expect(SETUP_PROMPT.split("\n")).toHaveLength(1);
  expect(MCP_INSTRUCTIONS).toContain("next_task");
});
```

- Route: `mcp-handler` with stateless Streamable HTTP and `instructions: MCP_INSTRUCTIONS`. Every request without a valid token gets `401`. Tools (inputs with zod):

| Tool | Input | Returns |
|---|---|---|
| `next_task` | `{}` | The main path: claims the next free item the caller can take (`claimNext`) and returns `{ itemId, task, item, prompt, leaseUntil }` (prompt via `buildPrompt` with the **caller's** note), or `{ empty: true }` |
| `list_work` | `{ limit?: number }` | Free items the caller can take: item id, task title, row text, repeat, last log; for choosing a specific one |
| `claim` | `{ itemId: string }` | `{ ok, leaseUntil }` or `{ ok: false, reason: "taken" \| "done" \| "not-assigned" \| "not-found" }` |
| `get_task` | `{ itemId: string }` | `{ task, item, prompt }` (prompt via `buildPrompt`, latest version, with the caller's note) |
| `heartbeat` | `{ itemId: string }` | `{ ok, leaseUntil }` |
| `complete` | `{ itemId: string, summary: string, details?: string }` | log id (via `finish(..., "done", ...)`) |
| `fail` | `{ itemId: string, reason: string, details?: string }` | log id (via `finish(..., "failed", ...)`) |
| `skip` | `{ itemId: string, reason: string }` | log id (via `recordSkip`) |
| `board` | `{}` | counts and current claims |

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

**Acceptance:** with MCP Inspector and with `claude mcp add` from a laptop: no token → 401; the initialize response carries `MCP_INSTRUCTIONS`; `next_task` returns a claimed item with its prompt; a second claim on it returns "taken"; claiming an item that was just completed returns "done"; claiming an item of a task assigned to someone else returns "not-assigned"; the same task fetched with two members' tokens returns each member's own note only; two parallel `next_task` calls get different items (two rows of the same task can run at once); `complete` shows on the board and in Logs; following `/setup` alone is enough to connect a Claude scheduled task.

### F6 — Board + logs

**Depends on:** F2, F4.
**Files:** `web/app/(app)/board/page.tsx`, `web/app/(app)/logs/page.tsx`.

- **Board (read-only):** grouped by task (title, repeat, assignees, link to open it); one line per row (or one line for a task without rows): status (free / in progress by X until HH:MM, tagged "scheduled" when it is / done / failed / skipped) and the last log summary. Filters: status, **assigned to me**. Refresh button (realtime is a later feature). No claim / complete / release buttons.
- **Quick add (lead):** title + prompt, creates a once / anyone task without rows.
- **Logs page (who executed what):** a table, newest first: finished at, executed by (a person, tagged "scheduled" for unattended runs), task + row + summary, result, duration (finished − started). Clicking a row expands `details`, start/finish times and the prompt version. Filter by task, person and result.

**Acceptance:** a claim made through MCP shows within one refresh; a completed item's log appears on the Logs page with its row and details.

### F7 — Demo: a real Claude schedule end to end

**Depends on:** all.

- [ ] Write 2–3 real tasks, at least one with 3–5 rows (for example a client brief for each lead, or installing the Rando SEO skill on each client site). Check that what each prompt needs is available where the Claude schedule runs.
- [ ] Follow `/setup`: a schedule token, the connector (request headers if available, see `TECH.md` §6; otherwise the agreed fallback), and the one-line prompt in a Claude scheduled task.
- [ ] Trigger a run, watch the board, read the results in Logs.
- [ ] Run a teammate's own Claude Code session at the same time on the same task with rows to show they take different rows.
- [ ] Record the demo and note anything that broke as issues.

**Acceptance:** at least 3 items done by the schedule with their results in Logs, and two runs sharing one task's rows without overlap on camera.

---

## 5. Later (not in this plan)

GitHub sign-in (Appwrite OAuth) · OAuth for the MCP endpoint (Better Auth MCP plugin or Clerk) if request headers are unavailable · CodeMirror prompt editor · realtime board · task priority · more columns in the rows table · ordered steps / "do after" between tasks · a "run again" button for done one-offs · per-token run cap · multiple teams · shared task library between teams · clan mode (`POSITIONING.md`, `security/SECURITY.md`).

## 6. Open questions that affect features

| Question | Affects | Default until decided |
|---|---|---|
| Does our claude.ai organization have connector request headers? | F5, F7 | Build header auth; decide the fallback before F7. |
| Cloud schedules (claude.ai routines) with a connector request header use **one key for the whole organization** (TECH §6), so every cloud run would log as the person whose token was entered. | F5, F7 | Use Claude Code schedules on each person's own machine/config (`claude mcp add` with their own token) for per-person attribution; cloud routines log under the token owner. |
| Who may write tasks: lead only or members too? | F2 | Lead edits, members suggest. |
| Should rows have more than one column (e.g. name + URL)? | F2 | One text column; put extra info in the same cell or in the prompt. |
| For code tasks: which branching strategy? | F3 policy | Free text in the team policy or the task prompt (D15). No field. |
| How long is a lease? | F4 | 120 minutes; `MCP_INSTRUCTIONS` tell Claude to heartbeat every 30. |
| Exact steps to add a custom connector with request headers in Claude (menu path, where headers go). | F5 `/setup` guide, F7 | Guide says "Settings → Connectors"; verify against Claude's docs and our organization before F7. |
| Do we need a per-run cap after all (e.g. a night run using a whole weekly limit)? | F5 `next_task` | No (D21). If it happens, add an optional cap per token, enforced in `next_task`. |
