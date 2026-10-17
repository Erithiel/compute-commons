// Creates (or completes) the Appwrite database: tables, columns, indexes, the settings row.
// Idempotent: run it after every schema change; existing things are left alone.
//   npm run setup:appwrite              schema only
//   npm run setup:appwrite -- --sample  also loads sample members/tasks (only into empty tables)
// ponytail: additive only. Changing or dropping a column is done by hand in the console.
import { AppwriteException, Client, IndexType, Query, TablesDB } from "node-appwrite";
import { DB_ID, DEFAULT_POLICY, T } from "../lib/tables";
import { sample } from "./sample";

type Col =
  | { key: string; type: "varchar"; size: number; required?: boolean; array?: boolean }
  | { key: string; type: "text" | "mediumtext" | "datetime" | "boolean" | "integer"; required?: boolean; default?: unknown }
  | { key: string; type: "enum"; elements: string[]; required?: boolean };
type Idx = { key: string; type: "key" | "unique"; columns: string[] };

const ID = 36; // Appwrite ids are at most 36 chars
const id = (key: string, required = true): Col => ({ key, type: "varchar", size: ID, required });
const at = (key: string, required = true): Col => ({ key, type: "datetime", required });

// Mirrors lib/types.ts. $id/$createdAt/$updatedAt are Appwrite's own.
export const SCHEMA: Record<string, { name: string; columns: Col[]; indexes: Idx[] }> = {
  [T.members]: {
    name: "Members",
    columns: [id("teamId"), id("userId"), { key: "name", type: "varchar", size: 128, required: true },
      { key: "role", type: "enum", elements: ["lead", "member"], required: true }],
    indexes: [{ key: "team_user", type: "unique", columns: ["teamId", "userId"] }, { key: "user", type: "unique", columns: ["userId"] }],
  },
  [T.tasks]: {
    name: "Tasks",
    columns: [id("teamId"), { key: "title", type: "varchar", size: 256, required: true },
      { key: "repeatDays", type: "integer", required: false, default: 0 },
      { key: "assignees", type: "varchar", size: ID, array: true },
      { key: "currentVersion", type: "integer", required: false, default: 0 }],
    indexes: [{ key: "team", type: "key", columns: ["teamId"] }],
  },
  [T.taskVersions]: {
    name: "Task versions",
    columns: [id("teamId", false), id("taskId"), { key: "version", type: "integer", required: true },
      { key: "prompt", type: "mediumtext", required: true }, id("authorId"), at("createdAt")],
    indexes: [{ key: "task_version", type: "unique", columns: ["taskId", "version"] }, { key: "team", type: "key", columns: ["teamId"] }],
  },
  [T.memberNotes]: {
    name: "Member notes",
    columns: [id("teamId", false), id("taskId"), id("memberId"), { key: "text", type: "text", required: true }, at("updatedAt")],
    indexes: [{ key: "task_member", type: "unique", columns: ["taskId", "memberId"] }, { key: "team", type: "key", columns: ["teamId"] }],
  },
  [T.taskItems]: {
    name: "Task items",
    columns: [id("teamId"), id("taskId"), { key: "text", type: "varchar", size: 1024, required: false },
      { key: "position", type: "integer", required: true },
      { key: "status", type: "enum", elements: ["available", "done", "failed", "skipped"], required: true },
      at("lastDoneAt", false), id("lastLogId", false)],
    indexes: [{ key: "task_position", type: "key", columns: ["taskId", "position"] }, { key: "status", type: "key", columns: ["status"] }],
  },
  [T.claims]: {
    name: "Claims", // row id = task item id: creating it is the lock
    columns: [id("teamId", false), id("by"), { key: "scheduled", type: "boolean", required: false, default: false }, at("claimedAt"), at("leaseUntil")],
    indexes: [{ key: "team", type: "key", columns: ["teamId"] }],
  },
  [T.takeovers]: {
    // Row id = hash(item id + the expired claim's claimedAt). Creating it is the lock for taking over an expired claim;
    // Appwrite 1.8.1 transactions did not stop two takeovers at once (race test). Never deleted, so a stale read cannot win later.
    name: "Claim takeovers",
    columns: [id("itemId")],
    indexes: [],
  },
  [T.logs]: {
    name: "Logs",
    columns: [id("teamId", false), id("taskId"), id("itemId"), { key: "item", type: "varchar", size: 1024, required: false }, id("by"),
      { key: "scheduled", type: "boolean", required: false, default: false },
      { key: "outcome", type: "enum", elements: ["done", "failed", "skipped"], required: true },
      { key: "summary", type: "text", required: true }, { key: "details", type: "mediumtext" },
      { key: "version", type: "integer", required: true }, at("startedAt"), at("finishedAt")],
    indexes: [{ key: "task", type: "key", columns: ["taskId"] }, { key: "by", type: "key", columns: ["by"] },
      { key: "finished", type: "key", columns: ["finishedAt"] }, { key: "team", type: "key", columns: ["teamId"] }],
  },
  [T.settings]: {
    name: "Settings", // one row per team, id = team id
    columns: [id("teamId"), { key: "policy", type: "text", required: false }],
    indexes: [],
  },
  [T.apiTokens]: {
    name: "API tokens",
    columns: [id("teamId", false), id("owner"), { key: "scheduled", type: "boolean", required: false, default: false },
      { key: "name", type: "varchar", size: 128, required: true }, { key: "tokenHash", type: "varchar", size: 64, required: true },
      at("lastUsedAt", false), { key: "revoked", type: "boolean", required: false, default: false }],
    indexes: [{ key: "hash", type: "unique", columns: ["tokenHash"] }, { key: "owner", type: "key", columns: ["owner"] }, { key: "team", type: "key", columns: ["teamId"] }],
  },
  [T.teams]: {
    name: "Teams",
    columns: [{ key: "name", type: "varchar", size: 128, required: true }, id("createdBy"), at("createdAt")],
    indexes: [],
  },
  [T.invites]: {
    name: "Invites",
    columns: [id("teamId"), { key: "codeHash", type: "varchar", size: 64, required: true },
      { key: "role", type: "enum", elements: ["lead", "member"], required: true }, id("createdBy"), at("expiresAt"),
      id("usedBy", false), at("usedAt", false), { key: "revoked", type: "boolean", required: false, default: false }],
    indexes: [{ key: "code", type: "unique", columns: ["codeHash"] }, { key: "team", type: "key", columns: ["teamId"] }],
  },
  [T.loginAttempts]: {
    name: "Login attempts", // row id = attemptKey(email, window, slot); see lib/throttle.ts
    columns: [{ key: "fails", type: "integer", required: false, default: 0 }, at("windowStart")],
    indexes: [],
  },
  [T.audit]: {
    name: "Audit log",
    columns: [id("teamId"), id("actor"), { key: "action", type: "varchar", size: 64, required: true },
      { key: "entity", type: "varchar", size: 64, required: true }, { key: "before", type: "text" }, { key: "after", type: "text" }, at("at")],
    indexes: [{ key: "at", type: "key", columns: ["at"] }],
  },
};

const db = new TablesDB(new Client()
  .setEndpoint(process.env.APPWRITE_ENDPOINT!).setProject(process.env.APPWRITE_PROJECT_ID!).setKey(process.env.APPWRITE_API_KEY!));

const notFound = (e: unknown) => e instanceof AppwriteException && e.code === 404;

async function addColumn(table: string, c: Col) {
  const req = c.required ?? false;
  const def = (v: unknown) => (req ? undefined : (v as never)); // required columns cannot have a default
  switch (c.type) {
    // Server 1.8.1 has no varchar/text routes yet (SDK 22.1.3 is ahead there): string columns, sized.
    case "varchar": return db.createStringColumn(DB_ID, table, c.key, c.size, req, undefined, c.array);
    // > 16381 chars makes it TEXT (row width ~10 bytes); smaller strings are VARCHAR and eat 4 bytes/char of the 64KB row.
    case "text": return db.createStringColumn(DB_ID, table, c.key, 65_535, req);
    case "mediumtext": return db.createStringColumn(DB_ID, table, c.key, 1_000_000, req);
    case "datetime": return db.createDatetimeColumn(DB_ID, table, c.key, req);
    case "boolean": return db.createBooleanColumn(DB_ID, table, c.key, req, def(c.default));
    case "integer": return db.createIntegerColumn(DB_ID, table, c.key, req, undefined, undefined, def(c.default));
    case "enum": return db.createEnumColumn(DB_ID, table, c.key, c.elements, req);
  }
}

/** Columns are created asynchronously; indexes need them "available". */
async function waitForColumns(table: string) {
  for (let i = 0; i < 60; i++) {
    const { columns } = await db.listColumns(DB_ID, table);
    const states = (columns as Array<{ key: string; status: string }>).map((c) => c.status);
    if (states.some((s) => s === "failed")) throw new Error(`${table}: a column failed to create`);
    if (states.every((s) => s === "available")) return;
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`${table}: columns still processing after 60s`);
}

async function main() {
  try { await db.get(DB_ID); } catch (e) {
    if (!notFound(e)) throw e;
    await db.create(DB_ID, "Compute Commons");
    console.log(`+ database ${DB_ID}`);
  }

  for (const [table, spec] of Object.entries(SCHEMA)) {
    try { await db.getTable(DB_ID, table); } catch (e) {
      if (!notFound(e)) throw e;
      await db.createTable(DB_ID, table, spec.name); // no permissions: only the server's API key reads and writes
      console.log(`+ table ${table}`);
    }
    const have = new Set(((await db.listColumns(DB_ID, table)).columns as Array<{ key: string }>).map((c) => c.key));
    for (const c of spec.columns.filter((c) => !have.has(c.key))) {
      await addColumn(table, c);
      console.log(`+ ${table}.${c.key}`);
    }
    await waitForColumns(table);
    const idx = new Set((await db.listIndexes(DB_ID, table)).indexes.map((i) => i.key));
    for (const i of spec.indexes.filter((i) => !idx.has(i.key))) {
      await db.createIndex(DB_ID, table, i.key, i.type === "unique" ? IndexType.Unique : IndexType.Key, i.columns);
      console.log(`+ index ${table}.${i.key}`);
    }
  }

  const adopt = process.argv.indexOf("--adopt-team");
  if (adopt > 0) await adoptTeam(process.argv[adopt + 1], process.argv[adopt + 2] ?? process.argv[adopt + 1]);

  if (process.argv.includes("--sample")) await loadSample();
  console.log("Schema is up to date.");
}

/** One-off: the data created while TEAM_ID was an env var becomes team <id>. Safe to run twice. */
async function adoptTeam(teamId: string, name: string) {
  try { await db.getRow(DB_ID, T.teams, teamId); } catch (e) {
    if (!notFound(e)) throw e;
    await db.createRow(DB_ID, T.teams, teamId, { name, createdBy: "migration", createdAt: new Date().toISOString() });
    console.log(`+ team ${teamId}`);
  }
  // Settings: one row per team, id = team id.
  try { await db.getRow(DB_ID, T.settings, teamId); } catch (e) {
    if (!notFound(e)) throw e;
    const old = await db.getRow(DB_ID, T.settings, "settings").catch(() => null);
    await db.createRow(DB_ID, T.settings, teamId, { teamId, policy: old?.policy ?? DEFAULT_POLICY });
    if (old) await db.deleteRow(DB_ID, T.settings, "settings");
    console.log(`+ settings ${teamId}`);
  }
  // Backfill teamId where it is still empty.
  for (const table of [T.taskVersions, T.memberNotes, T.claims, T.logs, T.apiTokens]) {
    const rows = (await db.listRows(DB_ID, table, [Query.isNull("teamId"), Query.limit(500)])).rows;
    for (const r of rows) await db.updateRow(DB_ID, table, r.$id, { teamId });
    if (rows.length) console.log(`~ ${rows.length} rows in ${table} → ${teamId}`);
  }
}

/** Sample data for a fresh project. Skips any table that already has rows. */
async function loadSample() {
  const t = process.argv.indexOf("--team");
  for (const [table, rows] of Object.entries(sample(t > 0 ? process.argv[t + 1] : "rando"))) {
    if ((await db.listRows(DB_ID, table, [], undefined, true)).total > 0) { console.log(`= ${table} has rows, sample skipped`); continue; }
    for (const { $id, ...data } of rows) await db.createRow(DB_ID, table, $id, data);
    console.log(`+ ${rows.length} sample rows in ${table}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
