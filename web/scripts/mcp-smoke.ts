// MCP acceptance against a running dev server, in its own team so the real team's tasks are never touched.
//   terminal 1: TEAM_ID=mcp-smoke npm run dev
//   terminal 2: TEAM_ID=mcp-smoke npm run mcp-smoke
// (PowerShell: $env:TEAM_ID='mcp-smoke'; npm run dev). Creates a lead and a member with tokens, drives the tools
// the way Claude would, then deletes everything it made. Never writes the policy: the settings row is shared by all teams.
import assert from "node:assert/strict";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { ID, Query } from "node-appwrite";
import { adminTables, allRows, DB_ID, T, TEAM_ID } from "../lib/appwrite";
import { saveTask } from "../lib/tasks";
import { createToken } from "../lib/tokens";

assert.equal(TEAM_ID, "mcp-smoke", "run as: TEAM_ID=mcp-smoke npm run mcp-smoke (and the dev server with the same TEAM_ID)");
const MCP_URL = new URL(process.env.MCP_URL ?? "http://localhost:3000/api/mcp");
const db = adminTables();

type Result = { content: unknown; isError?: boolean };
async function connect(token?: string) {
  const client = new Client({ name: "mcp-smoke", version: "0.0.0" });
  await client.connect(new StreamableHTTPClientTransport(MCP_URL, { requestInit: { headers: token ? { Authorization: `Bearer ${token}` } : {} } }));
  return client;
}
const call = async (c: Client, name: string, args: Record<string, unknown> = {}) => (await c.callTool({ name, arguments: args })) as Result;
const text = (r: Result) => (r.content as Array<{ text: string }>)[0].text;
const json = <X>(r: Result) => JSON.parse(text(r).split("\n\n").slice(1).join("\n\n")) as X;

async function main() {
  const member = (name: string, role: string) => db.createRow(DB_ID, T.members, ID.unique(), { teamId: TEAM_ID, userId: ID.unique(), name, role });
  const lead = await member("Smoke Lead", "lead");
  const mem = await member("Smoke Member", "member");

  // Auth
  await assert.rejects(connect(), "no token must get 401");
  await assert.rejects(connect("cc_wrong"), "an unknown token must get 401");
  const L = await connect((await createToken(lead.$id, "smoke", false)).token);
  const M = await connect((await createToken(mem.$id, "smoke", true)).token);
  assert.match(L.getInstructions() ?? "", /next_task/);

  // Worker tools
  const tools = (await M.listTools()).tools.map((t) => t.name);
  for (const n of ["next_task", "list_work", "get_task", "claim", "heartbeat", "complete", "fail", "skip", "save_my_note", "board"]) assert.ok(tools.includes(n), `missing tool ${n}`);
  await saveTask(null, { title: "Smoke work", prompt: "Say hi", repeatDays: 0, assignees: [], rows: ["a", "b"] }, lead.$id);
  assert.match(text(await call(M, "save_my_note", { task: "smoke work", text: "My files are in D:/x" })), /Saved your note/);

  const first = json<{ itemId: string; prompt: string }>(await call(M, "next_task"));
  assert.match(first.prompt, /Say hi[\s\S]*My files are in D:\/x[\s\S]*Item: a/);
  assert.match(text(await call(L, "claim", { itemId: first.itemId })), /Not claimed: Someone else/);
  assert.notEqual((await call(M, "heartbeat", { itemId: first.itemId })).isError, true);
  assert.equal((await call(L, "complete", { itemId: first.itemId, summary: "x" })).isError, true, "only the holder can finish");
  assert.match(text(await call(M, "complete", { itemId: first.itemId, summary: "said hi", details: "in chat" })), /Logged as done/);

  const second = json<{ itemId: string; prompt: string }>(await call(L, "next_task"));
  assert.match(second.prompt, /Item: b/);
  assert.doesNotMatch(second.prompt, /D:\/x/, "a note reaches only its owner");
  assert.match(text(await call(L, "skip", { itemId: second.itemId, reason: "smoke" })), /Logged as skipped/);
  const again = json<{ itemId: string }>(await call(M, "next_task"));
  assert.equal(again.itemId, second.itemId, "a skipped item comes back");
  await call(M, "complete", { itemId: again.itemId, summary: "said hi" });
  assert.match(text(await call(M, "next_task")), /Nothing left/);
  assert.match(text(await call(M, "board")), /0 in progress, 0 free, 2 done/);

  // (Task 5 adds the management checks here.)

  await Promise.all([L.close(), M.close()]);
  console.log("mcp-smoke: all checks passed");
}

/** Deletes every row this team made (members, tasks, items, claims, tokens, logs, notes, versions, audit). */
async function cleanup() {
  type Row = { $id: string };
  const team = [Query.equal("teamId", TEAM_ID)];
  const members = await allRows<Row>(T.members, team);
  const ids = members.map((m) => m.$id);
  const by = (table: string, col: string) => (ids.length ? allRows<Row>(table, [Query.equal(col, ids)]) : Promise.resolve([] as Row[]));
  const items = await allRows<Row>(T.taskItems, team);
  const sets: Array<[string, Row[]]> = [
    [T.claims, items], [T.taskItems, items],
    [T.tasks, await allRows<Row>(T.tasks, team)], [T.audit, await allRows<Row>(T.audit, team)],
    [T.apiTokens, await by(T.apiTokens, "owner")], [T.logs, await by(T.logs, "by")],
    [T.memberNotes, await by(T.memberNotes, "memberId")], [T.taskVersions, await by(T.taskVersions, "authorId")],
    [T.members, members],
  ];
  for (const [table, rows] of sets) await Promise.all(rows.map((r) => db.deleteRow(DB_ID, table, r.$id).catch(() => {})));
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(cleanup);
