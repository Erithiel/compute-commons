# Compute Commons (working title)

> Hackathon brief, kept up to date so the whole team is on the same page.
> **Planning stage. Nothing is being built yet.**
> Last updated: 2026-10-17. Focus: **team mode only**. Clan mode is parked (see section 10).
> Related files: `TECH.md` (stack, data model, MCP tools, build order), `DECISIONS.md` (what we decided or parked), `POSITIONING.md` (how we present ourselves), `security/SECURITY.md` (trust ladder and threat model for the later clan mode; not critical for team mode), `SOURCES.md` (facts and sources).

## 1. The problem

Teams pay for AI subscriptions and do not use all of them. Heavy jobs (audits, reviews, refactors, reports) compete with daytime work in the same 5-hour window and the shared weekly limit. Meanwhile the same heavy jobs get re-typed as prompts by every person, with no shared place for the good ones.

## 2. The idea

A small web app and server for a team:

1. **A shared library of task templates.** A template is a ready-made prompt for any kind of job, with blanks to fill in. Anyone on the team can add, improve and reuse them.
2. **A queue of tasks.** A task is a template plus its inputs ("run the SEO audit on site X", "review PR 42").
3. **Runs when it suits the team.** A person runs a task in their own Claude Code when they have spare capacity, or a scheduled Anthropic routine works through the queue after hours.
4. **Branching is the client's choice.** The client decides the branching strategy for their workflow: a new branch per task, one branch per run or per target, a shared working branch, or whatever convention they already use. Results (code changes, or a report file) land wherever that strategy says. Nothing touches `main` directly. A human reviews and merges.

It is not tied to code review or SEO. Code review and the SEO audit are just the first two templates. Anything repeatable can be a template: audits, reviews, refactors, test writing, docs, translations, data cleanups, reports.

## 3. Examples

- **Rando SEO audit.** The audit skill burns tokens if run during work. The lead queues "audit site X" tasks; a routine runs them after 18:00; results land as report branches; people read them in the morning.
- **Code review.** A template takes a PR URL, reads the diff, and writes review notes to a branch (or a comment). A human decides what to do. AI review is advice, not a verdict.
- **Later ideas.** Test coverage, dependency checks, documentation passes, translation of strings, release notes.

Note: the weekly limit is shared, so after-hours runs still use weekly capacity. The gain is using idle windows and leftover capacity.

## 4. Principles

1. **Branch output, client's strategy.** Results go to branches in a throwaway workspace, following the branching strategy the client chose (per task, per run, per target, or a shared branch). Never a direct change to `main`. A human reviews and merges.
2. **Humans decide.** People write or approve templates, set the schedule and budget, and review every result.
3. **Own account, own limit.** No shared logins, no pooled subscriptions.
4. **First-party mechanisms only.** The person's own Claude Code session or Anthropic's own routines. We do not build our own background runner that logs in on someone's behalf.
5. **Trusted team tasks.** The team writes the templates and inputs. No tasks from outside strangers in this mode.
6. **Bounded runs.** Every run has a budget (number of tasks, time, or usage threshold) and stops by itself.
7. **Open and non-profit in spirit.** No ads, no selling data, no paid tiers in the product.

Parked for now (see `DECISIONS.md`): the terms-of-service check and a sourced "unused capacity" statistic.

## 5. How it works

1. **Create a template** in the web app: name, description, prompt with `{{blanks}}`, the inputs it needs, what the AI may do (read-only, or edit files in the workspace), the output type (report or code change), and a risk label.
2. **Create a task** from a template by filling in the inputs. It joins the queue.
3. **Run it** in one of two ways:
   - *On demand:* a person runs a skill in their own Claude Code, which fetches the next task from the server.
   - *Scheduled:* an Anthropic routine (for example every day after 18:00; cloud routines have a minimum interval of one hour) connects to our remote MCP server and works through the queue within its budget.
4. **The run** happens in a fresh workspace (a clone with no secrets, on the branch the client's strategy picks), claims the task, does the work, commits the result to that branch, and reports back.
5. **The server shows status:** queued, running, done, failed, who or what ran it, and a link to the branch.
6. **A human reviews** the branch and merges or discards it.

## 5a. Key moment: one place for skills, and a tracker so nobody doubles up

**Skills live on the server, not on people's computers.** The manager writes or imports skills in the app. A teammate (or a routine) installs nothing: it connects to the MCP server, which hands over the skill's prompt. Each skill can list what it needs (tools, keys) so a run stops early with a clear message when the machine cannot do it. Making the machine ready is the team's responsibility.

**The tracker lives in the MCP server.** The unit of work is *a skill on a target*. A target is anything the skill can be applied to: a website, a repo, a client, a file, a ticket, a dataset, a folder. Websites are only one example (for instance "sales skill on site A", "code review on PR 42", "translation of file X").

| Piece | Meaning |
|---|---|
| **State** | available, claimed (who, since when), done (when, result branch, summary), failed (reason), skipped (who, why). |
| **Claim + lease** | Starting a work item claims it. The claim expires after a set time unless refreshed, so a closed laptop frees the site. |
| **Cooldown** | Optional rule: do not redo a target within N days of its last success. |
| **Board** | A page showing every target, its last run, who is on it now, and what is available. |

**The AI makes the choices inside rules the server enforces.** The teammate's Claude (or a routine) asks the server what work is available, decides which item to take or whether to take none, and reports back. The server is the source of truth: it only offers eligible items (not claimed, not in cooldown), refuses a second claim, and suggests an order (priority, oldest first). The AI cannot override those rules.

Planned MCP tools: list available work, get a skill, claim an item, keep the claim alive, complete (with a summary and the result link), fail (with a reason), skip (with a reason), show the board.

Flow: ask for available work, choose, claim, do the work on a branch, report "done" or "failed" with a summary. The manager reads the board. A routine is the same flow on a schedule, in one loop within its budget.

Limit: the tracker only knows about runs that check in. A skill run by hand without the MCP server is invisible. So the served skill starts with "claim" and ends with "report", and we say plainly that outside runs are not tracked.

Other things to plan for:
- Whoever can edit a skill controls what unattended routines do. Only managers edit skills; each change is a new version with a log; routines run an approved version.
- A routine has a prefix (policy): guardrails (follow the client's branching strategy, never touch `main`, no secrets) and output format. Order: team policy, routine prefix, skill.
- A routine = skill + prefix + targets + schedule + budget. Targets are registered by the manager (or discovered, open question). It goes through all targets by a rule ("every night"), or the manager picks one target in a simple form and runs it now. It loops in one run, because routines have daily run caps.
- Server-hosted skills carry instructions only. If a skill also needs scripts, tools or files (for example the Rando SEO audit helpers), those must exist where the run happens, such as the repo it checks out. To check what each skill needs.

## 6. Server and web app

- **Web app:** template library (browse, add, edit, version, copy), task queue, routine setup (schedule, budget, which templates), results and status.
- **Remote MCP server:** the interface Claude connects to. Planned tools: list templates, get a template, add a task, claim the next task, complete a task with its result link, fail a task with a reason, show team status.
- **Data:** templates (with versions), tasks, runs, results.
- **Access:** only team members can sign in. Sign-in is simple first; GitHub sign-in is a later feature, not a requirement.
- **Stack leaning:** Next.js + Appwrite, matching the Rando stack (to confirm).
- **Server safety:** small, no stored AI credentials, public rules, backups, audit log of template and routine changes.

## 7. Roles (a standalone feature, kept simple)

Roles are an ordinary permissions feature of the app, like in any team tool. They are not a security system, and team mode does not need the clan trust ladder (that is parked in `security/SECURITY.md`).

| Permission | Lead | Member |
|---|---|---|
| Edit skills, prefix (policy), templates | yes | no (can suggest) |
| Create or change routines and schedules | yes | no |
| Register targets | yes | yes |
| Take and run work (claim, complete, fail, skip) | yes | yes |
| Release someone else's stuck claim | yes | no |
| Invite or remove members | yes | no |
| View the board and results | yes | yes |

An optional **viewer** (read-only) and a **reviewer** (approves merges of AI branches) can be added later if needed. Skill changes make a new version; unattended routines run only an approved version.

## 8. Safety for team mode

- Unattended runs use approved templates only and trusted inputs.
- Risk label on every template: *report only* (read-only) or *changes files* (edits in the workspace). Unattended runs prefer report-only.
- Fresh workspace per run, no secrets, no write access to protected branches; branches (per the client's strategy) are the only output.
- Inputs can still contain prompt injection (for example code under review). So review runs should have no secrets and minimal tools.
- Budget and timeout on every run; the run stops itself.
- Human review before anything merges. AI review and AI changes are advice.
- Routines are in research preview, so limits and behaviour may change; check the official docs.

## 9. Prototype status

There is an early local prototype built for the clan idea (`mcp/index.mjs`, `skills/adopt/SKILL.md`, `clan.yml`). It lists cleared GitHub issues, previews prompts, forks, flags sensitive files and opens a PR. It passes a self-test and an MCP handshake, but it was never run end to end. **It is out of focus now.** Nothing for team mode (templates, queue, routines, web app) is built.

## 10. Parked: clan mode (later)

The public version: groups of people (clans) with vetted roles picking up cleared tasks on open-source and public-interest projects, with a trust ladder and several security checker roles. The design lives in `POSITIONING.md` and `security/SECURITY.md`. Team mode is the first step toward it: a team is just a small trusted clan, and the template library could later be shared between teams.

## 11. Caveats still open

- Who builds and hosts the server, and how the remote MCP endpoint is secured.
- Prompt injection has no reliable detector; keep tools minimal and runs read-only where possible.
- Routines are in research preview: limits, daily run caps and behaviour may change.
- Good templates take care to write; poor ones waste capacity.
- AI output quality varies; always human reviewed.
- Licence for the tool (permissive or AGPL), the name and domain are undecided.
- The "unused capacity" claim has no published figure; wording stays "many people do not use their full limit".

## 12. Open questions

1. Who can create and edit templates: only the lead, or any member? Who approves for unattended runs?
2. What limits a routine's run: number of tasks, time, or a usage threshold?
3. Where do results go: always a branch, or also a comment or report page? Which branching strategies do we offer clients by default, and where is the choice set (per team, per routine, per template)?
4. How is the queue tracked: our own database, or GitHub issues?
5. How do people run a task on demand: copy-paste first, or a skill that fetches the next task?
6. Which templates make the first demo: SEO audit and code review?
7. Name, licence, and who builds what.
8. Is a skill done once per target or repeatedly (cooldown)? What does it produce: a branch with changes, or a report? (Example: the sales skill.)
9. Who runs it: teammates by hand after work, a routine, or both?
10. How long should a claim last before it frees up, and who may force-release a stuck one?
11. Are targets a list the manager registers (our assumption), or discovered automatically (for example from a repo list or an issue tracker)?
12. What does each skill need beyond its prompt (scripts, tools, keys)?

## 13. Origin notes

From a voice discussion on 2026-10-17: many people leave part of their subscription unused; the first sketch was a skill and server that queue tasks and spend spare limit. Refinements: user-controlled and first-party runs only, a social anti-concentration mission, then a focus on teams, with a shared template library, scheduled routines and branch-only output; later, the branching strategy became the client's choice.
