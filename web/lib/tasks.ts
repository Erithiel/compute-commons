// Tasks (F2): versions, rows, personal notes. Only leads call saveTask (checked in the action).
import "server-only";
import { ID, Query } from "node-appwrite";
import { adminTables, allRows, DB_ID, rowOrNull, T, TEAM_ID } from "./appwrite";
import type { MemberNote, Task, TaskItem, TaskVersion } from "./types";

export const nextVersion = (current: number) => current + 1;

/** Trim, drop blanks and duplicates, keep order. */
export const cleanRows = (texts: string[]) => [...new Set(texts.map((t) => t.trim()).filter(Boolean))];

/** Browsers send textarea line breaks as \r\n; without this every save looks like a new prompt. */
export const normalise = (text: string) => text.replaceAll("\r\n", "\n").trim();

const db = () => adminTables();

export type TaskInput = { title: string; prompt: string; repeatDays: number; assignees: string[]; rows: string[] };

/** Create (no id) or edit a task. A changed prompt becomes a new version; returns the task and what changed for the audit. */
export async function saveTask(id: string | null, input: TaskInput, authorId: string) {
  const prompt = normalise(input.prompt);
  const old = id ? await rowOrNull<Task>(T.tasks, id) : null;
  if (id && !old) throw new Error("Task not found");
  const fields = { title: input.title.trim(), repeatDays: Math.max(0, input.repeatDays), assignees: input.assignees };
  const taskId = old?.$id ?? ID.unique();
  const cur = old && (await allRows<TaskVersion>(T.taskVersions, [Query.equal("taskId", taskId), Query.equal("version", old.currentVersion)]))[0];
  const version = cur?.prompt === prompt ? old!.currentVersion : nextVersion(old?.currentVersion ?? 0);

  if (version !== old?.currentVersion) {
    // The unique (taskId, version) index makes two leads saving at once fail instead of forking history.
    await db().createRow(DB_ID, T.taskVersions, ID.unique(), { taskId, version, prompt, authorId, createdAt: new Date().toISOString() });
  }
  const task = old
    ? await db().updateRow(DB_ID, T.tasks, taskId, { ...fields, currentVersion: version })
    : await db().createRow(DB_ID, T.tasks, taskId, { teamId: TEAM_ID, ...fields, currentVersion: version });
  await syncItems(taskId, input.rows);
  return { task: task as unknown as Task, created: !old, newVersion: version !== old?.currentVersion ? version : null };
}

export type TaskPatch = Partial<TaskInput> & { addAssignees?: string[]; removeAssignees?: string[]; addRows?: string[]; removeRows?: string[] };

/** A partial edit (the update_task MCP tool) applied to the task as it is now. Fields not given stay. */
export function patchTask(cur: TaskInput, p: TaskPatch): TaskInput {
  const edit = (base: string[], add: string[] = [], remove: string[] = []) => {
    const drop = new Set(remove.map((x) => x.trim()));
    return cleanRows([...base, ...add]).filter((x) => !drop.has(x));
  };
  return {
    title: p.title ?? cur.title,
    prompt: p.prompt ?? cur.prompt,
    repeatDays: p.repeatDays ?? cur.repeatDays,
    assignees: edit(p.assignees ?? cur.assignees, p.addAssignees, p.removeAssignees),
    rows: edit(p.rows ?? cur.rows, p.addRows, p.removeRows),
  };
}

/** Delete a task with its rows, their claims and members' notes on it. Logs and prompt versions stay as history. */
export async function deleteTask(taskId: string) {
  const [items, notes] = await Promise.all([
    allRows<TaskItem>(T.taskItems, [Query.equal("taskId", taskId)]),
    allRows<MemberNote>(T.memberNotes, [Query.equal("taskId", taskId)]),
  ]);
  await Promise.all([
    ...items.flatMap((i) => [db().deleteRow(DB_ID, T.taskItems, i.$id), db().deleteRow(DB_ID, T.claims, i.$id).catch(() => {})]),
    ...notes.map((n) => db().deleteRow(DB_ID, T.memberNotes, n.$id)),
  ]);
  await db().deleteRow(DB_ID, T.tasks, taskId);
}

/**
 * Make the task's items match the editor table. Removed rows are deleted (their logs keep the row text),
 * new rows start "available", kept rows keep their status and get their new position.
 * A task without rows has one hidden item "".
 */
export async function syncItems(taskId: string, rows: string[]) {
  const want = cleanRows(rows);
  if (!want.length) want.push("");
  const existing = await allRows<TaskItem>(T.taskItems, [Query.equal("taskId", taskId)]);
  const byText = new Map(existing.map((i) => [i.text ?? "", i]));
  await Promise.all([
    ...existing.filter((i) => !want.includes(i.text ?? "")).flatMap((i) => [
      db().deleteRow(DB_ID, T.taskItems, i.$id),
      db().deleteRow(DB_ID, T.claims, i.$id).catch(() => {}), // a claim on a removed row goes too
    ]),
    ...want.map((text, position) => {
      const found = byText.get(text);
      if (!found) return db().createRow(DB_ID, T.taskItems, ID.unique(), { teamId: TEAM_ID, taskId, text, position, status: "available", lastDoneAt: null, lastLogId: null });
      return found.position === position ? null : db().updateRow(DB_ID, T.taskItems, found.$id, { position });
    }),
  ]);
}

const noteRow = async (taskId: string, memberId: string) =>
  (await allRows<MemberNote>(T.memberNotes, [Query.equal("taskId", taskId), Query.equal("memberId", memberId)]))[0] ?? null;

/** A member's own note on a task ("" if none). Only their Claude receives it. */
export const getNote = async (taskId: string, memberId: string) => (await noteRow(taskId, memberId))?.text ?? "";

/** Save the caller's own note; empty text deletes it. */
export async function saveNote(taskId: string, memberId: string, text: string) {
  const clean = normalise(text);
  const row = await noteRow(taskId, memberId);
  if (!clean) { if (row) await db().deleteRow(DB_ID, T.memberNotes, row.$id); return; }
  const data = { taskId, memberId, text: clean, updatedAt: new Date().toISOString() };
  if (row) await db().updateRow(DB_ID, T.memberNotes, row.$id, data);
  else await db().createRow(DB_ID, T.memberNotes, ID.unique(), data);
}
