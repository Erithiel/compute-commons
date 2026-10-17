// In-memory stand-in for Appwrite TablesDB. Lives only in the dev server process and resets on restart.
// ponytail: whole file is temporary; each feature (F1–F6) replaces its slice with real Appwrite calls.
import { connection } from "next/server";
import type { ApiToken, AuditEntry, Claim, Log, Member, Settings, Task, TaskItem, TaskVersion } from "./types";

const TEAM = "rando";
const H = 3600_000;
const ago = (ms: number) => new Date(Date.now() - ms).toISOString();
const ahead = (ms: number) => new Date(Date.now() + ms).toISOString();

export const DEFAULT_POLICY = `Rules for every task:
- Use no secrets and do not touch anything the task does not ask for.
- If the task is unclear or needs a human decision, stop and call fail with the reason.
- Finish by calling complete with a short summary and details (what you did, where the result is, anything a human should know).`;

// Sample tasks are deliberately varied: a task is any repeatable job, not only code.
function seed() {
  const members: Member[] = [
    { $id: "m1", teamId: TEAM, userId: "u1", name: "Rati", role: "lead" },
    { $id: "m2", teamId: TEAM, userId: "u2", name: "Nino", role: "member" },
    { $id: "m3", teamId: TEAM, userId: "u3", name: "Giorgi", role: "member" },
  ];
  const task = (id: string, title: string, description: string, mode: Task["mode"], redoDays: number, items: string[], assignees: string[] = [], currentVersion = 1, priority = 0): Task =>
    ({ $id: id, teamId: TEAM, title, description, mode, redoDays, items, assignees, priority, currentVersion });
  const tasks = [
    task("k1", "Client brief for each new lead", "One page per lead before the first sales call.", "once", 0,
      ["Acme Logistics (acme.ge)", "Green Cafe (greencafe.ge)", "Tbilisi Tours (tbilisitours.ge)"], ["m2", "m3"], 1, 5),
    task("k2", "Weekly competitor price check", "Track what competitors charge for website packages.", "routine", 7,
      ["webstudio.ge", "sitemakers.ge"], ["m1"]),
    task("k3", "Enable the SEO skill on every client site", "Each client site should have the SEO skill installed.", "once", 0,
      ["freshsupply.ge", "bakery42.ge"], [], 2),
    task("k4", "Translate the October newsletter to Georgian", "For the Georgian mailing list.", "once", 0, [], ["m2"]),
    task("k5", "Clean the customers spreadsheet", "Remove duplicates and fix date formats.", "once", 0, []),
  ];
  const v = (taskId: string, version: number, prompt: string, daysAgo: number): TaskVersion =>
    ({ $id: `${taskId}v${version}`, taskId, version, prompt, authorId: "m1", createdAt: ago(daysAgo * 24 * H) });
  const taskVersions = [
    v("k1", 1, `Research {{item}} from public sources.\nWrite a one-page brief: what they do, their likely needs, and three ideas for the first call.\nPut the brief in the details of your complete call.`, 3),
    v("k2", 1, `Visit {{item}} and note the prices of their website packages (name, price, what is included).\nCompare with last week's log for this item and point out what changed.`, 9),
    v("k3", 1, `Install the Rando SEO skill on {{item}}.`, 4),
    v("k3", 2, `Install and configure the Rando SEO skill on the {{item}} site repo, following its README.\nCommit on a new branch (never main) and put the branch link in your details.`, 1),
    v("k4", 1, `Translate the October newsletter (shared drive: Newsletters/2026-10.md) into Georgian.\nKeep the tone friendly and keep links unchanged. Save it next to the original as 2026-10.ka.md.`, 2),
    v("k5", 1, `Clean the "Customers 2026" spreadsheet: remove duplicate rows and write all dates as YYYY-MM-DD.\nList what you changed in the details.`, 2),
  ];
  const it = (id: string, taskId: string, item: string, status: TaskItem["status"], lastDoneAt: string | null = null, lastLogId: string | null = null): TaskItem =>
    ({ $id: id, teamId: TEAM, taskId, item, status, lastDoneAt, lastLogId });
  const taskItems = [
    it("i1", "k1", "Acme Logistics (acme.ge)", "done", ago(20 * H), "l1"),
    it("i2", "k1", "Green Cafe (greencafe.ge)", "available"),
    it("i3", "k1", "Tbilisi Tours (tbilisitours.ge)", "failed", null, "l2"),
    it("i4", "k2", "webstudio.ge", "done", ago(30 * H), "l3"),
    it("i5", "k2", "sitemakers.ge", "available"),
    it("i6", "k3", "freshsupply.ge", "available"),
    it("i7", "k3", "bakery42.ge", "available"),
    it("i8", "k4", "", "available"),
    it("i9", "k5", "", "skipped", null, "l4"),
  ];
  const claims: Claim[] = [
    { $id: "i2", by: "m2", scheduled: false, claimedAt: ago(0.5 * H), leaseUntil: ahead(1.5 * H) },
    { $id: "i6", by: "m3", scheduled: true, claimedAt: ago(0.2 * H), leaseUntil: ahead(1.8 * H) },
  ];
  const logs: Log[] = [
    { $id: "l1", taskItemId: "i1", taskId: "k1", by: "m2", scheduled: true, outcome: "done", summary: "Brief ready: mid-size logistics firm, outdated site, no online booking.", details: `Acme Logistics runs trucking between Tbilisi and Batumi (12 trucks).
Likely needs: an online quote form, a Georgian/English site, Google Maps listing.
Call ideas: 1) show a quote-form demo, 2) compare with their competitor's site, 3) offer a small first project.`, version: 1, startedAt: ago(21 * H), finishedAt: ago(20 * H) },
    { $id: "l2", taskItemId: "i3", taskId: "k1", by: "m3", scheduled: false, outcome: "failed", summary: "Website is down, not enough public info for a brief.", details: `tbilisitours.ge returns 503. Their Facebook page has no posts since 2024.
Needs a human: ask the lead for a contact or another source.`, version: 1, startedAt: ago(5 * H), finishedAt: ago(4.8 * H) },
    { $id: "l3", taskItemId: "i4", taskId: "k2", by: "m1", scheduled: true, outcome: "done", summary: "Basic package went up from 900 to 1,100 GEL.", details: `Basic: 1,100 GEL (was 900) - 5 pages, hosting 1 year.
Business: 2,400 GEL (unchanged).
New: "SEO add-on" for 300 GEL/month.`, version: 1, startedAt: ago(31 * H), finishedAt: ago(30 * H) },
    { $id: "l4", taskItemId: "i9", taskId: "k5", by: "m2", scheduled: false, outcome: "skipped", summary: "Spreadsheet is being re-exported this week; retry later.", details: null, version: 1, startedAt: ago(19 * H), finishedAt: ago(19 * H) },
  ];
  const settings: Settings = { $id: "settings", teamId: TEAM, policy: DEFAULT_POLICY };
  const apiTokens: ApiToken[] = [
    { $id: "k1", owner: "m1", scheduled: false, name: "laptop", tokenHash: "mock", lastUsedAt: ago(2 * H), revoked: false },
    { $id: "k2", owner: "m1", scheduled: true, name: "Nightly schedule", tokenHash: "mock", lastUsedAt: ago(0.2 * H), revoked: false },
  ];
  const audit: AuditEntry[] = [
    { $id: "a1", teamId: TEAM, actor: "m1", action: "task.create", entity: "k2", before: null, after: "1", at: ago(6 * 24 * H) },
    { $id: "a2", teamId: TEAM, actor: "m1", action: "task.edit", entity: "k3", before: "1", after: "2", at: ago(24 * H) },
  ];
  return { members, tasks, taskVersions, taskItems, claims, logs, settings, apiTokens, audit };
}

type Store = ReturnType<typeof seed>;
const g = globalThis as unknown as { __commonsMock7?: Store };

/** Await before reading: marks the render as request-time (cacheComponents is on). */
export async function db(): Promise<Store> {
  await connection();
  return (g.__commonsMock7 ??= seed());
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
  `1. Call next_task. It claims the next free item for you and returns its instructions. If it returns nothing, stop.`,
  `2. (To pick a specific item instead: call list_work, then claim it. If claim says taken or done, choose another.)`,
  `3. Follow the instructions you got exactly. Never work on an item you have not claimed.`,
  `4. On long items, call heartbeat at least every 30 minutes.`,
  `5. Finish each item with complete (a short summary, and details: what you did, where the result is, anything a human should know), fail (reason), or skip (reason).`,
  `6. Repeat from step 1 until next_task returns nothing.`,
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

/** Assignment rule: no assignees = anyone; otherwise only those listed (their schedules included). */
export const canTake = (task: Task, by: string) => task.assignees.length === 0 || task.assignees.includes(by);

/** Display name for a member id; adds "scheduled" for runs from that person's Claude schedule. */
export function who(s: Store, by: string, scheduled = false): string {
  if (scheduled) return `${who(s, by)} · ⏱ scheduled`;
  return s.members.find((m) => m.$id === by)?.name ?? by;
}

export { TEAM };
