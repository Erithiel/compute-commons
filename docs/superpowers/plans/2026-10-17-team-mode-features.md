# Team Mode: Feature Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Before starting a feature, write its detailed step plan from the feature's section below (superpowers:writing-plans), on its own branch.

**Goal:** Build team mode: a web app where a team stores skills and targets, and a remote MCP server that lets a person's Claude Code or a scheduled Claude routine pick work, claim it without collisions, run the skill, and report a branch back.

**Architecture:** One Next.js app in `web/` holds the pages, server actions and the MCP endpoint (`/api/mcp`). Appwrite 1.8 TablesDB on api.rando.ge stores everything. Anthropic routines are the scheduler; we run no background jobs.

**Tech Stack:** Next.js 16 + TypeScript, React 19, Appwrite TablesDB (`node-appwrite`, major matching server 1.8.x), `mcp-handler` + `@modelcontextprotocol/server`, `zod`, Tailwind 4 + shadcn/ui, `vitest`, Vercel.

**Spec:** `IDEA.md` (sections 2–8), `TECH.md` (all), `DECISIONS.md` (D6, D9–D14).

## Global Constraints

- Team mode only. Clan mode is parked; do not build trust ladders or security-checker roles.
- Every result is a git branch; nothing in our system writes to `main` of a target repo.
- The browser never talks to Appwrite directly in v1. All data access is server-side with the API key, after a role check.
- Roles: `lead` and `member` only (permission table in `IDEA.md` §7).
- Skill edits create a new immutable version. Unattended routines run only the approved version.
- Prompt order is always: team policy, then routine prefix, then skill.
- No scheduler, cron or background worker in our code. Lease expiry is checked when a claim is read.
- No tokens in URLs. MCP auth uses a header (`Authorization: Bearer <token>`).
- Store only hashes of API tokens.
- Every change to skills, policies, routines, members and tokens writes an audit entry.
- Secrets live in environment variables, never in the repo.
- Targets are generic (`kind` is free text). Do not hard-code websites.

---

## 1. Feature map and order

```
F0 Foundation (setup, schema, shared contracts)  ← owner: you
 ├─► F1 Auth & members ───────────────┐
 ├─► F2 Skills library ───┐           │
 ├─► F3 Targets ──────────┤           │
 ├─► F4 Prompt builder ───┤ (pure)    │
 ├─► F5 Claim engine ─────┤ (pure+DB) │
 │                        ▼           │
 │                 F6 Work items      │
 │                        │           │
 │        ┌───────────────┼───────────┤
 │        ▼               ▼           ▼
 │   F8 Board      F9 Routines   F7 MCP endpoint + tokens
 │        └───────────────┴───────────┤
 │                                    ▼
 └──────────────────────────► F10 Demo: one real routine end to end
```

| ID | Feature | Depends on | Can start after | Size |
|---|---|---|---|---|
| F0 | Foundation: app, UI shell, Appwrite schema, shared types, CI, deploy | – | now | M |
| F1 | Auth & members (login, session, role guard, members page) | F0 | F0 | M |
| F2 | Skills library (list, editor, versions, approve, requires, risk label) | F0 (+F1 guard, can stub) | F0 | M |
| F3 | Targets (list, add, tags, paste a list) | F0 (+F1 guard, can stub) | F0 | S |
| F4 | Prompt builder (merge policy + prefix + skill, fill `{{blanks}}`) + team policy page | F0 types | F0 | S |
| F5 | Claim engine (claim, heartbeat, finish, eligibility) | F0 types + schema | F0 | M |
| F6 | Work items (skill × target rows, eligible list) | F2, F3, F5 | F2+F3+F5 | S |
| F7 | MCP endpoint + API tokens (8 tools, token page) | F1, F4, F5, F6 | F6 | M |
| F8 | Board (who is on what, free, done, failed, results) | F5, F6 | F6 | S |
| F9 | Routines (config, prefix, budget, cooldown, "copy routine prompt") | F2, F3, F4, F6 | F6 | S |
| F10 | Demo: a real Claude routine runs a real skill on 3–5 targets | all | F7+F9 | S |

**Parallel tracks (example for 3–4 people):**
- **Track A (you):** F0, then F1.
- **Track B (logic):** F4 and F5 right after F0. Pure functions with tests; little UI.
- **Track C (UI):** F2 and F3 right after F0, using the stub role guard until F1 lands.
- **Then:** F6 (whoever finishes first), then F7 / F8 / F9 in parallel, then F10 together.

## 2. Working agreement

- **Branches:** `feat/f0-foundation`, `feat/f1-auth`, `feat/f2-skills`, … One feature per branch, PR into `main`.
- **Folder ownership** (avoids merge conflicts): each feature owns the folders listed under its **Files**. Shared files (`web/lib/types.ts`, `web/lib/appwrite.ts`, `web/scripts/setup-appwrite.ts`) are owned by F0; later changes to them go in a small separate PR announced to the team.
- **Definition of done:** typecheck, lint and `vitest` pass in CI; the feature's acceptance checks below pass on a preview deploy; audit entries are written where required; PR reviewed by one other person.
- **Commits:** small, imperative ("feat(skills): approve a version").

---

## 3. Shared contracts (created in F0, used by everyone)

Everyone codes against these names. If one must change, change it in one PR and tell the team.

### 3.1 Types — `web/lib/types.ts`

```ts
export type Role = "lead" | "member";
export type RiskLabel = "report-only" | "changes-files";
export type WorkStatus = "available" | "done" | "failed" | "skipped";
export type Outcome = "done" | "failed" | "skipped";

export type Caller =
  | { kind: "member"; memberId: string; role: Role }
  | { kind: "routine"; routineId: string };

export interface Member { $id: string; teamId: string; userId: string; name: string; role: Role }
export interface Skill {
  $id: string; teamId: string; slug: string; title: string; description: string;
  currentVersion: number; approvedVersion: number | null; requires: string[];
}
export interface SkillVersion {
  $id: string; skillId: string; version: number; prompt: string;
  inputs: string[]; riskLabel: RiskLabel; authorId: string; createdAt: string;
}
export interface Policy { $id: string; teamId: string; scope: "team" | "routine"; prefix: string }
export interface Target { $id: string; teamId: string; kind: string; name: string; ref: string; tags: string[] }
export interface Routine {
  $id: string; teamId: string; name: string; skillId: string; policyId: string | null;
  targetTags: string[]; targetIds: string[]; maxItems: number; maxMinutes: number;
  cooldownDays: number; enabled: boolean;
}
export interface WorkItem {
  $id: string; teamId: string; skillId: string; targetId: string; status: WorkStatus;
  lastDoneAt: string | null; lastResultId: string | null; priority: number;
}
export interface Claim { $id: string /* = workItemId */; by: string /* memberId or routineId */; claimedAt: string; leaseUntil: string }
export interface Result {
  $id: string; workItemId: string; by: string; outcome: Outcome; summary: string;
  branchUrl: string | null; skillVersion: number; startedAt: string; finishedAt: string;
}
export interface ApiToken { $id: string; memberId: string; name: string; tokenHash: string; lastUsedAt: string | null; revoked: boolean }
export interface AuditEntry { $id: string; teamId: string; actor: string; action: string; entity: string; before: string | null; after: string | null; at: string }
```

Notes: `inputs` is the list of blank names (`["url", "branchPrefix"]`); simpler than a JSON schema for v1. `targetTags`/`targetIds` replace the `targetFilter` in TECH §3 (either matches). `teamId` is a constant from env in v1 (`TEAM_ID`).

### 3.2 Module signatures

| Module | Owner | Exports |
|---|---|---|
| `web/lib/appwrite.ts` | F0 | `adminTables(): TablesDB`, `adminUsers(): Users`, `sessionAccount(): Promise<Account \| null>`, `DB_ID`, `T` (table id constants: `T.members`, `T.skills`, `T.skillVersions`, `T.policies`, `T.targets`, `T.routines`, `T.workItems`, `T.claims`, `T.results`, `T.apiTokens`, `T.audit`), `TEAM_ID` |
| `web/lib/audit.ts` | F0 | `audit(actor: string, action: string, entity: string, before?: unknown, after?: unknown): Promise<void>` |
| `web/lib/auth.ts` | F1 (stub in F0) | `getMember(): Promise<Member \| null>`, `requireMember(): Promise<Member>`, `requireLead(): Promise<Member>` (throw `Forbidden`) |
| `web/lib/prompt.ts` | F4 | `fillBlanks(template: string, values: Record<string,string>): { text: string; missing: string[] }`, `buildPrompt(p: { teamPolicy: string; routinePrefix: string; skillPrompt: string; values: Record<string,string> }): { text: string; missing: string[] }` |
| `web/lib/claims.ts` | F5 | `isEligible(item: WorkItem, claim: Claim \| null, now: Date, cooldownDays: number): boolean`, `claim(workItemId: string, by: string, leaseMinutes?: number): Promise<{ ok: true; leaseUntil: string } \| { ok: false; reason: "taken" \| "not-found" }>`, `heartbeat(workItemId: string, by: string, leaseMinutes?: number): Promise<{ ok: boolean; leaseUntil?: string }>`, `finish(workItemId: string, by: string, outcome: "done" \| "failed", data: { summary: string; branchUrl?: string; skillVersion: number }): Promise<Result>` (startedAt = the claim's `claimedAt`), `recordSkip(workItemId: string, by: string, reason: string, skillVersion: number): Promise<Result>` (no claim needed) |
| `web/lib/work.ts` | F6 | `ensureWorkItems(skillId: string, targetIds: string[]): Promise<number>` (returns rows created), `listEligible(opts: { routineId?: string; skillId?: string; limit?: number }): Promise<Array<{ item: WorkItem; skill: Skill; target: Target; lastResult: Result \| null }>>` |
| `web/lib/tokens.ts` | F7 | `createToken(memberId: string, name: string): Promise<{ token: string; row: ApiToken }>`, `verifyBearer(header: string \| null): Promise<Caller \| null>`, `revokeToken(id: string): Promise<void>` |

---

## 4. Features

### F0 — Foundation (owner: you)

**Goal:** an empty but deployed app everyone can branch from, with the database created and the shared contracts in place.

**Files:**
- Create: `web/` (Next.js app: `package.json`, `next.config.ts`, `tsconfig.json`, `app/layout.tsx`, `app/page.tsx`)
- Create: `web/components/ui/*` (shadcn: button, input, textarea, table, dialog, badge, select, toast)
- Create: `web/components/app-shell.tsx` (sidebar nav: Board, Skills, Targets, Routines, Settings)
- Create: `web/lib/types.ts`, `web/lib/appwrite.ts`, `web/lib/audit.ts`, `web/lib/auth.ts` (stub)
- Create: `web/scripts/setup-appwrite.ts` (idempotent: creates database `commons` and all tables, columns, indexes)
- Create: `web/.env.example`, `.github/workflows/ci.yml`
- Create: `web/vitest.config.ts`, `web/lib/__tests__/smoke.test.ts`

- [ ] **Step 1: Create the app.** `npx create-next-app@latest web --ts --app --tailwind --eslint --no-src-dir --import-alias "@/*"`. Then `npx shadcn@latest init` and add the components listed above.
- [ ] **Step 2: Appwrite project.** In the console on api.rando.ge create project `compute-commons`, an API key with Databases (read/write) and Users (read) scopes, and Email/Password auth enabled. Put values in `web/.env.local` (copy `.env.example`):

```
APPWRITE_ENDPOINT=https://api.rando.ge/v1
APPWRITE_PROJECT_ID=
APPWRITE_API_KEY=
APPWRITE_DATABASE_ID=commons
TEAM_ID=rando
SESSION_COOKIE_NAME=commons_session
```

- [ ] **Step 3: Pin `node-appwrite`.** Find in the node-appwrite changelog the major that targets server 1.8.x and install that exact major (`npm i node-appwrite@<major>`). Record it in `TECH.md` §2.
- [ ] **Step 4: `lib/types.ts`** exactly as §3.1.
- [ ] **Step 5: `lib/appwrite.ts`** with the exports in §3.2. `sessionAccount()` reads the session cookie and returns `null` when absent.
- [ ] **Step 6: `scripts/setup-appwrite.ts`** creates the tables from `TECH.md` §3 with columns matching §3.1 (strings, integers, booleans, string arrays, datetimes). Indexes: `skills(teamId, slug)` unique, `workItems(skillId, targetId)` unique, `workItems(status)`, `results(workItemId)`, `apiTokens(tokenHash)` unique, `audit(at)`. Running it twice must not fail. Add `"setup:appwrite": "tsx scripts/setup-appwrite.ts"` to `package.json` scripts (`npm i -D tsx`).
- [ ] **Step 7: `lib/audit.ts`** writes one row to `T.audit` with JSON-stringified `before`/`after`.
- [ ] **Step 8: `lib/auth.ts` stub:** `getMember()` returns a fake lead when `process.env.AUTH_STUB === "1"`, else `null`. F1 replaces it.
- [ ] **Step 9: App shell** with nav links and empty pages for each route so other features only fill them in.
- [ ] **Step 10: CI** runs `npm ci`, `npm run lint`, `npx tsc --noEmit`, `npx vitest run` in `web/`.
- [ ] **Step 11: Deploy** to Vercel (root directory `web`, region close to the Appwrite server, env vars set). Confirm the preview URL loads.
- [ ] **Step 12: Commit and open PR** `feat/f0-foundation`.

**Acceptance:** preview URL shows the shell; `npm run setup:appwrite` creates all tables on a fresh project and is a no-op the second time; CI is green.

### F1 — Auth & members

**Depends on:** F0.
**Files:** `web/app/(auth)/login/page.tsx`, `web/app/(auth)/login/actions.ts`, `web/lib/auth.ts` (replace stub), `web/proxy.ts` (Next.js 16 renamed `middleware.ts` to `proxy.ts`; check the Next.js docs for the version you install), `web/app/settings/members/*`.

- Login with email + password via a server action: `account.createEmailPasswordSession` with the admin client, store the session secret in an httpOnly, secure, sameSite=lax cookie (`SESSION_COOKIE_NAME`). Logout deletes the session and cookie.
- `proxy.ts` redirects to `/login` when the cookie is missing (except `/login` and `/api/mcp`).
- `getMember()` resolves the Appwrite user from the session, then the `members` row for `TEAM_ID`. A user without a members row sees "Ask your lead to add you".
- Members page (lead only): invite by email (creates the Appwrite user with a temporary password shown once, or an Appwrite invite), change role, remove. Each change calls `audit()`.
- First user bootstrap: `setup-appwrite.ts --first-lead you@example.com` creates the first lead.

**Acceptance:** a member cannot open `/settings/members` (403 page); a lead can add a member who can then log in; role change appears in the audit table.

### F2 — Skills library

**Depends on:** F0 (uses `requireLead`, stubbed until F1).
**Files:** `web/app/skills/page.tsx`, `web/app/skills/[id]/page.tsx`, `web/app/skills/actions.ts`, `web/lib/skills.ts`, `web/lib/__tests__/skills.test.ts`.

- List: title, slug, description, current and approved version, risk label of current version.
- Editor (lead): title, description, `requires` (comma list), risk label, prompt (textarea, markdown), inputs auto-detected from `{{name}}` in the prompt (use `fillBlanks(prompt, {}).missing` from F4, or a regex `/\{\{\s*([\w.-]+)\s*\}\}/g` until F4 lands).
- Save = create a new `skill_versions` row with `version = currentVersion + 1` and update `currentVersion`. Versions are never edited.
- Approve (lead): sets `approvedVersion`. Version history page shows each version with a diff against the previous one (plain line diff is enough).
- Members can read everything and see a "suggest change" note (free text stored in audit as `skill.suggest`); no editing.
- `lib/skills.ts` exports `nextVersion(current: number): number` and `detectInputs(prompt: string): string[]`. Test:

```ts
import { describe, it, expect } from "vitest";
import { detectInputs, nextVersion } from "../skills";

describe("skills", () => {
  it("detects unique blanks in order", () => {
    expect(detectInputs("Audit {{ url }} on {{branch}} then {{url}}")).toEqual(["url", "branch"]);
  });
  it("increments versions from 0", () => {
    expect(nextVersion(0)).toBe(1);
    expect(nextVersion(4)).toBe(5);
  });
});
```

**Acceptance:** editing a skill creates version N+1 and leaves N unchanged; only a lead can approve; audit rows exist for create, edit, approve.

### F3 — Targets

**Depends on:** F0.
**Files:** `web/app/targets/page.tsx`, `web/app/targets/actions.ts`, `web/lib/targets.ts`, `web/lib/__tests__/targets.test.ts`.

- Table of targets with kind, name, ref, tags; filter by kind and tag.
- Add one target (kind is free text with suggestions from existing kinds).
- Paste a list: one target per line as `name | ref | tag1, tag2` (kind chosen once for the batch). Show a preview before saving; skip duplicates by `ref`.
- `lib/targets.ts` exports `parseTargetLines(text: string): Array<{ name: string; ref: string; tags: string[] }>`. Test:

```ts
import { describe, it, expect } from "vitest";
import { parseTargetLines } from "../targets";

describe("parseTargetLines", () => {
  it("parses name, ref and tags, ignoring blank lines", () => {
    expect(parseTargetLines("Site A | https://a.ge | seo, client\n\nRepo B | github.com/x/b |")).toEqual([
      { name: "Site A", ref: "https://a.ge", tags: ["seo", "client"] },
      { name: "Repo B", ref: "github.com/x/b", tags: [] },
    ]);
  });
  it("uses ref as name when name is missing", () => {
    expect(parseTargetLines("| https://c.ge |")).toEqual([{ name: "https://c.ge", ref: "https://c.ge", tags: [] }]);
  });
});
```

**Acceptance:** pasting 20 lines creates 20 targets; pasting them again creates 0.

### F4 — Prompt builder + team policy

**Depends on:** F0 types.
**Files:** `web/lib/prompt.ts`, `web/lib/__tests__/prompt.test.ts`, `web/app/settings/policy/page.tsx`, `web/app/settings/policy/actions.ts`.

- `fillBlanks` replaces `{{ name }}` (spaces allowed) with values; unknown blanks stay as-is and are listed in `missing`.
- `buildPrompt` joins non-empty parts in the fixed order with a separator line, then fills blanks once over the whole text.
- Team policy page (lead): edit the single `team` policy prefix. Default text:

```
Rules for every task:
- Work in a fresh clone on a new branch named commons/<skill>-<target>-<date>. Never push to main.
- Use no secrets and do not read files outside the working folder.
- Finish by calling complete (summary + branch URL) or fail (reason).
```

Test:

```ts
import { describe, it, expect } from "vitest";
import { fillBlanks, buildPrompt } from "../prompt";

describe("prompt", () => {
  it("fills known blanks and reports missing ones", () => {
    expect(fillBlanks("Audit {{ url }} for {{goal}}", { url: "https://a.ge" }))
      .toEqual({ text: "Audit https://a.ge for {{goal}}", missing: ["goal"] });
  });
  it("orders policy, prefix, skill and skips empty parts", () => {
    const r = buildPrompt({ teamPolicy: "P", routinePrefix: "", skillPrompt: "S {{x}}", values: { x: "1" } });
    expect(r.text).toBe("P\n\n---\n\nS 1");
    expect(r.missing).toEqual([]);
  });
});
```

**Acceptance:** tests pass; the policy page saves and audits the change.

### F5 — Claim engine

**Depends on:** F0 types and schema.
**Files:** `web/lib/claims.ts`, `web/lib/__tests__/claims.test.ts`, `web/scripts/race-test.ts`.

- `isEligible` is pure:
  - an active claim (`leaseUntil` later than now) → not eligible;
  - status `done` with `cooldownDays = 0` → not eligible (done once, until a lead resets it);
  - status `done` with `cooldownDays > 0` → eligible only when `lastDoneAt` is older than `cooldownDays`;
  - status `available`, `failed` or `skipped` → eligible.
- `claim`: `createRow(T.claims, workItemId, {...})`. On HTTP 409, read the claim; if expired, delete and create **in one Appwrite transaction**; otherwise return `{ ok: false, reason: "taken" }`. Default lease 120 minutes.
- `heartbeat`: only the current holder (`by`) can extend.
- `finish`: in one transaction, create the `results` row (startedAt = claim's `claimedAt`), update the work item (`status`, and `lastDoneAt` when done), delete the claim. Only the holder can finish.
- `recordSkip`: creates a `skipped` result and sets the item status to `skipped`. No claim needed; an active claim by someone else makes it fail with "taken".
- `scripts/race-test.ts`: fires 10 concurrent `claim()` calls on one work item against the real server and asserts exactly one `ok: true`; then sets an expired lease and fires 5 concurrent takeovers and asserts exactly one wins. Run manually: `npx tsx scripts/race-test.ts`.

Unit test for the pure part:

```ts
import { describe, it, expect } from "vitest";
import { isEligible } from "../claims";
import type { WorkItem, Claim } from "../types";

const item = (o: Partial<WorkItem> = {}): WorkItem => ({
  $id: "w1", teamId: "t", skillId: "s", targetId: "x", status: "available",
  lastDoneAt: null, lastResultId: null, priority: 0, ...o,
});
const now = new Date("2026-10-20T12:00:00Z");

describe("isEligible", () => {
  it("free item is eligible", () => expect(isEligible(item(), null, now, 0)).toBe(true));
  it("active claim blocks", () => {
    const c: Claim = { $id: "w1", by: "m1", claimedAt: "2026-10-20T11:00:00Z", leaseUntil: "2026-10-20T13:00:00Z" };
    expect(isEligible(item(), c, now, 0)).toBe(false);
  });
  it("expired claim does not block", () => {
    const c: Claim = { $id: "w1", by: "m1", claimedAt: "2026-10-20T08:00:00Z", leaseUntil: "2026-10-20T10:00:00Z" };
    expect(isEligible(item(), c, now, 0)).toBe(true);
  });
  it("cooldown 0 means done once", () => {
    expect(isEligible(item({ status: "done", lastDoneAt: "2026-01-01T00:00:00Z" }), null, now, 0)).toBe(false);
  });
  it("failed items can be retried", () => expect(isEligible(item({ status: "failed" }), null, now, 0)).toBe(true));
  it("cooldown blocks recent success", () => {
    expect(isEligible(item({ status: "done", lastDoneAt: "2026-10-18T12:00:00Z" }), null, now, 7)).toBe(false);
    expect(isEligible(item({ status: "done", lastDoneAt: "2026-10-01T12:00:00Z" }), null, now, 7)).toBe(true);
  });
});
```

**Acceptance:** unit tests pass; the race test shows exactly one winner in both scenarios on our 1.8.1 server. If the transaction does not prevent a double takeover, stop and tell the team (fallback: a version column checked on update).

### F6 — Work items

**Depends on:** F2, F3, F5.
**Files:** `web/lib/work.ts`, `web/lib/__tests__/work.test.ts`, `web/app/skills/[id]/targets/page.tsx`.

- On a skill's page, "Assign targets": pick targets by tag or individually; `ensureWorkItems` creates missing skill × target rows (the unique index makes repeats harmless).
- `listEligible` loads work items for the routine's skill and targets (or for a skill), loads their claims, filters with `isEligible`, sorts by priority desc then `lastDoneAt` asc (never-done first), returns at most `limit` (default 10) with skill, target and last result.
- Test the sort order as a pure function `sortWork(rows)` exported from `work.ts`:

```ts
import { describe, it, expect } from "vitest";
import { sortWork } from "../work";

it("sorts by priority then oldest done, never-done first", () => {
  const rows = [
    { item: { $id: "a", priority: 0, lastDoneAt: "2026-10-10T00:00:00Z" } },
    { item: { $id: "b", priority: 0, lastDoneAt: null } },
    { item: { $id: "c", priority: 5, lastDoneAt: "2026-10-15T00:00:00Z" } },
  ] as any;
  expect(sortWork(rows).map((r: any) => r.item.$id)).toEqual(["c", "b", "a"]);
});
```

**Acceptance:** assigning 5 targets twice creates 5 work items; `listEligible` hides a claimed item until its lease expires.

### F7 — MCP endpoint + API tokens

**Depends on:** F1, F4, F5, F6.
**Files:** `web/app/api/[transport]/route.ts`, `web/lib/tokens.ts`, `web/lib/mcp/tools.ts`, `web/lib/__tests__/tokens.test.ts`, `web/app/settings/tokens/*`.

- Tokens page: create (show the token once, plus the ready `claude mcp add --transport http commons https://<app>/api/mcp --header "Authorization: Bearer <token>"` command), list, revoke. Routine tokens belong to a routine (`memberId` = `routine:<id>`), created on the routine page (F9).
- `tokens.ts`: tokens are 32 random bytes, base64url, prefixed `cc_`. Store `sha256` hex. `verifyBearer` returns a `Caller` or `null`, updates `lastUsedAt`.
- Route: `mcp-handler` with stateless Streamable HTTP. Every request without a valid token gets `401`. Tools (inputs with zod):

| Tool | Input | Returns |
|---|---|---|
| `list_work` | `{ routineId?: string, skill?: string, limit?: number }` | eligible items: id, skill slug, target name/ref, last result, suggested order |
| `get_skill` | `{ workItemId: string }` | merged prompt via `buildPrompt` (approved version for routines, current for members), `requires`, `riskLabel`, version |
| `claim` | `{ workItemId: string }` | `{ ok, leaseUntil }` or `{ ok: false, reason }` |
| `heartbeat` | `{ workItemId: string }` | `{ ok, leaseUntil }` |
| `complete` | `{ workItemId: string, summary: string, branchUrl: string }` | result id (via `finish(..., "done", ...)`) |
| `fail` | `{ workItemId: string, reason: string }` | result id (via `finish(..., "failed", ...)`) |
| `skip` | `{ workItemId: string, reason: string }` | result id (via `recordSkip`, claim not required) |
| `board` | `{ skill?: string }` | counts and current claims |

- `get_skill` fills blanks from the target: `{ target: target.name, ref: target.ref, kind: target.kind, tags: target.tags.join(", ") }`, and returns `missing` so the AI (or the lead, when previewing) sees unfilled blanks. Skill authors should only use these blanks in v1.
- A routine caller can only see work for its own routine. A skill with no approved version is invisible to routines.
- Test `tokens.ts` hashing and prefix:

```ts
import { describe, it, expect } from "vitest";
import { hashToken, newTokenString } from "../tokens";

it("creates prefixed tokens and stable hashes", () => {
  const t = newTokenString();
  expect(t.startsWith("cc_")).toBe(true);
  expect(hashToken(t)).toBe(hashToken(t));
  expect(hashToken(t)).not.toBe(t);
});
```

**Acceptance:** with MCP Inspector and with `claude mcp add` from a laptop: no token → 401; a member token can list, claim, complete; a second claim on the same item returns "taken"; results show on the board.

### F8 — Board

**Depends on:** F5, F6.
**Files:** `web/app/board/page.tsx`, `web/app/board/components/*`.

- Group by skill. Each row: target, status badge (free / claimed by X until HH:MM / done on date / failed / skipped), last result summary, branch link.
- Filters: skill, status, kind, tag. Refresh button (realtime is a later feature).
- Lead actions: release a stuck claim (deletes the claim, audited), reset an item to available.

**Acceptance:** a claim made through MCP shows within one refresh; releasing it frees the item.

### F9 — Routines

**Depends on:** F2, F3, F4, F6.
**Files:** `web/app/routines/page.tsx`, `web/app/routines/[id]/page.tsx`, `web/app/routines/actions.ts`, `web/lib/routine-prompt.ts`, `web/lib/__tests__/routine-prompt.test.ts`.

- Lead creates a routine: name, skill, targets (by tags and/or ids), routine prefix (a `routine` policy), budget (max items, max minutes), cooldown days, enabled.
- Saving runs `ensureWorkItems` for the chosen targets.
- "Create routine token" (F7 `createToken` with `routine:<id>`).
- "Copy routine prompt" produces the text to paste into Claude's routine setup. `routine-prompt.ts` exports `routinePrompt(r: Routine): string`:

```ts
export function routinePrompt(r: { $id: string; name: string; maxItems: number; maxMinutes: number }): string {
  return [
    `You are running the "${r.name}" routine for our team. Use the "commons" MCP connector.`,
    `1. Call list_work with routineId "${r.$id}".`,
    `2. Take the first item: call claim, then get_skill, and follow the returned instructions exactly.`,
    `3. Call heartbeat at least every 30 minutes on long items.`,
    `4. Finish each item with complete (summary + branch URL) or fail (reason). If an item should not be done, call skip with a reason.`,
    `5. Stop after ${r.maxItems} items or ${r.maxMinutes} minutes, or when list_work is empty.`,
  ].join("\n");
}
```

Test:

```ts
import { it, expect } from "vitest";
import { routinePrompt } from "../routine-prompt";

it("includes routine id and budget", () => {
  const p = routinePrompt({ $id: "r1", name: "Nightly audit", maxItems: 5, maxMinutes: 90 });
  expect(p).toContain('routineId "r1"');
  expect(p).toContain("Stop after 5 items or 90 minutes");
});
```

**Acceptance:** creating a routine for 5 targets makes 5 work items; the copied prompt and token are enough to set up a Claude routine.

### F10 — Demo: one real routine end to end

**Depends on:** all.

- [ ] Add a real skill (for example the Rando SEO audit) and approve it. Check its `requires` against what a routine's cloud workspace has.
- [ ] Register 3–5 real targets.
- [ ] Create the routine, its token, and set up the Claude routine with our connector (request headers if available, see `TECH.md` §6; otherwise the agreed fallback).
- [ ] Trigger a run, watch the board, open the result branches.
- [ ] Run a teammate's on-demand session at the same time to show no double work.
- [ ] Record the demo and note anything that broke as issues.

**Acceptance:** at least 3 targets done by the routine with branches linked on the board, and one collision prevented on camera.

---

## 5. Later (not in this plan)

GitHub sign-in (Appwrite OAuth) · OAuth for the MCP endpoint (Better Auth MCP plugin or Clerk) if request headers are unavailable · CodeMirror skill editor · realtime board · spare-limit planner · multiple teams · shared template library between teams · clan mode (`POSITIONING.md`, `security/SECURITY.md`).

## 6. Open questions that affect features

| Question | Affects | Default until decided |
|---|---|---|
| Does our claude.ai organization have connector request headers? | F7, F10 | Build header auth; decide the fallback before F10. |
| Is a skill done once per target or repeatedly? | F5 cooldown, F9 | Per-routine `cooldownDays` (0 = done once until a lead resets it). `listEligible` passes the routine's value; for on-demand calls without a routine, use 0. |
| Who may write skills: lead only or members too? | F2 | Lead edits, members suggest. |
| Results only as branches, or also comments/report pages? | F7 `complete` | Branch URL + summary. |
| How long is a lease? | F5 | 120 minutes, routine prompt heartbeats every 30. |
