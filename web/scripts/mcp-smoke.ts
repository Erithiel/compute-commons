// MCP acceptance against a running dev server, in its own team so the real team's tasks are never touched.
//   terminal 1: npm run dev        (APP_URL set in .env.local, for invite links)
//   terminal 2: npm run mcp-smoke  (MCP_URL=http://localhost:<port>/api/mcp if not 3000)
// Tokens carry their team, so the server needs no special env. Creates a lead and a member with tokens in team
// "mcp-smoke", drives the tools the way Claude would, then deletes everything it made.
import assert from "node:assert/strict";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { ID, Query } from "node-appwrite";
import { adminTables, allRows, DB_ID, T } from "../lib/appwrite";
import { saveTask } from "../lib/tasks";
import { createToken } from "../lib/tokens";

const TEAM_ID = "mcp-smoke";
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
  const L = await connect((await createToken(TEAM_ID, lead.$id, "smoke")).token);
  const M = await connect((await createToken(TEAM_ID, mem.$id, "smoke")).token);
  assert.match(L.getInstructions() ?? "", /next_task/);

  // Worker tools
  const tools = (await M.listTools()).tools.map((t) => t.name);
  for (const n of ["next_task", "list_work", "get_task", "claim", "heartbeat", "complete", "fail", "skip", "save_my_note", "board"]) assert.ok(tools.includes(n), `missing tool ${n}`);
  await saveTask(TEAM_ID, null, { title: "Smoke work", prompt: "Say hi", repeatDays: 0, assignees: [], rows: ["a", "b"] }, lead.$id);
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

  // Management tools
  const all = (await L.listTools()).tools.map((t) => t.name);
  for (const n of ["list_members", "list_tasks", "view_task", "list_logs", "get_policy", "create_task", "update_task", "delete_task", "set_policy", "invite_member", "set_member_role", "remove_member"]) assert.ok(all.includes(n), `missing tool ${n}`);

  const people = json<Array<{ name: string; you: boolean }>>(await call(M, "list_members"));
  assert.equal(people.find((p) => p.you)?.name, "Smoke Member");

  assert.match(text(await call(M, "create_task", { title: "Nope", prompt: "x" })), /Only a team lead/);
  assert.match(text(await call(L, "create_task", { title: "Bad", prompt: "x", assignees: ["Nobody"] })), /No member "Nobody"/);
  assert.match(text(await call(L, "create_task", {
    title: "Weekly audit", prompt: "Audit the site", repeatDays: 7, assignees: ["smoke member"], rows: ["acme.ge", "green.ge"],
  })), /Created "Weekly audit"/);
  assert.match(text(await call(L, "update_task", {
    task: "weekly audit", prompt: "Audit the site v2", addRows: ["blue.ge"], removeRows: ["acme.ge"], addAssignees: ["Smoke Lead"],
  })), /prompt is now v2/);
  const view = json<{ items: Array<{ row: string }>; assignedTo: string[]; repeat: string; prompt: string }>(await call(L, "view_task", { task: "Weekly audit" }));
  assert.deepEqual(view.items.map((i) => i.row), ["green.ge", "blue.ge"]);
  assert.deepEqual(view.assignedTo, ["Smoke Member", "Smoke Lead"]);
  assert.equal(view.repeat, "every 7d");
  assert.equal(view.prompt, "Audit the site v2");

  await call(L, "create_task", { title: "Member only", prompt: "x", assignees: ["Smoke Member"] });
  const only = json<{ items: Array<{ itemId: string }> }>(await call(L, "view_task", { task: "Member only" }));
  assert.match(text(await call(L, "claim", { itemId: only.items[0].itemId })), /assigned to other members/);

  const mine = json<Array<{ outcome: string }>>(await call(L, "list_logs", { member: "Smoke Member" }));
  assert.deepEqual(mine.map((l) => l.outcome), ["done", "done"]);

  assert.match(text(await call(M, "remove_member", { member: "Smoke Lead" })), /Only a team lead/);
  assert.match(text(await call(L, "remove_member", { member: "Smoke Lead" })), /at least one lead/);
  assert.match(text(await call(L, "set_member_role", { member: "Smoke Lead", role: "member" })), /at least one lead/);
  assert.match(text(await call(L, "invite_member", { role: "member" })), /Invite link for a new member[\s\S]*\/join\//);
  await member("Smoke Temp", "member");
  assert.match(text(await call(L, "set_member_role", { member: "smoke temp", role: "lead" })), /"Smoke Temp" is now a lead/);
  assert.match(text(await call(L, "remove_member", { member: "Smoke Temp" })), /Removed "Smoke Temp"/);

  assert.match(text(await call(M, "set_policy", { policy: "x" })), /Only a team lead/);
  assert.match(text(await call(M, "get_policy")), /team policy/);

  assert.match(text(await call(L, "delete_task", { task: "Weekly audit" })), /Deleted "Weekly audit"/);
  assert.doesNotMatch(text(await call(L, "list_tasks")), /Weekly audit/);

  await Promise.all([L.close(), M.close()]);
  console.log("mcp-smoke: all checks passed");
}

/** Deletes every row this team made (members, tasks, items, claims, tokens, logs, notes, versions, invites, audit). */
async function cleanup() {
  type Row = { $id: string };
  const team = [Query.equal("teamId", TEAM_ID)];
  const members = await allRows<Row>(T.members, team);
  const ids = members.map((m) => m.$id);
  const by = (table: string, col: string) => (ids.length ? allRows<Row>(table, [Query.equal(col, ids)]) : Promise.resolve([] as Row[]));
  const items = await allRows<Row>(T.taskItems, team);
  const sets: Array<[string, Row[]]> = [
    [T.claims, items], [T.taskItems, items],
    [T.tasks, await allRows<Row>(T.tasks, team)], [T.audit, await allRows<Row>(T.audit, team)], [T.invites, await allRows<Row>(T.invites, team)],
    [T.apiTokens, await by(T.apiTokens, "owner")], [T.logs, await by(T.logs, "by")],
    [T.memberNotes, await by(T.memberNotes, "memberId")], [T.taskVersions, await by(T.taskVersions, "authorId")],
    [T.members, members],
  ];
  for (const [table, rows] of sets) await Promise.all(rows.map((r) => db.deleteRow(DB_ID, table, r.$id).catch(() => {})));
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(cleanup);
