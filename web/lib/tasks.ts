// Tasks (F2): versions, rows, personal notes. Only leads call saveTask (checked in the action).
import "server-only";
import { ID, Query } from "node-appwrite";
import { adminTables, allRows, DB_ID, rowOrNull, T } from "./appwrite";
import type { MemberNote, Task, TaskItem, TaskVersion } from "./types";

export const nextVersion = (current: number) => current + 1;

/** Trim, drop blanks and duplicates, keep order. */
export const cleanRows = (texts: string[]) => [...new Set(texts.map((t) => t.trim()).filter(Boolean))];

/** Browsers send textarea line breaks as \r\n; without this every save looks like a new prompt. */
export const normalise = (text: string) => text.replaceAll("\r\n", "\n").trim();

const db = () => adminTables();

export type TaskInput = { title: string; prompt: string; repeatDays: number; assignees: string[]; rows: string[] };

/** Create (no id) or edit a task. A changed prompt becomes a new version; returns the task and what changed for the audit. */
export async function saveTask(teamId: string, id: string | null, input: TaskInput, authorId: string) {
  const prompt = normalise(input.prompt);
  const old = id ? await rowOrNull<Task>(T.tasks, id) : null;
  if (id && (!old || old.teamId !== teamId)) throw new Error("Task not found");
  const fields = { title: input.title.trim(), repeatDays: Math.max(0, input.repeatDays), assignees: input.assignees };
  const taskId = old?.$id ?? ID.unique();
  const cur = old && (await allRows<TaskVersion>(T.taskVersions, [Query.equal("taskId", taskId), Query.equal("version", old.currentVersion)]))[0];
  const version = cur?.prompt === prompt ? old!.currentVersion : nextVersion(old?.currentVersion ?? 0);

  if (version !== old?.currentVersion) {
    // The unique (taskId, version) index makes two leads saving at once fail instead of forking history.
    await db().createRow(DB_ID, T.taskVersions, ID.unique(), { teamId, taskId, version, prompt, authorId, createdAt: new Date().toISOString() });
  }
  const task = old
    ? await db().updateRow(DB_ID, T.tasks, taskId, { ...fields, currentVersion: version })
    : await db().createRow(DB_ID, T.tasks, taskId, { teamId, ...fields, currentVersion: version });
  await syncItems(teamId, taskId, input.rows);
  return { task: task as unknown as Task, created: !old, newVersion: version !== old?.currentVersion ? version : null };
}

/**
 * Make the task's items match the editor table. Removed rows are deleted (their logs keep the row text),
 * new rows start "available", kept rows keep their status and get their new position.
 * A task without rows has one hidden item "".
 */
export async function syncItems(teamId: string, taskId: string, rows: string[]) {
  const want = cleanRows(rows);
  if (!want.length) want.push("");
  const existing = await allRows<TaskItem>(T.taskItems, [Query.equal("taskId", taskId), Query.equal("teamId", teamId)]);
  const byText = new Map(existing.map((i) => [i.text ?? "", i]));
  await Promise.all([
    ...existing.filter((i) => !want.includes(i.text ?? "")).flatMap((i) => [
      db().deleteRow(DB_ID, T.taskItems, i.$id),
      db().deleteRow(DB_ID, T.claims, i.$id).catch(() => {}), // a claim on a removed row goes too
    ]),
    ...want.map((text, position) => {
      const found = byText.get(text);
      if (!found) return db().createRow(DB_ID, T.taskItems, ID.unique(), { teamId, taskId, text, position, status: "available", lastDoneAt: null, lastLogId: null });
      return found.position === position ? null : db().updateRow(DB_ID, T.taskItems, found.$id, { position });
    }),
  ]);
}

const noteRow = async (teamId: string, taskId: string, memberId: string) =>
  (await allRows<MemberNote>(T.memberNotes, [Query.equal("teamId", teamId), Query.equal("taskId", taskId), Query.equal("memberId", memberId)]))[0] ?? null;

/** A member's own note on a task ("" if none). Only their Claude receives it. */
export const getNote = async (teamId: string, taskId: string, memberId: string) => (await noteRow(teamId, taskId, memberId))?.text ?? "";

/** Save the caller's own note; empty text deletes it. */
export async function saveNote(teamId: string, taskId: string, memberId: string, text: string) {
  const clean = normalise(text);
  const row = await noteRow(teamId, taskId, memberId);
  if (!clean) { if (row) await db().deleteRow(DB_ID, T.memberNotes, row.$id); return; }
  const data = { teamId, taskId, memberId, text: clean, updatedAt: new Date().toISOString() };
  if (row) await db().updateRow(DB_ID, T.memberNotes, row.$id, data);
  else await db().createRow(DB_ID, T.memberNotes, ID.unique(), data);
}
