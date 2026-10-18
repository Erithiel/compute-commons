# Compute Commons: project summary

**What it is.** A shared task list for a team's Claude. Compute Commons is a working title. A task is a title plus a free-text prompt. It can have rows (clients, sites, files), and each row is claimed separately. A task can be one-off or a routine that comes back every N days.

**Who it is for.** Small teams that already pay for Claude and want their spare capacity (after-hours schedules, idle sessions) to work through repeatable jobs without anyone doing the same job twice. It has two roles. A **lead** writes tasks and the team policy, assigns work and invites members. A **member** reads the board, adds their own note to a task and connects their own Claude.

**How it works.**
- One Next.js app on Vercel holds the web app (board, tasks, logs, Connect Claude, settings) and a remote MCP server at `/api/mcp`. Appwrite 1.8 TablesDB is the database and handles sign-in.
- Each member's own Claude, either a Claude Code session or a scheduled task, connects with a personal token. It calls `next_task`, does the work and reports `complete`, `fail` or `skip` with a summary and details.
- Claims use leases. The claim row's id is the item id, so a second claim is rejected, and an expired lease frees the item again. This lets people and schedules work in parallel safely. Every attempt is logged with who did it, when, and which prompt version ran.
- Claude receives the team policy first, then the task prompt, then the member's own note, then the row. Results go wherever the prompt says (a doc, a message, a branch), and humans review them.
- The app never runs AI itself, holds no AI credentials and never pools accounts.
