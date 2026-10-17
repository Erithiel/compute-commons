// Sample data for `npm run setup:appwrite -- --sample` (was the in-memory mock store).
import { T } from "../lib/tables";
import type { AuditEntry, Claim, Log, Member, MemberNote, Task, TaskItem, TaskVersion } from "../lib/types";

const TEAM = process.env.TEAM_ID ?? "rando";
const H = 3600_000;
const ago = (ms: number) => new Date(Date.now() - ms).toISOString();
const ahead = (ms: number) => new Date(Date.now() + ms).toISOString();

// Sample tasks are deliberately varied: a task is a prompt, and a prompt can ask for anything.
export function sample() {
  const members: Member[] = [
    { $id: "m1", teamId: TEAM, userId: "u1", name: "Rati", role: "lead" },
    { $id: "m2", teamId: TEAM, userId: "u2", name: "Nino", role: "member" },
    { $id: "m3", teamId: TEAM, userId: "u3", name: "Giorgi", role: "member" },
  ];
  const task = (id: string, title: string, repeatDays: number, assignees: string[], currentVersion = 1): Task =>
    ({ $id: id, teamId: TEAM, title, repeatDays, repeatFor: 0, columns: [], assignees, currentVersion });
  const tasks = [
    task("k1", "Client brief for each new lead", 0, ["m2", "m3"]),
    task("k2", "Weekly competitor price check", 7, ["m1"]),
    task("k3", "Enable the SEO skill on client sites", 0, [], 2),
    task("k4", "Translate the October newsletter to Georgian", 0, ["m2"]),
    task("k5", "Clean the customers spreadsheet", 0, []),
  ];
  const v = (taskId: string, version: number, prompt: string, daysAgo: number): TaskVersion =>
    ({ $id: `${taskId}v${version}`, taskId, version, prompt, authorId: "m1", createdAt: ago(daysAgo * 24 * H) });
  const taskVersions = [
    v("k1", 1, `Research the company from public sources.\nWrite a one-page brief: what they do, their likely needs, and three ideas for the first call.`, 3),
    v("k2", 1, `Visit the competitor's website and note the prices of their website packages (name, price, what is included).\nCompare with last week's log for this item and point out what changed.`, 9),
    v("k3", 1, `Install the Rando SEO skill on the site.`, 4),
    v("k3", 2, `Install and configure the Rando SEO skill in the site's repo, following its README.\nCommit on a new branch (never main) and put the branch link in your details.`, 1),
    v("k4", 1, `Translate the October newsletter (shared drive: Newsletters/2026-10.md) into Georgian.\nKeep the tone friendly and keep links unchanged. Save it next to the original as 2026-10.ka.md.`, 2),
    v("k5", 1, `Clean the "Customers 2026" spreadsheet: remove duplicate rows and write all dates as YYYY-MM-DD.\nList what you changed in the details.`, 2),
  ];
  const it = (id: string, taskId: string, text: string, position: number, status: TaskItem["status"] = "available", lastDoneAt: string | null = null, lastLogId: string | null = null): TaskItem =>
    ({ $id: id, teamId: TEAM, taskId, text, position, status, lastDoneAt, lastLogId });
  const taskItems = [
    it("i1", "k1", "Acme Logistics (acme.ge)", 0, "done", ago(20 * H), "l1"),
    it("i2", "k1", "Green Cafe (greencafe.ge)", 1),
    it("i3", "k1", "Tbilisi Tours (tbilisitours.ge)", 2, "failed", null, "l2"),
    it("i4", "k2", "webstudio.ge", 0, "done", ago(30 * H), "l3"),
    it("i5", "k2", "sitemakers.ge", 1),
    it("i6", "k3", "freshsupply.ge", 0),
    it("i7", "k3", "bakery42.ge", 1),
    it("i8", "k4", "", 0),
    it("i9", "k5", "", 0, "skipped", null, "l4"),
  ];
  const claims: Claim[] = [
    { $id: "i2", by: "m2", scheduled: false, claimedAt: ago(0.5 * H), leaseUntil: ahead(1.5 * H) },
    { $id: "i6", by: "m3", scheduled: true, claimedAt: ago(0.2 * H), leaseUntil: ahead(1.8 * H) },
  ];
  const logs: Log[] = [
    { $id: "l1", taskId: "k1", itemId: "i1", item: "Acme Logistics (acme.ge)", by: "m2", scheduled: true, outcome: "done", summary: "Brief ready: mid-size logistics firm, outdated site, no online booking.", details: `Acme Logistics runs trucking between Tbilisi and Batumi (12 trucks).
Likely needs: an online quote form, a Georgian/English site, Google Maps listing.
Call ideas: 1) show a quote-form demo, 2) compare with their competitor's site, 3) offer a small first project.`, version: 1, startedAt: ago(21 * H), finishedAt: ago(20 * H) },
    { $id: "l2", taskId: "k1", itemId: "i3", item: "Tbilisi Tours (tbilisitours.ge)", by: "m3", scheduled: false, outcome: "failed", summary: "Website is down, not enough public info for a brief.", details: `tbilisitours.ge returns 503. Their Facebook page has no posts since 2024.
Needs a human: ask the lead for a contact or another source.`, version: 1, startedAt: ago(5 * H), finishedAt: ago(4.8 * H) },
    { $id: "l3", taskId: "k2", itemId: "i4", item: "webstudio.ge", by: "m1", scheduled: true, outcome: "done", summary: "Basic package went up from 900 to 1,100 GEL.", details: `Basic: 1,100 GEL (was 900) - 5 pages, hosting 1 year.
Business: 2,400 GEL (unchanged).
New: "SEO add-on" for 300 GEL/month.`, version: 1, startedAt: ago(31 * H), finishedAt: ago(30 * H) },
    { $id: "l4", taskId: "k5", itemId: "i9", item: "", by: "m2", scheduled: false, outcome: "skipped", summary: "Spreadsheet is being re-exported this week; retry later.", details: null, version: 1, startedAt: ago(19 * H), finishedAt: ago(19 * H) },
  ];
  const memberNotes: MemberNote[] = [
    { $id: "n1", taskId: "k5", memberId: "m2", text: "The spreadsheet is in my Google Drive: Sales/Customers 2026. Use the gdrive connector.", updatedAt: ago(48 * H) },
    { $id: "n2", taskId: "k3", memberId: "m3", text: "Client site repos are cloned under ~/code/clients/<site>.", updatedAt: ago(24 * H) },
  ];
  const audit: AuditEntry[] = [
    { $id: "a1", teamId: TEAM, actor: "m1", action: "task.create", entity: "k2", before: null, after: "1", at: ago(6 * 24 * H) },
    { $id: "a2", teamId: TEAM, actor: "m1", action: "task.edit", entity: "k3", before: "1", after: "2", at: ago(24 * H) },
  ];
  return {
    [T.members]: members, [T.tasks]: tasks, [T.taskVersions]: taskVersions, [T.taskItems]: taskItems, [T.memberNotes]: memberNotes,
    [T.claims]: claims, [T.logs]: logs, [T.audit]: audit,
  } as unknown as Record<string, Array<{ $id: string } & Record<string, unknown>>>;
}

