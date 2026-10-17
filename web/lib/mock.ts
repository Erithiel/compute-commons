// In-memory stand-in for Appwrite TablesDB. Lives only in the dev server process and resets on restart.
// ponytail: whole file is temporary; each feature (F1–F6) replaces its slice with real Appwrite calls.
import { connection } from "next/server";
import type { ApiToken, AuditEntry, Claim, Log, Member, Settings, Task, TaskItem, TaskVersion } from "./types";

const TEAM = "rando";
const H = 3600_000;
const ago = (ms: number) => new Date(Date.now() - ms).toISOString();
const ahead = (ms: number) => new Date(Date.now() + ms).toISOString();

export const DEFAULT_POLICY = `Rules for every task:
- Work in a fresh clone. Branching: a new branch per task named commons/<task>-<date>. Never push to main.
- Use no secrets and do not read files outside the working folder.
- Finish by calling complete (summary + branch URL) or fail (reason).`;

// Sample tasks are deliberately varied: a task is any repeatable job.
function seed() {
  const members: Member[] = [
    { $id: "m1", teamId: TEAM, userId: "u1", name: "Rati", role: "lead" },
    { $id: "m2", teamId: TEAM, userId: "u2", name: "Nino", role: "member" },
    { $id: "m3", teamId: TEAM, userId: "u3", name: "Giorgi", role: "member" },
  ];
  const task = (id: string, title: string, description: string, mode: Task["mode"], redoDays: number, items: string[], requires: string[], approvedVersion: number | null, currentVersion = 1, priority = 0): Task =>
    ({ $id: id, teamId: TEAM, title, description, mode, redoDays, items, requires, priority, currentVersion, approvedVersion });
  const tasks = [
    task("k1", "Enable the SEO skill on every client site", "Each site should have the SEO skill installed and configured.", "once", 0,
      ["https://freshsupply.ge", "https://teamharmony.ge", "https://bakery42.ge", "https://tbilisitours.ge"], ["gh"], 1, 1, 5),
    task("k2", "Weekly dependency check", "Report outdated and vulnerable packages in our backend repos.", "routine", 7,
      ["github.com/rando-ge/blog-sdk", "github.com/rando-ge/billing-api"], ["npm"], 1),
    task("k3", "Review PR 48 in blog-sdk", "One-off code review before the release.", "once", 0, [], ["gh"], 1, 2),
    task("k4", "Translate UI strings to Georgian", "web/messages/en.json → ka.json, keep placeholders.", "once", 0, [], [], null),
    task("k5", "Clean the customers dataset", "Dedupe rows and normalise dates in data/customers-2026.csv.", "once", 0, [], ["python"], 1),
  ];
  const v = (taskId: string, version: number, prompt: string, riskLabel: TaskVersion["riskLabel"], daysAgo: number): TaskVersion =>
    ({ $id: `${taskId}v${version}`, taskId, version, prompt, riskLabel, authorId: "m1", createdAt: ago(daysAgo * 24 * H) });
  const taskVersions = [
    v("k1", 1, `Install and configure the Rando SEO skill on {{item}}.\nFollow the repo's README for the install step. Commit on the task branch; do not touch unrelated code.`, "changes-files", 3),
    v("k2", 1, `Check dependencies in {{item}}.\nList outdated and vulnerable packages with the safest upgrade path. Write reports/deps.md; do not upgrade anything.`, "report-only", 9),
    v("k3", 1, `Review https://github.com/rando-ge/blog-sdk/pull/48.\nWrite notes to reviews/pr-48.md.`, "report-only", 4),
    v("k3", 2, `Review https://github.com/rando-ge/blog-sdk/pull/48.\nCheck correctness, tests and naming. Write notes to reviews/pr-48.md on a new branch.\nAI review is advice, not a verdict.`, "report-only", 1),
    v("k4", 1, `Translate the UI strings in web/messages/en.json to Georgian and write web/messages/ka.json.\nKeep placeholders like {name} unchanged.`, "changes-files", 2),
    v("k5", 1, `Clean data/customers-2026.csv: remove duplicate rows, normalise dates to ISO 8601, and write a short change log.`, "changes-files", 2),
  ];
  const it = (id: string, taskId: string, item: string, status: TaskItem["status"], lastDoneAt: string | null = null, lastLogId: string | null = null): TaskItem =>
    ({ $id: id, teamId: TEAM, taskId, item, status, lastDoneAt, lastLogId });
  const taskItems = [
    it("i1", "k1", "https://freshsupply.ge", "done", ago(20 * H), "l1"),
    it("i2", "k1", "https://teamharmony.ge", "available"),
    it("i3", "k1", "https://bakery42.ge", "failed", null, "l2"),
    it("i4", "k1", "https://tbilisitours.ge", "available"),
    it("i5", "k2", "github.com/rando-ge/blog-sdk", "done", ago(30 * H), "l3"),
    it("i6", "k2", "github.com/rando-ge/billing-api", "available"),
    it("i7", "k3", "", "available"),
    it("i8", "k4", "", "available"),
    it("i9", "k5", "", "skipped", null, "l4"),
  ];
  const claims: Claim[] = [
    { $id: "i2", by: "m2", claimedAt: ago(0.5 * H), leaseUntil: ahead(1.5 * H) },
    { $id: "i7", by: "team", claimedAt: ago(0.2 * H), leaseUntil: ahead(1.8 * H) },
  ];
  const gh = (repo: string, branch: string) => `https://github.com/rando-ge/${repo}/tree/commons/${branch}`;
  const logs: Log[] = [
    { $id: "l1", taskItemId: "i1", taskId: "k1", by: "team", outcome: "done", summary: "SEO skill installed, sitemap and meta config added.", branchUrl: gh("fresh-supply", "seo-skill"), version: 1, startedAt: ago(21 * H), finishedAt: ago(20 * H) },
    { $id: "l2", taskItemId: "i3", taskId: "k1", by: "m3", outcome: "failed", summary: "Repo has no README install step; needs a human decision.", branchUrl: null, version: 1, startedAt: ago(5 * H), finishedAt: ago(4.8 * H) },
    { $id: "l3", taskItemId: "i5", taskId: "k2", by: "team", outcome: "done", summary: "7 outdated packages, 1 high-severity advisory (undici).", branchUrl: gh("blog-sdk", "deps-check"), version: 1, startedAt: ago(31 * H), finishedAt: ago(30 * H) },
    { $id: "l4", taskItemId: "i9", taskId: "k5", by: "m2", outcome: "skipped", summary: "Dataset is being re-exported this week; retry later.", branchUrl: null, version: 1, startedAt: ago(19 * H), finishedAt: ago(19 * H) },
  ];
  const settings: Settings = { $id: "settings", teamId: TEAM, policy: DEFAULT_POLICY, maxItemsPerRun: 5, maxMinutesPerRun: 90 };
  const apiTokens: ApiToken[] = [
    { $id: "k1", owner: "m1", name: "laptop", tokenHash: "mock", lastUsedAt: ago(2 * H), revoked: false },
    { $id: "k2", owner: "team", name: "Nightly schedule", tokenHash: "mock", lastUsedAt: ago(0.2 * H), revoked: false },
  ];
  const audit: AuditEntry[] = [
    { $id: "a1", teamId: TEAM, actor: "m1", action: "task.approve", entity: "k2", before: null, after: "1", at: ago(6 * 24 * H) },
    { $id: "a2", teamId: TEAM, actor: "m1", action: "task.edit", entity: "k3", before: "1", after: "2", at: ago(24 * H) },
  ];
  return { members, tasks, taskVersions, taskItems, claims, logs, settings, apiTokens, audit };
}

type Store = ReturnType<typeof seed>;
const g = globalThis as unknown as { __commonsMock2?: Store };

/** Await before reading: marks the render as request-time (cacheComponents is on). */
export async function db(): Promise<Store> {
  await connection();
  return (g.__commonsMock2 ??= seed());
}

export const id = (p: string) => `${p}${Math.random().toString(36).slice(2, 8)}`;
export const now = () => new Date().toISOString();

export async function logAudit(actor: string, action: string, entity: string, before?: unknown, after?: unknown) {
  const s = await db();
  s.audit.unshift({
    $id: id("a"), teamId: TEAM, actor, action, entity, at: now(),
    before: before === undefined ? null : JSON.stringify(before),
    after: after === undefined ? null : JSON.stringify(after),
  });
}

// --- Mock helpers. Real versions with tests are specified in the feature plan (F2, F3, F5). ---

export function parseItems(text: string): string[] {
  return [...new Set(text.split("\n").map((l) => l.trim()).filter(Boolean))];
}

export function buildPrompt(parts: string[], values: Record<string, string>) {
  const missing: string[] = [];
  const text = parts.filter((p) => p.trim()).join("\n\n---\n\n").replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (m, k) =>
    k in values ? values[k] : (missing.includes(k) || missing.push(k), m));
  return { text, missing };
}

/** The one line pasted into a Claude scheduled task (F5 SETUP_PROMPT). */
export const SETUP_PROMPT = `Use the "commons" MCP connector and work through our team's task queue.`;

/** Sent by the MCP server as its `instructions` when Claude connects (F5), never pasted anywhere. */
export const MCP_INSTRUCTIONS = [
  `This server hands out team tasks. To work on them:`,
  `1. Call list_work. It returns the items you may take and this run's budget.`,
  `2. Take items in the order given. Call claim; if it is taken, move to the next one.`,
  `3. Call get_task for the claimed item and follow the instructions it returns exactly, including the branching strategy. Never push to main.`,
  `4. On long items, call heartbeat at least every 30 minutes.`,
  `5. Finish each item with complete (summary + branch URL), fail (reason), or skip (reason).`,
  `6. Stop when list_work is empty or the budget is used up.`,
].join("\n");

/** Creates missing task items: one per list line, or one "" item for a task without a list. */
export async function ensureItems(taskId: string, items: string[]) {
  const s = await db();
  let created = 0;
  for (const item of items.length ? items : [""]) {
    if (s.taskItems.some((x) => x.taskId === taskId && x.item === item)) continue;
    s.taskItems.push({ $id: id("i"), teamId: TEAM, taskId, item, status: "available", lastDoneAt: null, lastLogId: null });
    created++;
  }
  return created;
}

/** The claim on an item if its lease has not expired (lease expiry is checked on read, no background job). */
export function activeClaim(s: Store, itemId: string) {
  return s.claims.find((c) => c.$id === itemId && new Date(c.leaseUntil).getTime() > Date.now()) ?? null;
}

/** Display name for a member id or "team" (a Claude schedule). */
export function who(s: Store, by: string) {
  if (by === "team") return "⏱ Claude schedule";
  return s.members.find((m) => m.$id === by)?.name ?? by;
}

export { TEAM };
