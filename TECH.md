# Tech plan (team mode)

> Planning document, 2026-10-17. Nothing here is built yet. Versions were checked on npm on this date; re-check before installing.
> Product context: `IDEA.md` (sections 2–8) and `DECISIONS.md` (D6, D9–D14).

## 1. Architecture in one picture

```
 Team member's browser ──► Next.js web app (Vercel) ──► Appwrite 1.8 (api.rando.ge)
                              │  pages, server actions        tables, auth, audit log
                              │
 Claude Code session  ──┐     ▼
 Claude routine (cloud) ─┴─► /api/mcp  (MCP server inside the same Next.js app)
                              list work · get skill · claim · heartbeat · complete · fail · skip · board

 The actual work (running a skill on a target) happens inside Claude, in a fresh workspace,
 and its result is a git branch. Our server only stores skills, targets, claims and results.
```

One Next.js project holds the web app, the API and the MCP endpoint. Appwrite is the database and the login system. Anthropic routines are the scheduler, so we run no background jobs.

## 2. Stack

| Layer | Choice | Version (2026-10-17) | Why |
|---|---|---|---|
| Framework | Next.js (App Router) + TypeScript | `next` 16.4.2, `react` 19.3.1 | Web app, server actions and the MCP route in one deployment. Same as Rando. |
| Database + auth | Appwrite **TablesDB**, self-hosted | server **1.8.1** (checked on api.rando.ge) | Already running. 1.8 has TablesDB and a Transactions API, which the claim logic needs. |
| Appwrite SDK (server) | `node-appwrite` | latest 30.0.1, **pin the major that matches server 1.8.x** (check its changelog) | All data access happens on the server with an API key. SDK majors track server versions. |
| Appwrite SDK (browser) | not needed at first | (`appwrite` 29.0.0) | Login runs through server actions with an httpOnly session cookie (Appwrite's SSR pattern). Add the browser SDK only if we need realtime. |
| MCP server | `mcp-handler` + `@modelcontextprotocol/server` | 2.3.0 + 2.3.1 | Vercel's adapter for MCP in Next.js routes. Supports Streamable HTTP and auth helpers (`withMcpAuth`, protected-resource metadata) for when we add OAuth. |
| Validation | `zod` | 4.6.7 | Tool input schemas for MCP and form validation, one library for both. |
| UI | Tailwind CSS + shadcn/ui | `tailwindcss` 4.3.3, `shadcn` CLI 4.22.0 | Copy-in components, no heavy UI dependency. Rando already uses shadcn. |
| Skill editor | plain `<textarea>` first, then `@uiw/react-codemirror` | 4.25.12 | Markdown prompts. CodeMirror only when people ask for syntax highlighting. |
| Markdown preview | `react-markdown` | 10.1.0 | Preview a skill and render result summaries. |
| Template blanks | no library: `{{name}}` replace in a few lines | — | Only simple substitution is needed. Use `mustache` (4.2.0) if we ever need loops or conditions. |
| Tests | `vitest`; later `@playwright/test` | 5.0.5; 1.64.1 | Unit tests for claim and template logic. One end-to-end test once the UI settles. |
| Hosting | Vercel (Pro plan) | — | Native Next.js and the MCP adapter, public HTTPS URL for routines. Hobby is for non-commercial use. |

Not using, on purpose:
- **Our own scheduler or cron.** Routines provide the schedule. Lease expiry is checked when a claim is read, so no background job is needed.
- **TanStack Query, tRPC, an ORM.** Server components and server actions cover the data flow. Add them only if a real need appears.
- **A second database.** Appwrite holds everything.

## 3. Data model (Appwrite TablesDB)

One database, `commons`. v1 serves one team, and every row carries `teamId` so more teams can be added later without migration.

| Table | Key columns | Notes |
|---|---|---|
| `members` | `userId` (Appwrite user), `teamId`, `role` (`lead` \| `member`), `name` | Roles are the simple permissions feature (IDEA §7). |
| `skills` | `teamId`, `slug`, `title`, `description`, `currentVersion`, `approvedVersion`, `requires` (list: tools, keys) | Unattended routines run `approvedVersion` only. |
| `skill_versions` | `skillId`, `version`, `prompt` (markdown with `{{blanks}}`), `inputs` (JSON schema), `riskLabel` (`report-only` \| `changes-files`), `authorId`, `createdAt` | Immutable. Editing a skill creates a new row. |
| `policies` | `teamId`, `scope` (`team` \| `routine`), `prefix` (markdown) | Guardrail text placed before every task. Order: team, then routine, then skill. |
| `targets` | `teamId`, `kind` (free text: site, repo, file, ticket…), `name`, `ref` (URL or path), `tags` | Websites are just one kind. |
| `routines` | `teamId`, `name`, `skillId`, `targetFilter` (tags or explicit ids), `policyId`, `budget` (max items, minutes), `cooldownDays`, `enabled` | Configuration only. The schedule itself is set in Claude's routines; this row is what the routine asks for. |
| `work_items` | `teamId`, `skillId`, `targetId`, `status` (`available` \| `done` \| `failed` \| `skipped`), `lastDoneAt`, `lastResultId`, `priority` | One row per skill × target. Created when a routine or a lead adds targets to a skill. |
| `claims` | **row id = work item id**, `memberId` or `routineId`, `claimedAt`, `leaseUntil` | The lock. See §4. |
| `results` | `workItemId`, `by`, `outcome` (`done` \| `failed` \| `skipped`), `summary`, `branchUrl`, `skillVersion`, `startedAt`, `finishedAt` | History and the board's data. |
| `api_tokens` | `memberId`, `name`, `tokenHash`, `lastUsedAt`, `revoked` | MCP access (§6). Store the hash only. |
| `audit_log` | `teamId`, `actor`, `action`, `entity`, `before`, `after`, `at` | Every change to skills, policies, routines and roles. |

Permissions: the browser never talks to Appwrite directly in v1. Server code uses an API key and checks the member's role before every write. Table-level permissions stay closed to clients.

## 4. Claiming without collisions

The one tricky part is two people (or a person and a routine) taking the same work item at the same moment.

- **Claim = create a row in `claims` whose row id is the work item id.** Appwrite rejects a second create with the same id (HTTP 409), so only one claimer can win. This is atomic without any read-then-write.
- **Expired leases:** if the create fails, read the existing claim. If `leaseUntil` is in the past, delete it and create ours **inside one Appwrite transaction**. If two claimers race for the same stale claim, the transaction's conflict detection should let only one commit. This needs a quick test against our 1.8.1 server before we rely on it.
- **Heartbeat:** long runs call `heartbeat` to push `leaseUntil` forward (default lease 2 hours, a setting).
- **Finish:** `complete`, `fail` or `skip` writes a `results` row, updates the `work_items` status, and deletes the claim, in one transaction.
- **Eligibility** (decided by the server, not the AI): not claimed (or lease expired), not in cooldown (`lastDoneAt + cooldownDays`), skill has an approved version, the caller's role allows it.

## 5. MCP server

- Route: `app/api/[transport]/route.ts` with `mcp-handler`, stateless Streamable HTTP. The URL routines and Claude Code connect to is `https://<app>/api/mcp`.
- Every tool checks the caller's token (§6) and role, validates input with zod, and writes an audit entry for state changes.
- Tool results are short JSON plus one plain-language line, so the AI can decide well.

| Tool | Input | Does |
|---|---|---|
| `list_work` | `routine?`, `skill?`, `limit?` | Eligible work items with skill, target, last run and suggested order. The AI chooses from these. |
| `get_skill` | `skill`, `version?` | Merged prompt: team policy + routine prefix + skill version, with target values filled into `{{blanks}}`, plus `requires`. |
| `claim` | `workItemId` | Atomic claim (§4). Returns the lease end time, or "taken". |
| `heartbeat` | `workItemId` | Extends the lease. |
| `complete` | `workItemId`, `summary`, `branchUrl` | Records success. |
| `fail` | `workItemId`, `reason` | Records failure and frees the item. |
| `skip` | `workItemId`, `reason` | The AI decided not to take it. Recorded so the lead can see why. |
| `board` | `skill?` | Who is working on what, what is free, recent results. |

## 6. Authentication

**Web app.** Appwrite email + password, using the SSR pattern: a server action creates the session with `node-appwrite` and stores it in an httpOnly cookie. GitHub sign-in can be added later through Appwrite's OAuth providers (a feature, not a requirement).

**MCP endpoint.** Each member (and each routine) gets a personal API token created in the web app. Only its hash is stored, and it can be revoked.
- *Claude Code (a person's session):* `claude mcp add --transport http commons https://<app>/api/mcp --header "Authorization: Bearer <token>"`.
- *Claude routines (cloud):* routines use connectors set up in Claude. Anthropic said on 2026-08-31 that connectors now support **static headers** (up to four, from an allowlist) on Pro, Max and Team plans. **To check:** whether `Authorization` is on that allowlist. If it is not, accept the same token in an allowed custom header.
- *Later, if needed:* full OAuth. `mcp-handler` already has `withMcpAuth` and protected-resource metadata. The authorization server could be Better Auth's MCP plugin or a hosted provider (Clerk, WorkOS). Appwrite cannot act as an OAuth provider for third-party clients, so this would be an extra piece. Not needed for the hackathon.

## 7. Web app pages

| Page | For | Contents |
|---|---|---|
| `/login` | everyone | Email + password. |
| `/board` | everyone | Work items by skill: free, claimed (who, until when), done (link to branch), failed (reason). |
| `/skills` | lead edits, members read | Skill list, editor (prompt, inputs, requires, risk label), version history, approve version, preview with a sample target. |
| `/targets` | lead, members | Add targets of any kind, tags, bulk import (paste a list). |
| `/routines` | lead | Routine config (skill, targets, prefix, budget, cooldown) plus a **"copy routine prompt"** button that produces the text to paste into Claude's routine setup. |
| `/settings` | lead | Members and roles, team policy prefix, API tokens. |
| `/settings/tokens` | everyone | Create or revoke your own MCP token; shows the `claude mcp add` command. |

## 8. What a routine looks like

The routine in Claude is short. All real instructions come from our server, so changing a skill in the app changes what tonight's run does.

```
You are running the "<routine name>" routine for our team.
Use the "commons" MCP connector.
1. Call list_work for routine "<routine id>".
2. Pick the first eligible item, claim it, then call get_skill for it and follow it exactly.
   Work in a fresh clone on a new branch. Never push to main. Use no secrets.
3. Call heartbeat at least every 30 minutes on long items.
4. Finish with complete (summary + branch URL) or fail (reason).
5. Repeat until list_work is empty or the routine's budget is used up, then stop.
```

## 9. Repository layout

```
compute-commons/
├── IDEA.md, TECH.md, DECISIONS.md, POSITIONING.md, SOURCES.md
├── web/                      ← new Next.js app (team mode)
│   ├── app/
│   │   ├── (auth)/login/
│   │   ├── board/  skills/  targets/  routines/  settings/
│   │   └── api/[transport]/route.ts   ← MCP endpoint
│   ├── lib/
│   │   ├── appwrite.ts        ← server client (API key) + session client
│   │   ├── claims.ts          ← claim / heartbeat / finish (§4) + vitest test
│   │   ├── prompt.ts          ← merge policy + prefix + skill, fill {{blanks}} + test
│   │   └── auth.ts            ← session + MCP token checks, role guard
│   ├── components/ui/         ← shadcn components
│   └── scripts/setup-appwrite.ts  ← creates database, tables, indexes (idempotent)
└── (existing) mcp/, skills/, clan.yml  ← parked clan prototype
```

## 10. Environment variables

| Name | Where | Notes |
|---|---|---|
| `APPWRITE_ENDPOINT` | Vercel + local | `https://api.rando.ge/v1` |
| `APPWRITE_PROJECT_ID` | Vercel + local | New project for this app, separate from client sites. |
| `APPWRITE_API_KEY` | Vercel + local (server only) | Scoped to this project's databases and users. Never in the repo. |
| `APPWRITE_DATABASE_ID` | Vercel + local | `commons` |
| `SESSION_COOKIE_NAME` | optional | Defaults to `commons_session`. |

## 11. Build order for the hackathon

1. **Setup:** Next.js app in `web/`, Tailwind + shadcn, Appwrite project, `setup-appwrite.ts` creates the tables.
2. **Claim logic first:** `lib/claims.ts` with a vitest test, and one manual race test against the real 1.8.1 server (two claims at once, an expired lease).
3. **MCP endpoint:** the eight tools with token auth. Test with the MCP Inspector and with `claude mcp add` from a laptop.
4. **Minimum web app:** login, skills (textarea editor + approve), targets (paste a list), board.
5. **Routine:** "copy routine prompt" button; set up one real Claude routine running a real skill (for example the SEO audit) on 3–5 targets.
6. **Demo polish:** board refreshes, result links, version history. Everything else goes on the roadmap slide.

## 12. Risks and checks before we build

- `Authorization` header on Claude's connector allowlist: confirm in Claude's current connector docs (§6).
- Routine limits (minimum interval, daily run caps, research-preview status): confirm in Anthropic's official routine docs; our numbers come from third-party guides.
- `node-appwrite` major for server 1.8.1: confirm in the SDK changelog.
- Transaction behaviour on a conflicting claim (§4): test on our server.
- Skills that need scripts or tools: a routine's cloud workspace only has what the cloned repo and environment provide. List each skill's `requires` and test the first skill in a real routine early.
- Vercel plan and function time limits: confirm. Our routes are short database calls.

## Sources

- Appwrite 1.8.0 release (TablesDB, transactions): https://appwrite.io/blog/post/appwrite-1-8-0-self-hosted-release
- Appwrite TablesDB transactions docs: https://appwrite.io/docs/products/databases/tablesdb/transactions
- Vercel changelog, OAuth support in the MCP adapter: https://vercel.com/changelog/oauth-support-added-to-mcp-adapter
- Clerk guide to an MCP server in Next.js (shows `withMcpAuth` wiring): https://clerk.com/docs/nextjs/guides/ai/mcp/build-mcp-server
- Claude Code MCP docs (HTTP transport, `--header` bearer example): https://code.claude.com/docs/en/mcp
- Static headers for Claude connectors, Anthropic reply on 2026-08-31: https://github.com/anthropics/claude-ai-mcp/issues/112
- Better Auth MCP plugin (possible future OAuth server): https://better-auth.com/docs/plugins/mcp
- Package versions: `npm view <package> version`, run 2026-10-17. Appwrite server version: `https://api.rando.ge/v1/health/version`, run 2026-10-17.
