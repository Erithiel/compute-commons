# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Small teams that already pay for Claude, from day one (not only Rando, which is the first user). Two roles:

- **Lead:** writes and edits tasks and the team policy, assigns work, invites members, reads the board and logs to see what came back. Works at a desk, checks in between other work.
- **Member:** reads the board, adds their own note to a task (where their files are, which connector to use), creates MCP tokens for their own Claude, can suggest prompt changes. Most of a member's "work" happens in Claude, not in this app.

The real executor is the member's Claude (a scheduled run or their own Claude Code session). The web app is where people set work up and check what happened, usually in short visits.

## Product Purpose

A shared task list for a team's Claude. A task is a title and a prompt, optionally with rows (clients, sites, files) where each row is claimed separately. Claude fetches work through the app's MCP server, claims an item so nobody doubles up, does it, and reports done / failed / skipped with a summary and details. The app stores the prompts, hands them out, and shows who did what.

Success: a lead can set up repeatable work once, the team's spare Claude capacity (after-hours schedules, idle sessions) works through it without collisions, and in the morning everyone can see what was done, by whom, and what failed.

## Positioning

Coordination for work done in each person's own Claude: the app never runs AI itself, holds no AI credentials and never pools accounts. Claims with leases make shared lists safe to work in parallel; every attempt is logged under a real person (tagged "scheduled" for unattended runs). Tasks are not tied to code: a prompt can ask for anything.

## Operating Context

- People connect Claude once (Connect Claude page): create a personal token, add the custom connector, paste the setup prompt into a Claude schedule.
- After that, Claude schedules run on their own timing (minimum one hour interval) and pull tasks through MCP.
- The web app is visited to add or edit tasks, read the board, read logs in the morning, and manage members and tokens.
- Prompt order Claude receives: team policy, then task prompt, then the member's own note, then the claimed row.

## Capabilities and Constraints

- Roles: lead and member only. Only leads edit tasks, policy and members; edits are audited; every prompt change is a new version, and each log records the version that ran.
- Tasks: title, prompt, optional rows, repeat (once / every N days), assignees (none = anyone; the server enforces assignment).
- Only Claude claims and finishes work, through MCP. The web app is read-only for work state: no claim, complete or release buttons; stuck claims expire.
- Tokens belong to a member and are marked "for my schedule" or "for my own sessions"; shown once.
- No approval step, no run budget setting, no priorities, no template syntax, no code-specific fields (branch links, risk labels). Where results go is written in the prompt or team policy.
- Stack: Next.js (App Router) + Appwrite, server-only Appwrite access. Currently runs on in-memory mock data; Appwrite auth and tables are being wired feature by feature.
- Terminology: task, row (item), claim, log, team policy, note, token, schedule. "Board", "Tasks", "Logs", "Connect Claude", "Settings" are the app's sections.
- Open: product name ("Compute Commons" is a working title), licence, domain, deployed URL.

## Brand Commitments

- "Compute Commons" is a working title; treat the name as replaceable.
- No mission or "commons" messaging in the team-mode UI. It is a practical work tool; the non-profit / commons positioning belongs to the parked clan mode.
- English UI only. No localization planned.

## Evidence on Hand

- Seed/mock data only (`web/lib/mock.ts`): sample team "rando" with members Rati, Nino, Giorgi and five example tasks. These are demo fixtures, not customers.
- No testimonials, customer logos, usage numbers or published figure for unused capacity. Do not fabricate any; the agreed wording is "many people do not use their full limit".

## Product Principles

1. **Each person's own Claude.** Work runs on the member's own account and limit, never a shared login or a team executor.
2. **Humans decide.** People write tasks, set schedules and read every result; AI output is advice to review.
3. **Nobody doubles up.** Every unit of work is claimed before it is done, and the board shows who is on what.
4. **Every attempt is visible.** Done, failed and skipped all leave a log with who, when, which prompt version and what happened.
5. **Fewer settings, plainer words.** Prefer one concept (a task) and plain language over options nobody can reason about.
