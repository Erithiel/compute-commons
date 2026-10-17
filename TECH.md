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
                              list work · get task · claim · heartbeat · complete · fail · skip · board

 The actual work (doing a task, or one item of its list) happens inside Claude, in a fresh workspace,
 and its result goes wherever the task prompt says (a doc, a message, a branch…); Claude reports it in the log.
 Our server only stores tasks, claims and logs.
```

One Next.js project holds the web app, the API and the MCP endpoint. Appwrite is the database and the login system. Anthropic routines are the scheduler, so we run no background jobs.

## 2. Stack

| Layer | Choice | Version (2026-10-17) | Why |
|---|---|---|---|
| Framework | Next.js (App Router) + TypeScript | `next` 16.4.2, `react` 19.3.1 | Web app, server actions and the MCP route in one deployment. Same as Rando. |
| Database + auth | Appwrite **TablesDB**, self-hosted | server **1.8.1** (checked on api.rando.ge) | Already running. 1.8 has TablesDB and a Transactions API, which the claim logic needs. |
| Appwrite SDK (server) | `node-appwrite` | **pinned 22.1.3** (latest is 30.0.1) | 22.1.3 is the last release built for API 1.8.1 (README at that tag); 23.x targets 1.9. All data access happens on the server with an API key. |
| Appwrite SDK (browser) | not needed at first | (`appwrite` 29.0.0) | Login runs through server actions with an httpOnly session cookie (Appwrite's SSR pattern). Add the browser SDK only if we need realtime. |
| MCP server | `mcp-handler` + `@modelcontextprotocol/server` | 2.3.0 + 2.3.1 | Vercel's adapter for MCP in Next.js routes. Supports Streamable HTTP and auth helpers (`withMcpAuth`, protected-resource metadata) for when we add OAuth. |
| Validation | `zod` | 4.6.7 | Tool input schemas for MCP and form validation, one library for both. |
| UI | Tailwind CSS + shadcn/ui | `tailwindcss` 4.3.3, `shadcn` CLI 4.22.0 | Copy-in components, no heavy UI dependency. Rando already uses shadcn. |
| Prompt editor | plain `<textarea>` first, then `@uiw/react-codemirror` | 4.25.12 | Markdown prompts. CodeMirror only when people ask for syntax highlighting. |
| Markdown preview | `react-markdown` | 10.1.0 | Preview a task prompt and render log summaries. |
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
| `tasks` | `teamId`, `title`, `description`, `mode` (`once` \| `routine`), `redoDays`, `items` (optional list of strings), `priority`, `currentVersion`, `approvedVersion` | Any repeatable job, not only code (D16, D17). Schedules only take tasks with an approved version. |
| `task_versions` | `taskId`, `version`, `prompt` (markdown, may use `{{item}}`), `authorId`, `createdAt` | Immutable. Editing a task's prompt creates a new row. |
| `task_items` | `teamId`, `taskId`, `item` (one line of the list, `""` when there is none), `status` (`available` \| `done` \| `failed` \| `skipped`), `lastDoneAt`, `lastLogId` | The unit of work and of claiming. One row per list line. |
| `claims` | **row id = task item id**, `by` (member id or `team`), `claimedAt`, `leaseUntil` | The lock. See §4. |
| `logs` | `taskItemId`, `taskId`, `by`, `outcome` (`done` \| `failed` \| `skipped`), `summary`, `details` (free text: what was done, where the result is), `version`, `startedAt`, `finishedAt` | Who did what, when. The board's and the Logs page's data. |
| `settings` | `teamId`, `policy` (markdown), `maxItemsPerRun`, `maxMinutesPerRun` | One row. The policy goes before every task prompt (rules such as how to deliver results; for code teams, the branching strategy, D15). The budget is returned to schedules by `list_work`. |
| `api_tokens` | `owner` (member id or `team`), `name`, `tokenHash`, `lastUsedAt`, `revoked` | MCP access (§6). Store the hash only. |
| `audit_log` | `teamId`, `actor`, `action`, `entity`, `before`, `after`, `at` | Every change to tasks, settings, members and tokens. |

Permissions: the browser never talks to Appwrite directly in v1. Server code uses an API key and checks the member's role before every write. Table-level permissions stay closed to clients.

## 4. Claiming without collisions

The one tricky part is two people (or a person and a schedule) taking the same task item at the same moment.

- **Claim = create a row in `claims` whose row id is the task item id.** Appwrite rejects a second create with the same id (HTTP 409), so only one claimer can win. This is atomic without any read-then-write.
- **Expired leases:** if the create fails, read the existing claim. If `leaseUntil` is in the past, delete it and create ours **inside one Appwrite transaction**. If two claimers race for the same stale claim, the transaction's conflict detection should let only one commit. This needs a quick test against our 1.8.1 server before we rely on it.
- **Heartbeat:** long runs call `heartbeat` to push `leaseUntil` forward (default lease 2 hours, a setting).
- **Finish:** `complete`, `fail` or `skip` writes a `logs` row, updates the `task_items` status, and deletes the claim, in one transaction.
- **Eligibility** (decided by the server, not the AI): not claimed (or lease expired), not done (one-off) or past `lastDoneAt + redoDays` (routine), the task has an approved version (for schedules), the caller's role allows it.

## 5. MCP server

- Route: `app/api/[transport]/route.ts` with `mcp-handler`, stateless Streamable HTTP. The URL routines and Claude Code connect to is `https://<app>/api/mcp`.
- Every tool checks the caller's token (§6) and role, validates input with zod, and writes an audit entry for state changes.
- Tool results are short JSON plus one plain-language line, so the AI can decide well.

| Tool | Input | Does |
|---|---|---|
| `list_work` | `limit?` | Eligible task items with task title, item, last log and suggested order, plus the run's budget. The AI chooses from these. |
| `get_task` | `itemId` | Merged prompt: team policy + task prompt (approved version for schedules), with `{{item}}` filled in. |
| `claim` | `itemId` | Atomic claim (§4). Returns the lease end time, or "taken". |
| `heartbeat` | `itemId` | Extends the lease. |
| `complete` | `itemId`, `summary`, `details?` | Writes a "done" log. |
| `fail` | `itemId`, `reason` | Writes a "failed" log and frees the item. |
| `skip` | `itemId`, `reason` | The AI decided not to take it. Logged so the lead can see why. |
| `board` | – | Who is working on what, what is free, recent logs. |

The server also sends `instructions` (the workflow: list → claim → get_task → heartbeat → complete/fail/skip → stop at budget) when Claude connects.

## 6. Authentication

**Web app.** Appwrite email + password, using the SSR pattern: a server action creates the session with `node-appwrite` and stores it in an httpOnly cookie. GitHub sign-in can be added later through Appwrite's OAuth providers (a feature, not a requirement).

**MCP endpoint.** Each member (and each routine) gets a personal API token created in the web app. Only its hash is stored, and it can be revoked.
- *Claude Code (a person's session):* `claude mcp add --transport http commons https://<app>/api/mcp --header "Authorization: Bearer <token>"`.
- *Claude routines (cloud):* routines use connectors set up in Claude. Checked in Claude's connector authentication docs (2026-10-17): connectors support three ways to authenticate.
  - **OAuth** (DCR or CIMD), supported by default. Each user signs in.
  - **Request headers (`static_headers`)**: an organization Owner enters one API key or bearer token when adding the connector, and Claude sends it on every call. Standard names `authorization`, `x-api-key` and `x-auth-token` are allowed, so **`Authorization: Bearer <token>` works**. But this is **beta, for a limited set of organizations**, and it is **one key for the whole organization**: it cannot tell members apart. That fits team mode: the schedule uses the team's token, and its logs are recorded as "team schedule". **To check:** whether our organization sees the "Request headers" section when adding a connector.
  - **No authentication**: the server accepts anyone with the URL. Not acceptable for us on its own.
  - Tokens in the URL (`?token=`) are explicitly not to be used.
- *If our organization does not have request headers:* we need OAuth. `mcp-handler` already has `withMcpAuth` and protected-resource metadata. The authorization server could be Better Auth's MCP plugin or a hosted provider (Clerk, WorkOS). Appwrite cannot act as an OAuth provider for third-party clients, so this is an extra piece. Claude requires a `401` with a `resource_metadata` pointer, PKCE S256, and answers within 10 seconds. A user's OAuth sign-in also identifies the member, which request headers cannot.
- *Extra layer (optional):* Anthropic's outbound traffic comes from `160.79.104.0/21`, so the MCP route can refuse other addresses for routine calls. This is not identity, only a filter.

## 7. Web app pages

| Page | For | Contents |
|---|---|---|
| `/login` | everyone | Email + password. |
| `/board` | everyone | Task items: free, claimed (who, until when), done (summary), failed (reason). Quick "add task". |
| `/tasks` | lead edits, members read | Task list and editor: title, description, **prompt**, one-off or routine (redo after N days), optional item list, priority; version history, approve, preview. |
| `/logs` | everyone | Who executed what: when, who, task, item, outcome, duration, summary; expand for details. |
| `/setup` | everyone | **Connect Claude**, once: create a token, guide to add the connector, and **"copy prompt"** for the Claude scheduled task. |
| `/settings` | lead | Members and roles, team policy, run budget, API tokens. |
| `/settings/tokens` | everyone | Create or revoke your own MCP token; shows the `claude mcp add` command. |

## 8. What a Claude schedule looks like

The Claude scheduled task holds one line, copied once from the app's "Connect Claude" page (`/setup`):

```
Use the "commons" MCP connector and work through our team's task queue.
```

Everything else comes from our server, so changing a task or the rules changes what tonight's run does without re-pasting:
- **How to work** (list → claim → get_task → heartbeat → complete/fail/skip → stop at budget) is the MCP server's `instructions`, sent when Claude connects.
- **The task itself** (team policy + task prompt, with `{{item}}` filled in) comes from `get_task`.
- **The budget** comes back from `list_work`.

## 9. Repository layout

```
compute-commons/
├── IDEA.md, TECH.md, DECISIONS.md, POSITIONING.md, SOURCES.md
├── web/                      ← new Next.js app (team mode)
│   ├── app/
│   │   ├── (auth)/login/
│   │   ├── (app)/board/  tasks/  logs/  setup/  settings/
│   │   └── api/[transport]/route.ts   ← MCP endpoint
│   ├── lib/
│   │   ├── appwrite.ts        ← server client (API key) + session client
│   │   ├── claims.ts          ← claim / heartbeat / finish (§4) + vitest test
│   │   ├── prompt.ts          ← team policy + task prompt, fill {{item}} + test
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

> Detailed feature plan with dependencies, branches and shared contracts: `docs/superpowers/plans/2026-10-17-team-mode-features.md`.

1. **Setup:** Next.js app in `web/`, Tailwind + shadcn, Appwrite project, `setup-appwrite.ts` creates the tables.
2. **Claim logic first:** `lib/claims.ts` with a vitest test, and one manual race test against the real 1.8.1 server (two claims at once, an expired lease).
3. **MCP endpoint:** the eight tools with token auth. Test with the MCP Inspector and with `claude mcp add` from a laptop.
4. **Minimum web app:** login, tasks (textarea editor + item list + approve), board, logs.
5. **Schedule:** Connect Claude page; set up one real Claude scheduled task running a real task over a 3–5 item list.
6. **Demo polish:** board refreshes, result links, version history. Everything else goes on the roadmap slide.

## 12. Risks and checks before we build

- Connector auth (§6): `Authorization` is allowed, but request headers are a beta for a limited set of organizations and are one key per organization. Check whether our organization has it; if not, plan for OAuth.
- Routine limits (minimum interval, daily run caps, research-preview status): confirm in Anthropic's official routine docs; our numbers come from third-party guides.
- `node-appwrite`: pinned 22.1.3 for server 1.8.1 (done).
- Transaction behaviour on a conflicting claim (§4): test on our server.
- Tasks that need tools or access: a schedule's cloud workspace only has what its environment provides. Say what a task needs in its prompt and test the first task in a real schedule early.
- Vercel plan and function time limits: confirm. Our routes are short database calls.

## Sources

- Appwrite 1.8.0 release (TablesDB, transactions): https://appwrite.io/blog/post/appwrite-1-8-0-self-hosted-release
- Appwrite TablesDB transactions docs: https://appwrite.io/docs/products/databases/tablesdb/transactions
- Vercel changelog, OAuth support in the MCP adapter: https://vercel.com/changelog/oauth-support-added-to-mcp-adapter
- Clerk guide to an MCP server in Next.js (shows `withMcpAuth` wiring): https://clerk.com/docs/nextjs/guides/ai/mcp/build-mcp-server
- Claude Code MCP docs (HTTP transport, `--header` bearer example): https://code.claude.com/docs/en/mcp
- Claude connector authentication (OAuth, request headers beta, authless, allowed header names): https://claude.com/docs/connectors/building/authentication
- Static headers for Claude connectors, Anthropic reply on 2026-08-31: https://github.com/anthropics/claude-ai-mcp/issues/112
- Better Auth MCP plugin (possible future OAuth server): https://better-auth.com/docs/plugins/mcp
- Package versions: `npm view <package> version`, run 2026-10-17. Appwrite server version: `https://api.rando.ge/v1/health/version`, run 2026-10-17.
