// Worker tools (TECH §5): what a member's Claude uses to take, do and report work. Any member; each acts only for the caller.
import "server-only";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/server";
import { claim, claimNext, finish, heartbeat, listEligible, recordSkip, type ClaimFail } from "../claims";
import { claudePrompt, itemState, itemsOf, loadStore, repeatLabel } from "../mock";
import { saveNote } from "../tasks";
import { ok, pickOne, run } from "./reply";

const itemIdArg = z.string().describe("The itemId from next_task, list_work or view_task.");
const rowLabel = (text: string) => (text ? ` (row "${text}")` : "");
const REFUSED: Record<ClaimFail, string> = {
  taken: "Someone else is on it. Choose another.",
  done: "Already done. Choose another.",
  "not-assigned": "This task is assigned to other members.",
  "not-found": "No such item.",
};

export function registerWorkTools(server: McpServer) {
  server.registerTool("next_task", {
    description: "Main path. Claims the next free task (or one row of a task) for you and returns exactly what to do. When it says nothing is left, stop.",
    inputSchema: z.object({}),
  }, async (_args, ctx) => run(ctx, async (caller) => {
    const got = await claimNext(caller);
    if (!got) return ok("Nothing left for you. Stop.", { empty: true });
    const s = await loadStore();
    return ok(`Claimed "${got.task.title}"${rowLabel(got.item.text)} until ${got.leaseUntil}. Do the prompt, then call complete, fail or skip with this itemId.`, {
      itemId: got.item.$id, task: got.task.title, item: got.item.text, leaseUntil: got.leaseUntil,
      prompt: claudePrompt(s, got.task, got.item, caller.memberId),
    });
  }));

  server.registerTool("list_work", {
    description: "Free items you may claim now, best first. To pick a specific one, then call claim with its itemId.",
    inputSchema: z.object({ limit: z.number().int().min(1).max(50).optional().describe("Default 10.") }),
    annotations: { readOnlyHint: true },
  }, async ({ limit }, ctx) => run(ctx, async (caller) => {
    const work = await listEligible(caller, limit ?? 10);
    return ok(work.length ? `${work.length} free item(s).` : "Nothing free for you.", work.map(({ item, task, lastLog }) => ({
      itemId: item.$id, task: task.title, item: item.text, repeat: repeatLabel(task),
      lastLog: lastLog && { outcome: lastLog.outcome, summary: lastLog.summary, at: lastLog.finishedAt },
    })));
  }));

  server.registerTool("get_task", {
    description: "The full prompt for one item (team policy, task prompt, your own note, the row), plus who is on it now.",
    inputSchema: z.object({ itemId: itemIdArg }),
    annotations: { readOnlyHint: true },
  }, async ({ itemId }, ctx) => run(ctx, async (caller) => {
    const s = await loadStore();
    const item = s.taskItems.find((i) => i.$id === itemId);
    const task = item && s.tasks.find((t) => t.$id === item.taskId);
    if (!item || !task) throw new Error(`No item ${itemId}. Use list_work or view_task to find item ids.`);
    return ok(`"${task.title}"${rowLabel(item.text)}: ${itemState(s, item).label}.`, {
      itemId, task: task.title, item: item.text, prompt: claudePrompt(s, task, item, caller.memberId),
    });
  }));

  server.registerTool("claim", {
    description: "Claim one item so nobody else does it. Never work on an item you have not claimed.",
    inputSchema: z.object({ itemId: itemIdArg }),
  }, async ({ itemId }, ctx) => run(ctx, async (caller) => {
    const r = await claim(itemId, caller);
    return r.ok ? ok(`Claimed until ${r.leaseUntil}. Call get_task for the prompt.`, r) : ok(`Not claimed: ${REFUSED[r.reason]}`, r);
  }));

  server.registerTool("heartbeat", {
    description: "Extend your claim on long work. Call at least every 30 minutes.",
    inputSchema: z.object({ itemId: itemIdArg }),
  }, async ({ itemId }, ctx) => run(ctx, async (caller) => {
    const r = await heartbeat(itemId, caller);
    if (!r.ok) throw new Error("You do not hold this item. Claim it again before you continue.");
    return ok(`Lease extended until ${r.leaseUntil}.`, r);
  }));

  server.registerTool("complete", {
    description: "Finish an item you hold: a short summary, and details (what you did, where the result is, anything a human should know).",
    inputSchema: z.object({ itemId: itemIdArg, summary: z.string().min(1), details: z.string().optional() }),
  }, async ({ itemId, summary, details }, ctx) => run(ctx, async (caller) => {
    const log = await finish(itemId, caller, "done", { summary, details });
    return ok(`Logged as done (log ${log.$id}). Call next_task for more.`, { logId: log.$id });
  }));

  server.registerTool("fail", {
    description: "Give up on an item you hold, with the reason. It becomes free again for someone else.",
    inputSchema: z.object({ itemId: itemIdArg, reason: z.string().min(1), details: z.string().optional() }),
  }, async ({ itemId, reason, details }, ctx) => run(ctx, async (caller) => {
    const log = await finish(itemId, caller, "failed", { summary: reason, details });
    return ok(`Logged as failed (log ${log.$id}).`, { logId: log.$id });
  }));

  server.registerTool("skip", {
    description: "Decide not to do an item, with the reason (logged so the lead sees why). No claim needed.",
    inputSchema: z.object({ itemId: itemIdArg, reason: z.string().min(1) }),
  }, async ({ itemId, reason }, ctx) => run(ctx, async (caller) => {
    const log = await recordSkip(itemId, caller, reason);
    return ok(`Logged as skipped (log ${log.$id}).`, { logId: log.$id });
  }));

  server.registerTool("save_my_note", {
    description: "Save your own note on a task (e.g. where your files are). Only your Claude receives it, after the task prompt. Empty text removes it.",
    inputSchema: z.object({ task: z.string().describe("Task id or exact title."), text: z.string() }),
  }, async ({ task, text }, ctx) => run(ctx, async (caller) => {
    const s = await loadStore();
    const t = pickOne(s.tasks, task, (x) => x.title, "task");
    await saveNote(t.$id, caller.memberId, text);
    return ok(text.trim() ? `Saved your note on "${t.title}". Only your Claude receives it.` : `Removed your note on "${t.title}".`);
  }));

  server.registerTool("board", {
    description: "Who is working on what, what is free, what is done: every task and row with its state.",
    inputSchema: z.object({}),
    annotations: { readOnlyHint: true },
  }, async (_args, ctx) => run(ctx, async () => {
    const s = await loadStore();
    const states = s.taskItems.map((i) => itemState(s, i).key);
    const n = (key: string) => states.filter((k) => k === key).length;
    return ok(`${n("in progress")} in progress, ${n("free")} free, ${n("done")} done, ${n("failed")} failed.`, s.tasks.map((t) => ({
      taskId: t.$id, task: t.title, repeat: repeatLabel(t),
      items: itemsOf(s, t.$id).map((i) => ({ itemId: i.$id, item: i.text, state: itemState(s, i).label })),
    })));
  }));
}
