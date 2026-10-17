# Decisions log

Short record of what the team has decided, parked or assigned. Newest at the bottom.

## 2026-10-17

| # | Topic | Decision |
|---|---|---|
| D1 | Terms of service check | **Parked.** Not discussed for now. Revisit before any public launch. |
| D2 | Source for "how much people leave unused" | **Postponed.** Pitch uses "many people do not use their full limit" (see `SOURCES.md`). Mini-survey later. |
| D3 | Prompt injection | **The clan is responsible.** Owned by the clan's security roles (injection hunters, triagers) and clan rules. The tool still shows the prompt preview and warnings, but the clan decides what is cleared. |
| D4 | Where `clan.yml` lives | **On the server**, not in a public repo. Editable only by higher-ranked clan members (heads / senior roles). |

| D5 | Scheduling | **Use Anthropic's own routines** (cloud, minimum interval 1 hour, MCP connectors per routine) instead of building our own scheduler. Details from third-party guides, to confirm in the official docs; routines are in research preview. |
| D6 | Server + web app | The server is a **hosted remote MCP server plus a web app** where the team creates tasks and routines (queue, schedule, budget, status). Replaces the local stdio server for team mode. |
| D7 | Safety line for unattended runs | Only first-party mechanisms (the user's own session or Anthropic routines); unattended runs only for **trusted, team-authored tasks**, read-only where possible, no secrets, bounded budget, output is a report or branch reviewed by a human. Public clan tasks stay human-started. |
| D8 | First use case | Team mode: Rando SEO audit skill run after hours from a routine. |

| D9 | Focus | **Team mode only** for now. Clan mode is parked (design kept in `POSITIONING.md` and `security/SECURITY.md`). |
| D10 | Web app role | The web app is a **shared library of task templates** (prompt with blanks, inputs, risk label, version) plus a task queue and routine setup. Not tied to code review or any single use. |
| D11 | Output | **Every result lands on a branch** in a throwaway workspace; nothing touches `main`; a human reviews and merges. (Branch-per-result revised by D15.) |

| D12 | Skills live in the app | Skills are stored and versioned on the server and served through the MCP server; teammates and routines install nothing. Each skill lists what it needs; machine readiness is the team's responsibility. |
| D13 | Tracker in the MCP server | Work item = skill on a target, with states (available, claimed, done, failed, skipped), claim leases and optional cooldowns, plus a board. The AI chooses what to take or skip inside rules the server enforces, and reports done or failed with a summary. Runs that do not check in are not tracked. See `IDEA.md` section 5a. |

| D14 | Security and roles weight | Team mode is inside a trusted startup team, so heavy security (trust ladder, security checker roles, threat model) is **not critical** and stays parked with clan mode. **Roles are a standalone permissions feature** (Lead, Member). Basic safety rules stay: branch output (never `main`), no secrets in workspaces, bounded runs, only leads edit skills. |

| D15 | Branching strategy | **The client chooses it.** Not every task or result has to be a new branch: the client picks a branch per task, per run, per target, one shared working branch, or their own convention. It is set in the team policy prefix (a routine prefix may override it). Still never a direct change to `main`; a human reviews and merges. |
| D16 | One concept: tasks | **No separate targets, skills or routines.** A task is a title, description and prompt, either one-off or routine (redo every N days), with an optional item list (one line per site, repo, file…) where each line is claimed separately so nobody doubles up. Every attempt writes a log (who, when, what, branch). Targets added a page, kinds and tags without a benefit a plain list doesn't give. Revises D12/D13 wording ("skill on a target" → "task item"). |
| D17 | No code-specific fields | **Tasks are not only about code.** No branch link, risk label (report-only / changes-files) or tools-needed fields. Where a result goes, what a task needs and how careful to be are written in the task prompt or team policy; Claude reports results as a summary plus free-text details. Approval and versions stay: they keep unattended runs safe for any kind of task. Narrows D11/D15 to code tasks. |
| D18 | Assignments | A task can be assigned to one or more members. Only assignees can take its items, by hand or from their own schedule; the server enforces it (`claim` → "not-assigned"). No assignees = anyone. |
| D19 | No "team" executor | A schedule always runs in **someone's** Claude, on their own account and limit (principle 3). Every token belongs to a member and is marked either for their schedule or for their own sessions. Logs and claims show the person, tagged "scheduled" for unattended runs. Replaces the team-wide token. |
| D20 | No approval step | Dropped "approve a version before schedules run it": too much UX for a small trusted team. Every run uses the latest prompt. Prompt edits still create versions (history), only leads edit tasks, edits are audited, and each log records the version that ran. |
| D21 | No run budget setting | Dropped "max tasks / max minutes per Claude run". Each run uses the person's own Claude limit, and Claude stops when that runs out or when `next_task` returns empty. A team-wide number in our app added a setting nobody could reason about. Revisit only if a run overspends. |
| D22 | A task is a title and a prompt | The prompt can ask for anything; the app only stores it, hands it out and tracks who did it. Editor fields: title, prompt, optional rows, repeat (once / every N days), assigned to. No description, priority, template syntax (`{{item}}`) or kinds of work. |
| D23 | Optional rows; only Claude claims | A task can have a rows table (clients, sites, files…): the same prompt per row, each row claimed separately so several people or runs can share a task. A task without rows is one piece of work. Claiming happens only from Claude through MCP; the web app shows who is on what, read-only (no claim/complete/release buttons; stuck claims expire). |
| D24 | Personal notes on tasks | Each member can write their own note on a task (where their files are, which connector to use…). It is added after the task prompt only when **their** Claude fetches the task. Not versioned, editable only by its owner. Keeps the shared prompt generic while each person's machine differs. |
| D25 | Takeover marker instead of a transaction | Taking over an expired claim is locked by creating a `claim_takeovers` row with a derived id (the same "create with a fixed id" trick as the claim itself). On our 1.8.1 server, delete + create in one transaction let two claimers win in a race test, so transactions are only used for all-or-nothing writes, never as a lock. |
| D26 | Sign up, then create or join a team; one team per account | Anyone can sign up with email and password. A new account either creates a team (and is its lead) or joins one through an invite link. One team per account for now (unique `members.userId`); a team switcher is later. Every table row carries `teamId`, so teams never see each other. |
| D27 | Invite links instead of email | There is no SMTP on api.rando.ge yet, so a lead creates a one-time link (7 days, role chosen, hash stored) and sends it by hand. Email invites, verification and password reset wait for SMTP. |
| D28 | Our own login throttle | Our server logs in with the API key, and API-key calls skip Appwrite's rate limits. So failed logins are counted in `login_attempts`: 5 failures per 15 minutes per email locks that email. |

## Consequences of D4 (to design)

- This adds a small server: it stores each clan's config and roles, and the MCP server reads the clan from it.
- It needs login (GitHub sign-in, so roles map to GitHub accounts) and an **audit log** of every config change (who, what, when).
- Changing roles or the head list should need **two heads** to approve, so one stolen account cannot rewrite the clan.
- Members can read their clan's config; only the permitted ranks can write it.
- The server becomes a high-value target: keep it small, no stored AI credentials, back it up, and publish its rules.
- The MCP server's `CLAN` setting would point to the clan's server URL instead of a local file or repo.
