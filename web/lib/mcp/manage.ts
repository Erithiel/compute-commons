// Read tools (any member) and management tools (leads): tasks, routines, assignments, members, the team policy.
// A routine is a task with repeatDays > 0 (D16). Members and tasks are named by name or id (pickOne).
import "server-only";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/server";
import { audit } from "../audit";
import { itemState, itemsOf, loadStore, noteOf, promptOf, repeatLabel, who, type Store } from "../mock";
import { deleteTask, patchTask, saveTask, type TaskInput } from "../tasks";
import * as team from "../team";
import type { Task } from "../types";
import { leadOnly, ok, pickOne, run } from "./reply";

const memberRef = (s: Store, ref: string) => pickOne(s.members, ref, (m) => m.name, "member");
const taskRef = (s: Store, ref: string) => pickOne(s.tasks, ref, (t) => t.title, "task");
const memberIds = (s: Store, refs: string[] = []) => refs.map((r) => memberRef(s, r).$id);
const names = (s: Store, ids: string[]) => (ids.length ? ids.map((id) => who(s, id)) : ["anyone"]);

const inputOf = (s: Store, t: Task): TaskInput => ({
  title: t.title, prompt: promptOf(s, t), repeatDays: t.repeatDays, assignees: t.assignees,
  rows: itemsOf(s, t.$id).map((i) => i.text).filter(Boolean),
});

function overview(s: Store, t: Task) {
  const items = itemsOf(s, t.$id);
  const keys = items.map((i) => itemState(s, i).key);
  return {
    taskId: t.$id, title: t.title, repeat: repeatLabel(t), assignedTo: names(s, t.assignees),
    rows: items.filter((i) => i.text).length, done: keys.filter((k) => k === "done").length, inProgress: keys.filter((k) => k === "in progress").length,
  };
}

const taskArg = z.string().describe("Task id or exact title (see list_tasks).");
const memberArg = z.string().describe("Member name or id (see list_members).");
const people = z.array(z.string()).describe("Member names or ids (see list_members).");
const repeatDays = z.number().int().min(0).max(365).describe("0 = do once. N = a routine: each row comes back N days after it was last done.");
const role = z.enum(["lead", "member"]);

export function registerManageTools(server: McpServer) {
  // --- Read (any member) ---
  server.registerTool("list_members", {
    description: "Everyone on the team with their role. 'you' marks the caller. Only leads can create or edit tasks and members.",
    inputSchema: z.object({}),
    annotations: { readOnlyHint: true },
  }, async (_args, ctx) => run(ctx, async (caller) => {
    const s = await loadStore();
    return ok(`${s.members.length} member(s).`, s.members.map((m) => ({ memberId: m.$id, name: m.name, role: m.role, you: m.$id === caller.memberId })));
  }));

  server.registerTool("list_tasks", {
    description: "All tasks and routines with who they are assigned to and progress. Optional query filters by title.",
    inputSchema: z.object({ query: z.string().optional() }),
    annotations: { readOnlyHint: true },
  }, async ({ query }, ctx) => run(ctx, async () => {
    const s = await loadStore();
    const q = query?.trim().toLowerCase() ?? "";
    const tasks = s.tasks.filter((t) => t.title.toLowerCase().includes(q));
    return ok(`${tasks.length} task(s).`, tasks.map((t) => overview(s, t)));
  }));

  server.registerTool("view_task", {
    description: "One task in full: its prompt (version in use), rows with their state and itemId, assignees, your own note and the last 5 logs. Read it before editing.",
    inputSchema: z.object({ task: taskArg }),
    annotations: { readOnlyHint: true },
  }, async ({ task }, ctx) => run(ctx, async (caller) => {
    const s = await loadStore();
    const t = taskRef(s, task);
    return ok(`"${t.title}", prompt v${t.currentVersion}, ${repeatLabel(t)}.`, {
      ...overview(s, t), version: t.currentVersion, prompt: promptOf(s, t), myNote: noteOf(s, t.$id, caller.memberId),
      items: itemsOf(s, t.$id).map((i) => ({ itemId: i.$id, row: i.text, state: itemState(s, i).label })),
      recentLogs: s.logs.filter((l) => l.taskId === t.$id).slice(0, 5)
        .map((l) => ({ at: l.finishedAt, by: who(s, l.by, l.scheduled), row: l.item, outcome: l.outcome, summary: l.summary })),
    });
  }));

  server.registerTool("list_logs", {
    description: "Who did what, newest first: filter by task, member and outcome. Includes the details each run reported.",
    inputSchema: z.object({
      task: taskArg.optional(), member: memberArg.optional(),
      outcome: z.enum(["done", "failed", "skipped"]).optional(), limit: z.number().int().min(1).max(100).optional().describe("Default 20."),
    }),
    annotations: { readOnlyHint: true },
  }, async ({ task, member, outcome, limit }, ctx) => run(ctx, async () => {
    const s = await loadStore();
    const t = task ? taskRef(s, task) : null;
    const m = member ? memberRef(s, member) : null;
    const logs = s.logs.filter((l) => (!t || l.taskId === t.$id) && (!m || l.by === m.$id) && (!outcome || l.outcome === outcome)).slice(0, limit ?? 20);
    return ok(`${logs.length} log(s), newest first.`, logs.map((l) => ({
      at: l.finishedAt, by: who(s, l.by, l.scheduled), task: s.tasks.find((x) => x.$id === l.taskId)?.title ?? "(deleted task)",
      row: l.item, outcome: l.outcome, summary: l.summary, details: l.details, version: l.version,
    })));
  }));

  server.registerTool("get_policy", {
    description: "The team policy: rules placed before every task prompt (how to deliver results, what never to touch).",
    inputSchema: z.object({}),
    annotations: { readOnlyHint: true },
  }, async (_args, ctx) => run(ctx, async () => ok("The team policy, placed before every task prompt.", { policy: (await loadStore()).settings.policy })));

  // --- Tasks and routines (leads) ---
  server.registerTool("create_task", {
    description: "Create a task: a title and a prompt (free text: what to do and where the result goes). With repeatDays it is a routine. Rows = the things to do it for (clients, sites, files); each row is claimed separately. No assignees = anyone.",
    inputSchema: z.object({
      title: z.string().min(1), prompt: z.string().min(1),
      repeatDays: repeatDays.optional(), assignees: people.optional(), rows: z.array(z.string()).optional(),
    }),
  }, async (a, ctx) => run(ctx, async (caller) => {
    leadOnly(caller);
    const s = await loadStore();
    const { task } = await saveTask(null, {
      title: a.title, prompt: a.prompt, repeatDays: a.repeatDays ?? 0, assignees: memberIds(s, a.assignees), rows: a.rows ?? [],
    }, caller.memberId);
    await audit(caller.memberId, "task.create", task.$id, undefined, { title: task.title, version: task.currentVersion, via: "mcp" });
    return ok(`Created "${task.title}".`, overview(await loadStore(), task));
  }));

  server.registerTool("update_task", {
    description: "Edit a task: give only what changes. A changed prompt becomes a new version (history kept). Removing a row drops its status; its logs stay. Confirm with the user before removing rows.",
    inputSchema: z.object({
      task: taskArg,
      title: z.string().min(1).optional(),
      prompt: z.string().min(1).optional().describe("Replaces the whole prompt."),
      repeatDays: repeatDays.optional(),
      assignees: people.optional().describe("Replaces the assignee list. [] = anyone."),
      addAssignees: people.optional(), removeAssignees: people.optional(),
      rows: z.array(z.string()).optional().describe("Replaces all rows."),
      addRows: z.array(z.string()).optional(), removeRows: z.array(z.string()).optional(),
    }),
  }, async ({ task, ...p }, ctx) => run(ctx, async (caller) => {
    leadOnly(caller);
    const s = await loadStore();
    const t = taskRef(s, task);
    const next = patchTask(inputOf(s, t), {
      ...p,
      assignees: p.assignees && memberIds(s, p.assignees),
      addAssignees: memberIds(s, p.addAssignees),
      removeAssignees: memberIds(s, p.removeAssignees),
    });
    const { task: saved, newVersion } = await saveTask(t.$id, next, caller.memberId);
    await audit(caller.memberId, "task.edit", saved.$id, undefined, { title: saved.title, version: saved.currentVersion, newVersion, via: "mcp" });
    return ok(`Updated "${saved.title}"${newVersion ? `; prompt is now v${newVersion}` : ""}.`, overview(await loadStore(), saved));
  }));

  server.registerTool("delete_task", {
    description: "Delete a task and its rows. Logs and prompt history stay. Confirm with the user first.",
    inputSchema: z.object({ task: taskArg }),
    annotations: { destructiveHint: true },
  }, async ({ task }, ctx) => run(ctx, async (caller) => {
    leadOnly(caller);
    const t = taskRef(await loadStore(), task);
    await deleteTask(t.$id);
    await audit(caller.memberId, "task.delete", t.$id, { title: t.title }, undefined);
    return ok(`Deleted "${t.title}". Its logs stay.`);
  }));

  // --- Team policy and members (leads) ---
  server.registerTool("set_policy", {
    description: "Replace the team policy (rules placed before every task prompt). Read get_policy first and keep what still applies.",
    inputSchema: z.object({ policy: z.string().min(1) }),
  }, async ({ policy }, ctx) => run(ctx, async (caller) => {
    leadOnly(caller);
    await team.savePolicy(caller.memberId, policy);
    return ok("Saved the team policy.");
  }));

  server.registerTool("add_member", {
    description: "Add a team member (default role: member). They then create their own Claude token in the web app (Connect Claude).",
    inputSchema: z.object({ name: z.string().min(1), role: role.optional() }),
  }, async ({ name, role: r }, ctx) => run(ctx, async (caller) => {
    leadOnly(caller);
    const m = await team.addMember(caller.memberId, name, r ?? "member");
    return ok(`Added "${m.name}" as ${m.role}.`, { memberId: m.$id });
  }));

  server.registerTool("set_member_role", {
    description: "Make a member a lead (can create and edit tasks) or a member.",
    inputSchema: z.object({ member: memberArg, role }),
  }, async ({ member, role: r }, ctx) => run(ctx, async (caller) => {
    leadOnly(caller);
    const m = await team.setRole(caller.memberId, memberRef(await loadStore(), member).$id, r);
    return ok(`"${m.name}" is now a ${r}.`);
  }));

  server.registerTool("remove_member", {
    description: "Remove a member from the team. Their tokens stop working; their logs stay. Confirm with the user first.",
    inputSchema: z.object({ member: memberArg }),
    annotations: { destructiveHint: true },
  }, async ({ member }, ctx) => run(ctx, async (caller) => {
    leadOnly(caller);
    const m = await team.removeMember(caller.memberId, memberRef(await loadStore(), member).$id);
    return ok(`Removed "${m.name}".`);
  }));
}
