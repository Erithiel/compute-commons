# Accounts and Teams Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Real accounts and teams: people sign up with email and password, create a team (and become its lead) or join one through an invite link, and every piece of data belongs to one team.

**Architecture:** Appwrite Auth holds the accounts. Our server logs in with the API key client, gets a session secret and keeps it in an httpOnly cookie (Appwrite's SSR pattern). Teams, memberships and invites are rows in our own TablesDB tables; every row carries `teamId` and every query filters by the signed-in member's team. `TEAM_ID` disappears from the environment.

**Tech Stack:** Next.js 16.4.2 (App Router, server actions, `proxy.ts`), `node-appwrite` 22.1.3 (Account, Users, TablesDB) against Appwrite 1.8.1, vitest. No new dependencies.

**Spec:** `IDEA.md` §7 (roles), `TECH.md` §3 (data model) and §5 (auth), `DECISIONS.md`, and F1 in `docs/superpowers/plans/2026-10-17-team-mode-features.md`, which this plan replaces and extends with team creation.

## Decisions this plan makes (change them before starting if you disagree)

| # | Decision | Why | Alternative |
|---|---|---|---|
| A | **Anyone can sign up**; a new account has no team until it creates one or opens an invite link. | Lets a new team start alone, with no admin step. | Invite-only signup (an env flag); add it when the app is public. |
| B | **One team per account** in v1, enforced by a unique index on `members.userId`. | No team switcher and no "which team is this token for" question. The data model already allows more later. | Several teams per person, with a team switcher. |
| C | **Invites are one-time links** (`/join/<code>`, valid 7 days, only a hash stored). | Needs no email server. Appwrite's email invites need SMTP on api.rando.ge, which we have not confirmed. | Appwrite Teams email invites once SMTP is set up. |
| D | **Our own `teams` / `members` tables, not Appwrite Teams.** | `members` already holds the role, and every query needs `teamId` from our rows. Appwrite Teams would be a second copy of the same thing. | Appwrite Teams for membership. |
| E | **Our own login throttle** (5 failures per email per 15 minutes). | Calls made with the API key skip Appwrite's built-in rate limits, so login through our server would otherwise be unthrottled. | None; this is a security requirement. |
| F | **No email verification and no password reset email in v1.** | Both need SMTP. Access comes from invite links, so who owns the email address does not decide access. | Add both when SMTP is configured ("Later"). |

## Global Constraints

- The browser never talks to Appwrite. All calls are server-side.
- No new dependencies.
- **Every table except `teams`, `login_attempts` and `claim_takeovers` has a `teamId` column, and every read and write filters by the caller's `teamId`.** A row from another team is treated as "not found".
- One team per account (unique index on `members.userId`).
- Session cookie: name from `SESSION_COOKIE_NAME`; `httpOnly`, `sameSite: "lax"`, `path: "/"`, `secure` in production, expiring with the Appwrite session.
- Store only SHA-256 hashes of invite codes and API tokens. Invite codes are one-time and valid for 7 days.
- Post-login redirects (`?next=`) accept only same-site paths (`/x`, never `//x` or `https://…`).
- A team always keeps at least one lead (role changes, removals and leaving are refused otherwise).
- Every change to teams, members, invites, roles and tokens writes an audit entry.
- **File ownership:** a separate session is reworking the UI (`app/(app)/**`, `components/**`, `globals.css`). Tasks 6 and 7 must edit some of those files: keep their markup minimal, use the existing primitives from `components/ui.tsx`, and tell the UI session which files changed.

---

## File map

| File | Status | Responsibility |
|---|---|---|
| `web/lib/tables.ts` | modify | add `T.teams`, `T.invites`, `T.loginAttempts`; remove `TEAM_ID` |
| `web/lib/types.ts` | modify | add `Team`, `Invite`; `teamId` on `TaskVersion`, `MemberNote`, `Claim`, `Log`, `ApiToken`, `Caller` |
| `web/scripts/setup-appwrite.ts` | modify | new tables and columns; `--adopt-team`; `--sample` takes a team id |
| `web/scripts/sample.ts` | modify | the sample rows get `teamId` |
| `web/lib/team-rules.ts` | create | pure rules: invite codes, invite validity, keeping one lead, login throttle, safe `next` |
| `web/lib/__tests__/team-rules.test.ts` | create | tests for the rules |
| `web/lib/appwrite.ts` | modify | `adminAccount()`, `teamRow()` |
| `web/lib/auth.ts` | rewrite | sign up, sign in, sign out, `getUser`, `getMember`, `requireMember`, `requireLead` |
| `web/lib/teams.ts` | create | `createTeam`, `createInvite`, `joinTeam`, `changeRole`, `removeMember` |
| `web/lib/claims.ts`, `tasks.ts`, `tokens.ts`, `audit.ts`, `mock.ts` | modify | scope to `teamId` |
| `web/app/actions.ts` | modify | use `me.teamId`; member and invite actions |
| `web/app/(auth)/actions.ts` | create | `login`, `signup`, `logout`, `newTeam`, `acceptInvite` |
| `web/app/(auth)/login/page.tsx`, `signup/page.tsx`, `welcome/page.tsx`, `join/[code]/page.tsx` | modify/create | auth pages |
| `web/components/auth-forms.tsx` | create | client forms that show action errors |
| `web/proxy.ts` | create | early redirect to `/login` when there is no session cookie |
| `web/app/(app)/layout.tsx` | modify (UI session's file) | real guard, team name, remove the mock "Signed in as" switcher |
| `web/app/(app)/settings/page.tsx` | modify (UI session's file) | invite links, roles, remove, leave team |
| `web/scripts/link-member.ts` | create | attach an existing (sample) member row to a real account |
| `web/scripts/race-test.ts` | modify | caller carries `teamId` instead of reading env |
| `TECH.md`, `DECISIONS.md`, feature plan | modify | docs |

---

### Task 1: Schema: teams, invites, login attempts, `teamId` everywhere

**Files:**
- Modify: `web/lib/tables.ts`, `web/lib/types.ts`, `web/scripts/setup-appwrite.ts`, `web/scripts/sample.ts`

**Interfaces:**
- Produces: `T.teams = "teams"`, `T.invites = "invites"`, `T.loginAttempts = "login_attempts"`; the types `Team` and `Invite`; `teamId: string` on `TaskVersion`, `MemberNote`, `Claim`, `Log`, `ApiToken` and `Caller`. The settings row id becomes the team id (it was `"settings"`).

- [ ] **Step 1: Add the table ids** in `web/lib/tables.ts`. Keep `TEAM_ID` for now; Task 4 removes it.

```ts
export const T = {
  members: "members", tasks: "tasks", taskVersions: "task_versions", taskItems: "task_items", memberNotes: "member_notes",
  claims: "claims", takeovers: "claim_takeovers", logs: "logs", settings: "settings", apiTokens: "api_tokens", audit: "audit_log",
  teams: "teams", invites: "invites", loginAttempts: "login_attempts",
} as const;
```

- [ ] **Step 2: Types** in `web/lib/types.ts`. Add these two, and add `teamId: string;` as the second field of `TaskVersion`, `MemberNote`, `Claim`, `Log` and `ApiToken`.

```ts
export interface Team { $id: string; name: string; createdBy: string /* Appwrite user id */; createdAt: string }

/** One-time link to join a team. Only the hash of the code is stored. */
export interface Invite {
  $id: string; teamId: string; codeHash: string; role: Role; createdBy: string /* memberId */;
  expiresAt: string; usedBy: string | null /* memberId */; usedAt: string | null; revoked: boolean;
}

export type Caller =
  { kind: "member"; memberId: string; teamId: string; role: Role; scheduled: boolean };
```

- [ ] **Step 3: Schema.** In `SCHEMA` in `web/scripts/setup-appwrite.ts`:
  - add `id("teamId", false)` as the first column and `{ key: "team", type: "key", columns: ["teamId"] }` as an index of `task_versions`, `member_notes`, `claims`, `logs` and `api_tokens` (not required: a new required column cannot be added to a table that already has rows);
  - add `{ key: "user", type: "unique", columns: ["userId"] }` to `members` (one team per account);
  - add the three tables below.

```ts
  [T.teams]: {
    name: "Teams",
    columns: [{ key: "name", type: "varchar", size: 128, required: true }, id("createdBy"), at("createdAt")],
    indexes: [],
  },
  [T.invites]: {
    name: "Invites",
    columns: [id("teamId"), { key: "codeHash", type: "varchar", size: 64, required: true },
      { key: "role", type: "enum", elements: ["lead", "member"], required: true }, id("createdBy"), at("expiresAt"),
      id("usedBy", false), at("usedAt", false), { key: "revoked", type: "boolean", required: false, default: false }],
    indexes: [{ key: "code", type: "unique", columns: ["codeHash"] }, { key: "team", type: "key", columns: ["teamId"] }],
  },
  [T.loginAttempts]: {
    name: "Login attempts", // row id = emailKey(email); see lib/team-rules.ts
    columns: [{ key: "fails", type: "integer", required: false, default: 0 }, at("windowStart")],
    indexes: [],
  },
```

- [ ] **Step 4: `--adopt-team <id> <name>`** in `setup-appwrite.ts`, to move the existing single-team data under a real team. Call it from `main()` after the schema loop, when `process.argv.includes("--adopt-team")`:

```ts
/** One-off: the data created while TEAM_ID was an env var becomes team <id>. Safe to run twice. */
async function adoptTeam(teamId: string, name: string) {
  try { await db.getRow(DB_ID, T.teams, teamId); } catch (e) {
    if (!notFound(e)) throw e;
    await db.createRow(DB_ID, T.teams, teamId, { name, createdBy: "migration", createdAt: new Date().toISOString() });
    console.log(`+ team ${teamId}`);
  }
  // Settings: one row per team, id = team id.
  try { await db.getRow(DB_ID, T.settings, teamId); } catch (e) {
    if (!notFound(e)) throw e;
    const old = await db.getRow(DB_ID, T.settings, "settings").catch(() => null);
    await db.createRow(DB_ID, T.settings, teamId, { teamId, policy: old?.policy ?? DEFAULT_POLICY });
    if (old) await db.deleteRow(DB_ID, T.settings, "settings");
    console.log(`+ settings ${teamId}`);
  }
  // Backfill teamId where it is still empty.
  for (const table of [T.taskVersions, T.memberNotes, T.claims, T.logs, T.apiTokens]) {
    const rows = (await db.listRows(DB_ID, table, [Query.isNull("teamId"), Query.limit(500)])).rows;
    for (const r of rows) await db.updateRow(DB_ID, table, r.$id, { teamId });
    if (rows.length) console.log(`~ ${rows.length} rows in ${table} → ${teamId}`);
  }
}
```

  Wire it up as `const adopt = process.argv.indexOf("--adopt-team"); if (adopt > 0) await adoptTeam(process.argv[adopt + 1], process.argv[adopt + 2] ?? process.argv[adopt + 1]);` (not `at`: that name is the datetime-column helper). Also stop creating the old `"settings"` row in `main()`: settings rows are now created by `createTeam` (Task 5) and `adoptTeam`. Import `Query` from `node-appwrite`.

- [ ] **Step 5: Sample data gets `teamId`.** In `web/scripts/sample.ts`, add `teamId: TEAM` to every version, note, claim and log row, and also create `{ $id: TEAM, name: "Rando", createdBy: "sample", createdAt: ago(7 * 24 * H) }` in `T.teams` and the settings row `{ $id: TEAM, teamId: TEAM, policy: DEFAULT_POLICY }`. Read the team id from `--team <id>` (default `"rando"`) instead of `process.env.TEAM_ID`: change `sample()` to `sample(team: string)`.

- [ ] **Step 6: Run the migration on api.rando.ge and check it is idempotent.**

```bash
cd web
npm run setup:appwrite -- --adopt-team rando "Rando"
npm run setup:appwrite -- --adopt-team rando "Rando"   # second run: no "+" or "~" lines
npx tsc --noEmit                                       # expect errors only where Caller/teamId is now required; Task 4 fixes them
```

Expected: `+ table teams`, `+ table invites`, `+ table login_attempts`, the new columns and indexes, `+ team rando`, `+ settings rando`, and backfill lines. The second run prints only `Schema is up to date.`

- [ ] **Step 7: Commit**

```bash
git add web/lib/tables.ts web/lib/types.ts web/scripts/setup-appwrite.ts web/scripts/sample.ts
git commit -m "feat(teams): schema for teams, invites, login attempts; teamId on every table"
```

---

### Task 2: Pure rules (tested)

**Files:**
- Create: `web/lib/team-rules.ts`, `web/lib/__tests__/team-rules.test.ts`

**Interfaces:**
- Consumes: `Invite`, `Member`, `Role` from Task 1.
- Produces: `INVITE_DAYS`, `newInviteCode(): string`, `hashCode(code: string): string`, `inviteProblem(inv: Invite | null, now: Date): string | null`, `leadProblem(members: Member[], targetId: string, change: Role | "remove"): string | null`, `LOGIN_MAX_FAILS`, `LOGIN_WINDOW_MS`, `emailKey(email: string): string`, `loginLocked(a: { fails: number; windowStart: string } | null, now: Date): boolean`, `safeNext(next: string | null | undefined, fallback: string): string`.

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, it, expect } from "vitest";
import { emailKey, hashCode, inviteProblem, leadProblem, loginLocked, newInviteCode, safeNext } from "../team-rules";
import type { Invite, Member } from "../types";

const now = new Date("2026-10-20T12:00:00Z");
const inv = (o: Partial<Invite> = {}): Invite => ({
  $id: "v1", teamId: "t1", codeHash: "h", role: "member", createdBy: "m1",
  expiresAt: "2026-10-25T12:00:00Z", usedBy: null, usedAt: null, revoked: false, ...o,
});
const mem = (id: string, role: Member["role"]): Member => ({ $id: id, teamId: "t1", userId: `u${id}`, name: id, role });

describe("invites", () => {
  it("codes are random, url-safe, and stored only as a hash", () => {
    const a = newInviteCode(), b = newInviteCode();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[A-Za-z0-9_-]{24}$/);
    expect(hashCode(a)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashCode(a)).toBe(hashCode(a));
  });
  it("a fresh invite is usable", () => expect(inviteProblem(inv(), now)).toBeNull());
  it("missing, revoked, used and expired invites are refused", () => {
    expect(inviteProblem(null, now)).toMatch(/not valid/);
    expect(inviteProblem(inv({ revoked: true }), now)).toMatch(/not valid/);
    expect(inviteProblem(inv({ usedBy: "m9", usedAt: "2026-10-19T00:00:00Z" }), now)).toMatch(/already used/);
    expect(inviteProblem(inv({ expiresAt: "2026-10-20T11:59:59Z" }), now)).toMatch(/expired/);
  });
});

describe("a team keeps at least one lead", () => {
  const team = [mem("a", "lead"), mem("b", "member")];
  it("the only lead cannot be demoted, removed or leave", () => {
    expect(leadProblem(team, "a", "member")).toMatch(/at least one lead/);
    expect(leadProblem(team, "a", "remove")).toMatch(/at least one lead/);
  });
  it("with two leads, one can step down", () => {
    expect(leadProblem([...team, mem("c", "lead")], "a", "remove")).toBeNull();
  });
  it("members can be changed freely", () => {
    expect(leadProblem(team, "b", "lead")).toBeNull();
    expect(leadProblem(team, "b", "remove")).toBeNull();
  });
  it("unknown member", () => expect(leadProblem(team, "zz", "remove")).toMatch(/not found/));
});

describe("login throttle", () => {
  it("emailKey ignores case and spaces and is a valid row id", () => {
    expect(emailKey(" Nino@Rando.ge ")).toBe(emailKey("nino@rando.ge"));
    expect(emailKey("x@y.z")).toMatch(/^[0-9a-f]{36}$/);
  });
  it("locks after 5 failures inside 15 minutes, then unlocks", () => {
    expect(loginLocked(null, now)).toBe(false);
    expect(loginLocked({ fails: 4, windowStart: "2026-10-20T11:50:00Z" }, now)).toBe(false);
    expect(loginLocked({ fails: 5, windowStart: "2026-10-20T11:50:00Z" }, now)).toBe(true);
    expect(loginLocked({ fails: 9, windowStart: "2026-10-20T11:40:00Z" }, now)).toBe(false);
  });
});

it("safeNext only allows same-site paths", () => {
  expect(safeNext("/join/abc", "/board")).toBe("/join/abc");
  expect(safeNext("//evil.com", "/board")).toBe("/board");
  expect(safeNext("https://evil.com", "/board")).toBe("/board");
  expect(safeNext("/\\evil.com", "/board")).toBe("/board");
  expect(safeNext(null, "/board")).toBe("/board");
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `cd web && npx vitest run lib/__tests__/team-rules.test.ts`
Expected: FAIL, `Cannot find module '../team-rules'`.

- [ ] **Step 3: Implement** `web/lib/team-rules.ts`

```ts
// Pure rules for accounts and teams. No I/O, so they are unit tested.
import { createHash, randomBytes } from "node:crypto";
import type { Invite, Member, Role } from "./types";

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

export const INVITE_DAYS = 7;
export const newInviteCode = () => randomBytes(18).toString("base64url"); // 24 url-safe chars
export const hashCode = (code: string) => sha256(code);

/** Why an invite cannot be used, or null if it can. */
export function inviteProblem(inv: Invite | null, now: Date): string | null {
  if (!inv || inv.revoked) return "This invite link is not valid.";
  if (inv.usedBy) return "This invite link was already used. Ask your lead for a new one.";
  if (new Date(inv.expiresAt).getTime() <= now.getTime()) return "This invite link has expired. Ask your lead for a new one.";
  return null;
}

/** Why a role change / removal / leaving is refused, or null. A team always keeps one lead. */
export function leadProblem(members: Member[], targetId: string, change: Role | "remove"): string | null {
  const target = members.find((m) => m.$id === targetId);
  if (!target) return "Member not found.";
  const leads = members.filter((m) => m.role === "lead").length;
  if (target.role === "lead" && change !== "lead" && leads === 1) return "A team needs at least one lead. Make someone else lead first.";
  return null;
}

export const LOGIN_MAX_FAILS = 5;
export const LOGIN_WINDOW_MS = 15 * 60_000;
/** Row id for login_attempts: Appwrite ids are at most 36 chars. */
export const emailKey = (email: string) => sha256(email.trim().toLowerCase()).slice(0, 36);
export const loginLocked = (a: { fails: number; windowStart: string } | null, now: Date) =>
  !!a && a.fails >= LOGIN_MAX_FAILS && now.getTime() - new Date(a.windowStart).getTime() < LOGIN_WINDOW_MS;

/** Only same-site paths: blocks open redirects through ?next=. */
export const safeNext = (next: string | null | undefined, fallback: string) =>
  next && /^\/(?![/\\])/.test(next) ? next : fallback;
```

- [ ] **Step 4: Run the tests and check they pass**

Run: `cd web && npx vitest run`
Expected: all tests pass, the old 13 and the new ones.

- [ ] **Step 5: Commit**

```bash
git add web/lib/team-rules.ts web/lib/__tests__/team-rules.test.ts
git commit -m "feat(teams): invite, lead, login-throttle and redirect rules"
```

---

### Task 3: Sessions (`lib/auth.ts`)

**Files:**
- Modify: `web/lib/appwrite.ts`
- Rewrite: `web/lib/auth.ts`

**Interfaces:**
- Consumes: `emailKey`, `loginLocked`, `LOGIN_WINDOW_MS` (Task 2); `T.loginAttempts` (Task 1).
- Produces: `adminAccount(): Account`; `teamRow<R>(table, id, teamId): Promise<R | null>`; `signUp(name, email, password): Promise<string | null>` and `signIn(email, password): Promise<string | null>` (an error message, or null on success); `signOut(): Promise<void>`; `getUser(): Promise<Models.User | null>`; `getMember(): Promise<Member | null>`; `requireMember()`; `requireLead()` (the last two throw `Error("Forbidden")`, as today).

- [ ] **Step 1: Two helpers in `web/lib/appwrite.ts`**

```ts
/** Account service with the API key: only for createEmailPasswordSession (it returns the session secret only to an API key). */
export const adminAccount = () => new Account(admin());

/** A row that belongs to this team, or null (a row of another team counts as missing). */
export async function teamRow<R extends { teamId: string }>(table: string, id: string, teamId: string): Promise<R | null> {
  const r = await rowOrNull<R>(table, id);
  return r?.teamId === teamId ? r : null;
}
```

- [ ] **Step 2: Rewrite `web/lib/auth.ts`**

```ts
// Accounts are Appwrite users. Our server creates the session with the API key and keeps its secret in an
// httpOnly cookie; every later request acts as that user. API-key calls skip Appwrite's rate limits,
// so failed logins are counted here (login_attempts).
import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { ID, Query, type Models } from "node-appwrite";
import { adminAccount, adminTables, adminUsers, allRows, DB_ID, isCode, rowOrNull, sessionAccount, T } from "./appwrite";
import { emailKey, LOGIN_WINDOW_MS, loginLocked } from "./team-rules";
import type { Member } from "./types";

const COOKIE = process.env.SESSION_COOKIE_NAME ?? "commons_session";
type Attempt = { $id: string; fails: number; windowStart: string };

/** Creates the account and signs in. Returns an error message, or null. */
export async function signUp(name: string, email: string, password: string): Promise<string | null> {
  try {
    await adminUsers().create(ID.unique(), email.trim(), undefined, password, name.trim());
  } catch (e) {
    if (isCode(e, 409)) return "An account with this email already exists. Sign in instead.";
    if (isCode(e, 400)) return (e as Error).message; // e.g. password shorter than 8 characters
    throw e;
  }
  return signIn(email, password);
}

/** Returns an error message, or null when the session cookie is set. */
export async function signIn(email: string, password: string): Promise<string | null> {
  const key = emailKey(email);
  const attempt = await rowOrNull<Attempt>(T.loginAttempts, key);
  const now = new Date();
  if (loginLocked(attempt, now)) return "Too many failed attempts. Try again in 15 minutes.";
  try {
    const s = await adminAccount().createEmailPasswordSession(email.trim(), password);
    (await cookies()).set(COOKIE, s.secret, {
      httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", expires: new Date(s.expire),
    });
    if (attempt) await adminTables().deleteRow(DB_ID, T.loginAttempts, key);
    return null;
  } catch (e) {
    if (!isCode(e, 401)) throw e;
    const fresh = !attempt || now.getTime() - new Date(attempt.windowStart).getTime() >= LOGIN_WINDOW_MS;
    await adminTables().upsertRow(DB_ID, T.loginAttempts, key,
      fresh ? { fails: 1, windowStart: now.toISOString() } : { fails: attempt!.fails + 1, windowStart: attempt!.windowStart });
    return "Wrong email or password.";
  }
}

export async function signOut() {
  await (await sessionAccount())?.deleteSession("current").catch(() => {});
  (await cookies()).delete(COOKIE);
}

/** The signed-in Appwrite user, or null (no cookie, or the session expired or was deleted). */
export const getUser = cache(async (): Promise<Models.User<Models.Preferences> | null> => {
  const account = await sessionAccount();
  if (!account) return null;
  try { return await account.get(); } catch { return null; }
});

/** The user's membership (one team per account), or null when they have no team yet. */
export const getMember = cache(async (): Promise<Member | null> => {
  const user = await getUser();
  if (!user) return null;
  return (await allRows<Member>(T.members, [Query.equal("userId", user.$id)]))[0] ?? null;
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
```

- [ ] **Step 3: Typecheck**

Run: `cd web && npx tsc --noEmit`
Expected: errors only in the callers of the old mock login (`app/actions.ts` `signIn`/`signOut`) and the `teamId` errors left from Task 1; Tasks 4 and 6 fix them.

- [ ] **Step 4: Commit**

```bash
git add web/lib/appwrite.ts web/lib/auth.ts
git commit -m "feat(auth): Appwrite email/password sessions with login throttle"
```

---

### Task 4: Scope everything to the caller's team (remove `TEAM_ID`)

**Files:**
- Modify: `web/lib/tables.ts`, `web/lib/claims.ts`, `web/lib/tasks.ts`, `web/lib/tokens.ts`, `web/lib/audit.ts`, `web/lib/mock.ts`, `web/app/actions.ts`, `web/scripts/race-test.ts`

**Interfaces:**
- Consumes: `Caller.teamId` (Task 1), `teamRow`, `getMember` (Task 3).
- Produces (changed signatures, announce them to the team):
  - `audit(teamId: string, actor: string, action: string, entity: string, before?: unknown, after?: unknown)`
  - `saveTask(teamId: string, id: string | null, input: TaskInput, authorId: string)`, `syncItems(teamId: string, taskId: string, rows: string[])`, `saveNote(teamId: string, taskId: string, memberId: string, text: string)`
  - `verifyBearer` returns `Caller` with `teamId`
  - `db()` loads only the signed-in member's team.

- [ ] **Step 1: Remove `TEAM_ID`** from `web/lib/tables.ts` and from the `export { DB_ID, TEAM_ID, T }` line in `appwrite.ts`. Then run `npx tsc --noEmit`: every error is a place that must now take the team from the caller. Fix them as follows.

- [ ] **Step 2: `claims.ts`.** `listEligible` filters with `Query.equal("teamId", caller.teamId)` on tasks, items and claims. `claim` returns `"not-found"` when `item.teamId !== caller.teamId`, and writes `teamId: caller.teamId` into the claim row. `writeLog` adds `teamId: task.teamId` to the log.

- [ ] **Step 3: `tasks.ts`.** Add the `teamId` parameter, as in Interfaces. `saveTask` throws `"Task not found"` when `old.teamId !== teamId`. Every row it creates (task, version, item) gets `teamId`. `noteRow` also filters `Query.equal("teamId", teamId)`, and `saveNote` writes `teamId`.

- [ ] **Step 4: `tokens.ts`.** `createToken(teamId, memberId, name, scheduled)` writes `teamId`. `verifyBearer` returns `{ kind: "member", memberId: member.$id, teamId: member.teamId, role: member.role, scheduled: row.scheduled }`, and returns null if `row.teamId !== member.teamId`.

- [ ] **Step 5: `audit.ts`.** Take `teamId` as the first parameter and write it instead of `TEAM_ID`.

- [ ] **Step 6: `mock.ts` `db()`** loads the signed-in member's team only, and settings by team id:

```ts
export const db = cache(async (): Promise<Store> => {
  await connection();
  const me = await getMember();
  if (!me) throw new Error("Forbidden"); // the (app) layout redirects before this happens
  const team = [Query.equal("teamId", me.teamId)];
  const [members, tasks, taskVersions, taskItems, memberNotes, claims, logs, settings, apiTokens, audit] = await Promise.all([
    allRows<Member>(T.members, team),
    allRows<Task>(T.tasks, [...team, Query.orderAsc("$createdAt")]),
    allRows<TaskVersion>(T.taskVersions, team),
    allRows<TaskItem>(T.taskItems, team),
    allRows<MemberNote>(T.memberNotes, team),
    allRows<Claim>(T.claims, team),
    allRows<Log>(T.logs, [...team, Query.orderDesc("finishedAt"), Query.limit(500)]),
    rowOrNull<Settings>(T.settings, me.teamId),
    allRows<ApiToken>(T.apiTokens, team),
    allRows<AuditEntry>(T.audit, [...team, Query.orderDesc("at"), Query.limit(200)]),
  ]);
  return {
    members, tasks, taskVersions, taskItems, memberNotes, claims, logs, apiTokens, audit,
    settings: settings ?? { $id: me.teamId, teamId: me.teamId, policy: DEFAULT_POLICY },
  };
});
```

  Import `getMember` from `./auth`. `auth.ts` must not import `mock.ts`, so there is no cycle.

- [ ] **Step 7: `app/actions.ts`.**
  - Pass `me.teamId` (or `lead.teamId`) into every service call and every `audit(...)`.
  - Replace each `rowOrNull(T.x, id)` with `teamRow(T.x, id, me.teamId)`.
  - `saveSettings` upserts row id `lead.teamId`.
  - Delete the mock `signIn`/`signOut` and `addMember` (Task 6 moves sign-in and sign-out to `app/(auth)/actions.ts`; Task 7 replaces `addMember` with invites).

- [ ] **Step 8: `race-test.ts`** no longer reads env. Make `const TEAM = "race-test"`, give `bot()` `teamId: TEAM`, write `teamId: TEAM` into its task and item rows, and drop the `assert.equal(TEAM_ID, …)` line. Change the package script to `tsx --env-file=.env.local --conditions=react-server scripts/race-test.ts`, without `TEAM_ID`.

- [ ] **Step 9: Test fixtures.** `Claim` now needs `teamId`: add `teamId: "t",` to the two `Claim` literals in `web/lib/__tests__/claims.test.ts`.

- [ ] **Step 10: Verify**

```bash
cd web
npx tsc --noEmit        # clean except the pages that import signIn/signOut (Task 6)
npx vitest run          # all pass
npm run race-test       # 4 ✓ lines
```

- [ ] **Step 11: Commit**

```bash
git add web/lib web/app/actions.ts web/scripts/race-test.ts web/package.json
git commit -m "feat(teams): scope all data to the caller's team; drop TEAM_ID"
```

---

### Task 5: Team service (`lib/teams.ts`)

**Files:**
- Create: `web/lib/teams.ts`

**Interfaces:**
- Consumes: `teamRow`, `allRows`, `audit(teamId, …)`, the rules from Task 2.
- Produces:
  - `createTeam(user: { $id: string; name: string; email: string }, name: string): Promise<string>`: returns the team id.
  - `createInvite(lead: Member, role: Role): Promise<{ code: string; invite: Invite }>`
  - `findInvite(code: string): Promise<{ invite: Invite; team: Team } | null>`
  - `joinTeam(user: { $id: string; name: string; email: string }, code: string): Promise<string | null>`: an error message, or null.
  - `changeRole(lead: Member, memberId: string, role: Role): Promise<string | null>`
  - `removeMember(actor: Member, memberId: string): Promise<string | null>`: a lead removing someone, or anyone removing themselves (leaving).

- [ ] **Step 1: Implement**

```ts
// Teams, memberships and invites. Checks that need the database live here; pure rules are in team-rules.ts.
import "server-only";
import { ID, Query } from "node-appwrite";
import { adminTables, allRows, DB_ID, isCode, T, teamRow } from "./appwrite";
import { audit } from "./audit";
import { DEFAULT_POLICY } from "./tables";
import { hashCode, INVITE_DAYS, inviteProblem, leadProblem, newInviteCode } from "./team-rules";
import type { Invite, Member, Role, Team } from "./types";

const db = () => adminTables();
const now = () => new Date().toISOString();
type User = { $id: string; name: string; email: string };
const ALREADY = "You are already in a team. Leave it first (Settings) to join another.";

/** The creator becomes the team's first lead. The member row goes first: its unique userId index stops double teams. */
export async function createTeam(user: User, name: string): Promise<string> {
  const teamId = ID.unique();
  const member = { teamId, userId: user.$id, name: user.name || user.email, role: "lead" as const };
  const row = await db().createRow(DB_ID, T.members, ID.unique(), member); // 409 → already in a team (caller shows ALREADY)
  await db().createRow(DB_ID, T.teams, teamId, { name: name.trim(), createdBy: user.$id, createdAt: now() });
  await db().createRow(DB_ID, T.settings, teamId, { teamId, policy: DEFAULT_POLICY });
  await audit(teamId, row.$id, "team.create", teamId, undefined, { name });
  return teamId;
}

export async function createInvite(lead: Member, role: Role) {
  const code = newInviteCode();
  const data = {
    teamId: lead.teamId, codeHash: hashCode(code), role, createdBy: lead.$id,
    expiresAt: new Date(Date.now() + INVITE_DAYS * 86_400_000).toISOString(), usedBy: null, usedAt: null, revoked: false,
  };
  const row = await db().createRow(DB_ID, T.invites, ID.unique(), data);
  await audit(lead.teamId, lead.$id, "invite.create", row.$id, undefined, { role });
  return { code, invite: row as unknown as Invite };
}

export async function findInvite(code: string) {
  const [invite] = await allRows<Invite>(T.invites, [Query.equal("codeHash", hashCode(code))]);
  if (!invite) return null;
  const team = (await db().getRow(DB_ID, T.teams, invite.teamId)) as unknown as Team;
  return { invite, team };
}

// ponytail: two people opening the same link in the same instant could both join (check, then mark used).
// The link is secret and one-time; a lock row (as in claims) if this ever matters.
export async function joinTeam(user: User, code: string): Promise<string | null> {
  const found = await findInvite(code);
  const problem = inviteProblem(found?.invite ?? null, new Date());
  if (problem) return problem;
  const { invite } = found!;
  let row;
  try {
    row = await db().createRow(DB_ID, T.members, ID.unique(), { teamId: invite.teamId, userId: user.$id, name: user.name || user.email, role: invite.role });
  } catch (e) {
    if (isCode(e, 409)) return ALREADY;
    throw e;
  }
  await db().updateRow(DB_ID, T.invites, invite.$id, { usedBy: row.$id, usedAt: now() });
  await audit(invite.teamId, row.$id, "member.join", row.$id, undefined, { role: invite.role, invite: invite.$id });
  return null;
}

export async function changeRole(lead: Member, memberId: string, role: Role): Promise<string | null> {
  const members = await allRows<Member>(T.members, [Query.equal("teamId", lead.teamId)]);
  const problem = leadProblem(members, memberId, role);
  if (problem) return problem;
  const before = members.find((m) => m.$id === memberId)!.role;
  await db().updateRow(DB_ID, T.members, memberId, { role });
  await audit(lead.teamId, lead.$id, "member.role", memberId, before, role);
  return null;
}

/** A lead removes someone, or anyone removes themselves (leave team). Their MCP tokens stop working with the row. */
export async function removeMember(actor: Member, memberId: string): Promise<string | null> {
  if (actor.role !== "lead" && actor.$id !== memberId) return "Only a lead can remove someone else.";
  const members = await allRows<Member>(T.members, [Query.equal("teamId", actor.teamId)]);
  const problem = leadProblem(members, memberId, "remove");
  if (problem) return problem;
  const target = members.find((m) => m.$id === memberId)!;
  await db().deleteRow(DB_ID, T.members, memberId);
  for (const t of await allRows<{ $id: string }>(T.apiTokens, [Query.equal("owner", memberId)]))
    await db().updateRow(DB_ID, T.apiTokens, t.$id, { revoked: true });
  await audit(actor.teamId, actor.$id, actor.$id === memberId ? "member.leave" : "member.remove", memberId, target);
  return null;
}

export async function revokeInvite(lead: Member, inviteId: string) {
  const inv = await teamRow<Invite>(T.invites, inviteId, lead.teamId);
  if (!inv) return;
  await db().updateRow(DB_ID, T.invites, inv.$id, { revoked: true });
  await audit(lead.teamId, lead.$id, "invite.revoke", inv.$id);
}
```

  `createTeam` lets the 409 from the members insert propagate. The action (Task 6) catches it with `isCode(e, 409)` and shows `ALREADY`, so export `ALREADY` as well.

- [ ] **Step 2: Typecheck and run the tests**

Run: `cd web && npx tsc --noEmit && npx vitest run`
Expected: no new errors from `lib/teams.ts`; all tests pass.

- [ ] **Step 3: Commit**

```bash
git add web/lib/teams.ts
git commit -m "feat(teams): create team, invite links, join, roles, remove/leave"
```

---

### Task 6: Auth pages, guard and proxy

**Files:**
- Create: `web/app/(auth)/actions.ts`, `web/components/auth-forms.tsx`, `web/app/(auth)/signup/page.tsx`, `web/app/(auth)/welcome/page.tsx`, `web/app/(auth)/join/[code]/page.tsx`, `web/proxy.ts`
- Modify: `web/app/(auth)/login/page.tsx`, `web/app/(app)/layout.tsx` (UI session's file: tell them)

**Interfaces:**
- Consumes: `signIn`, `signUp`, `signOut`, `getUser`, `getMember` (Task 3); `createTeam`, `findInvite`, `joinTeam`, `ALREADY` (Task 5); `safeNext`, `inviteProblem` (Task 2).
- Produces: routes `/login`, `/signup`, `/welcome`, `/join/[code]`; actions `login`, `signup`, `logout`, `newTeam`, `acceptInvite`.

- [ ] **Step 1: `web/app/(auth)/actions.ts`**

```ts
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
```

- [ ] **Step 2: `web/components/auth-forms.tsx`.** This is one client wrapper, so each page stays a server component and errors still show.

```tsx
"use client";
import { useActionState, type ReactNode } from "react";

type State = { error: string } | null;

/** A form bound to a server action that returns { error } on failure. */
export function ActionForm({ action, children, className }: {
  action: (s: State, f: FormData) => Promise<State>; children: ReactNode; className?: string;
}) {
  const [state, run, pending] = useActionState(action, null);
  return (
    <form action={run} className={className}>
      <fieldset disabled={pending} className="space-y-4">{children}</fieldset>
      {state?.error && <p role="alert" className="mt-3 text-sm text-red-600 dark:text-red-400">{state.error}</p>}
    </form>
  );
}
```

- [ ] **Step 3: Pages.** Each uses `ActionForm` with the existing classes (`input`, `label`, `btnPrimary`, `Mark`) and the card wrapper from the current login page. Required fields:
  - `/login` (replaces the mock): `email`, `password`, hidden `next` (from `searchParams.next`), button "Sign in", and a link "No account? Create one" to `/signup?next=…`. Remove the mock member `<select>`.
  - `/signup`: `name`, `email`, `password` (`minLength={8}`, `autoComplete="new-password"`), hidden `next`, button "Create account", and a link to `/login?next=…`.
  - `/welcome`: if there is no user, `redirect("/login")`; if there is a member, `redirect("/board")`. Show the form `team` (team name) with "Create team". Below it: "Joining an existing team? Open the invite link your lead sent you."
  - `/join/[code]`: `const found = await findInvite(code)`, then `inviteProblem(found?.invite ?? null, new Date())`. If there's a problem, show it. If there's no user, show "You're invited to **{team.name}** as {role}" with links to `/signup?next=/join/{code}` and `/login?next=/join/{code}`. If there's a user, show the same line and an `ActionForm` with hidden `code` and the button "Join {team.name}".

  `/login`, `/signup` and `/welcome` read request data, so wrap their body in `<Suspense>` or call `await connection()`, as `(app)` does (cacheComponents is on).

- [ ] **Step 4: Real guard in `web/app/(app)/layout.tsx`.** This is the UI session's file, so change only these lines:

```tsx
const user = await getUser();
if (!user) redirect("/login");
const me = await getMember();
if (!me) redirect("/welcome");
```

  - Replace the "team rando" + "mock data" badge with the team name: `const team = await rowOrNull<Team>(T.teams, me.teamId)`, then `{team?.name}`.
  - Delete the mock "Signed in as" `<form action={signIn}>` switcher.
  - Point the sign-out form at `logout` from `@/app/(auth)/actions`.

- [ ] **Step 5: `web/proxy.ts`**, an early redirect only; the layout above is the real check:

```ts
import { NextResponse, type NextRequest } from "next/server";

const COOKIE = process.env.SESSION_COOKIE_NAME ?? "commons_session";

/** Optimistic: no session cookie → /login. Pages still verify the session (lib/auth.ts). */
export function proxy(req: NextRequest) {
  if (req.cookies.has(COOKIE)) return;
  const login = new URL("/login", req.url);
  login.searchParams.set("next", req.nextUrl.pathname);
  return NextResponse.redirect(login);
}

export const config = {
  // Everything except the auth pages, the MCP endpoint (bearer tokens) and static files.
  matcher: ["/((?!login|signup|join|api/mcp|_next|favicon.ico|.*\\..*).*)"],
};
```

- [ ] **Step 6: Verify in the browser** (dev server on 3123):
  1. `/board` while signed out → `/login?next=/board`.
  2. `/signup` with a new email → `/welcome` → create team "Test team" → `/board` shows an empty board and the sidebar says "Test team".
  3. Sign out, then sign in with a wrong password 5 times → the 6th try says "Too many failed attempts", even with the right password.
  4. `/login?next=//evil.com` → after signing in you land on `/board`.
  5. `npx tsc --noEmit && npm run lint && npx vitest run` are clean.

- [ ] **Step 7: Commit**

```bash
git add web/app/(auth) web/components/auth-forms.tsx web/proxy.ts "web/app/(app)/layout.tsx"
git commit -m "feat(auth): sign up, sign in, create team, join by link; real guard"
```

---

### Task 7: Members and invites in Settings

**Files:**
- Modify: `web/app/actions.ts`, `web/app/(app)/settings/page.tsx` (UI session's file: tell them), `web/components/client.tsx` (add `InviteForm`; also the UI session's file)

**Interfaces:**
- Consumes: `createInvite`, `revokeInvite`, `changeRole`, `removeMember` (Task 5).
- Produces: actions `makeInvite(_, f): Promise<{ link: string } | { error: string } | null>`, `cancelInvite(f)`, `setRole(f)`, `removeMember(f)`, `leaveTeam()`.

- [ ] **Step 1: Actions** in `web/app/actions.ts`. Add `APP_URL=http://localhost:3123` to `.env.example` and `.env.local`; it is the deployed URL in production.

```ts
export async function makeInvite(_: unknown, f: FormData): Promise<{ link: string } | { error: string } | null> {
  const lead = await requireLead();
  const { code } = await createInvite(lead, str(f, "role") === "lead" ? "lead" : "member");
  done();
  return { link: `${process.env.APP_URL}/join/${code}` }; // shown once, never stored
}
export async function cancelInvite(f: FormData) {
  await revokeInvite(await requireLead(), str(f, "id"));
  done();
}
export async function setRole(f: FormData) {
  const error = await changeRole(await requireLead(), str(f, "id"), role(f));
  if (error) throw new Error(error);
  done();
}
export async function removeMember(f: FormData) {
  const error = await removeMemberRow(await requireLead(), str(f, "id"));
  if (error) throw new Error(error);
  done();
}
export async function leaveTeam() {
  const me = await requireMember();
  const error = await removeMemberRow(me, me.$id);
  if (error) throw new Error(error);
  redirect("/welcome");
}
```

  Import `removeMember as removeMemberRow` from `@/lib/teams` to avoid the name clash. Thrown errors show in the nearest `error.tsx`; add `web/app/(app)/error.tsx` (a client component showing `error.message` and a "Back" link) if the UI session has none.

- [ ] **Step 2: `InviteForm`** in `web/components/client.tsx`, modelled on the existing `TokenForm`: a role `<select name="role">` (Member / Lead), a "Create invite link" button and, when the action returns `link`, the link with a `CopyButton` and the text "Send this link to one person. It works once, for 7 days." Show `error` if it is returned.

- [ ] **Step 3: Settings page.** Replace the "add member by name" form with:
  - **Invite** (lead only): `<InviteForm />`, then the pending invites from `allRows<Invite>(T.invites, [Query.equal("teamId", me.teamId), Query.isNull("usedBy"), Query.equal("revoked", false)])` with role, created by, expires, and a "Cancel" button (`cancelInvite`).
  - **Members**: keep the existing role select and remove button, now posting to the new `setRole` / `removeMember`.
  - **Leave team** (anyone): a button posting to `leaveTeam`, with the note "Your MCP tokens stop working."

- [ ] **Step 4: Verify in the browser**
  1. As the lead of "Test team", create an invite link (role Member) and copy it.
  2. In a private window, open the link → "You're invited to Test team" → sign up → Join → the board of Test team.
  3. Open the same link again from a third account → "already used".
  4. As the only lead: demote yourself → refused with "at least one lead". Make the new member lead, then demote yourself → works.
  5. Remove the member → their session lands on `/welcome`; their MCP token (if any) is revoked.
  6. Audit shows `invite.create`, `member.join`, `member.role`, `member.remove`.

- [ ] **Step 5: Commit**

```bash
git add web/app/actions.ts "web/app/(app)/settings/page.tsx" web/components/client.tsx web/.env.example
git commit -m "feat(teams): invite links, roles, remove and leave in Settings"
```

---

### Task 8: Adopt the existing data, and docs

**Files:**
- Create: `web/scripts/link-member.ts`
- Modify: `web/package.json`, `TECH.md`, `DECISIONS.md`, `docs/superpowers/plans/2026-10-17-team-mode-features.md`

- [ ] **Step 1: `web/scripts/link-member.ts`.** The sample members (Rati, Nino, Giorgi) have no real accounts. After a person signs up, this attaches a member row to their account, so they keep its role, notes, logs and tokens.

```ts
// npm run link-member -- <memberId> <email>   e.g. npm run link-member -- m1 you@rando.ge
// The account must exist (sign up first) and must not be in a team yet.
import { Client, Query, TablesDB, Users } from "node-appwrite";
import { DB_ID, T } from "../lib/tables";

async function main() { // no top-level await: the package is CommonJS
  const [memberId, email] = process.argv.slice(2);
  if (!memberId || !email) throw new Error("usage: link-member <memberId> <email>");
  const client = new Client().setEndpoint(process.env.APPWRITE_ENDPOINT!).setProject(process.env.APPWRITE_PROJECT_ID!).setKey(process.env.APPWRITE_API_KEY!);
  const [user] = (await new Users(client).list([Query.equal("email", email)])).users;
  if (!user) throw new Error(`No account for ${email}. Sign up first.`);
  await new TablesDB(client).updateRow(DB_ID, T.members, memberId, { userId: user.$id, name: user.name || email });
  console.log(`${memberId} is now ${email}`);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
```

  Add `"link-member": "tsx --env-file=.env.local scripts/link-member.ts"` to the scripts in `package.json`. If the account already created its own team on `/welcome`, the unique `userId` index refuses the link: remove that member row first.

- [ ] **Step 2: Try it on the real data**
  1. Sign up with your own email; stop at `/welcome` (do not create a team).
  2. `npm run link-member -- m1 <your email>`.
  3. Reload → you are Rati (lead) in team "Rando" with all the sample tasks.

- [ ] **Step 3: Docs**
  - `TECH.md` §3: add the `teams`, `invites` and `login_attempts` tables; note "every table has `teamId`; `settings` row id = team id". §5 Auth: describe the session cookie, the login throttle and invite links, and remove `TEAM_ID`.
  - `DECISIONS.md`: add D26 (sign up, create a team or join by link; one team per account), D27 (invite links instead of email, because there is no SMTP), and D28 (our own login throttle, because API-key calls skip Appwrite's limits).
  - Feature plan: in F1, write "Replaced by `2026-10-17-accounts-and-teams.md`". In "Current state", write "login is real", and delete the `Global Constraints` line about `TEAM_ID` being a constant.
  - `.env.example`: remove `TEAM_ID` and add `APP_URL`.

- [ ] **Step 4: Final check**

```bash
cd web
npm run setup:appwrite          # Schema is up to date.
npm run lint && npx tsc --noEmit && npx vitest run && npm run race-test
```

- [ ] **Step 5: Commit**

```bash
git add web/scripts/link-member.ts web/package.json web/.env.example TECH.md DECISIONS.md docs/superpowers/plans
git commit -m "docs(teams): accounts and teams; link sample members to real accounts"
```

---

## Acceptance (whole plan)

- A new person can sign up, create a team and land on an empty board as its lead.
- A lead can make a one-time invite link; a second person joins through it with the chosen role; reusing the link is refused; links expire after 7 days.
- A member of team A cannot see or change anything of team B: open B's task URL → 404; B's item id via MCP → `"not-found"`.
- Five wrong passwords lock that email for 15 minutes.
- A team can never end up without a lead.
- Every team, invite, role and membership change is in the audit log.
- The existing "Rando" data is one team, and a real account owns its lead member.
- Lint, typecheck, unit tests and the race test pass.

## Later (not in this plan)

Email verification and password reset (need SMTP on api.rando.ge) · several teams per person with a team switcher · invite-only signup flag · GitHub sign-in (Appwrite OAuth) · renaming or deleting a team · transferring the last lead role automatically when the lead deletes their account.
