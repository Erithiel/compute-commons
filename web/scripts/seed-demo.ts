// Demo/test queue: creates 4 easy tasks (6 items) for one member, to watch a Claude schedule drain the queue.
//   npm run seed-demo                         (for admin@admin.com)
//   npm run seed-demo -- someone@example.com  (for another member)
// Titles get a "Demo HH:MM" prefix, so you can run it again any time without clashing with an earlier set.
import path from "node:path";
import { Query } from "node-appwrite";
import { adminUsers, allRows, T } from "../lib/appwrite";
import { saveTask } from "../lib/tasks";
import type { Member } from "../lib/types";

const EMAIL = process.argv[2] ?? "admin@admin.com";
const REPO = path.resolve(__dirname, "../..");
const stamp = new Date().toTimeString().slice(0, 5);
const fileStamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "");

async function main() {
  const user = (await adminUsers().list([Query.equal("email", EMAIL)])).users[0];
  if (!user) throw new Error(`No user ${EMAIL}`);
  const me = (await allRows<Member>(T.members, [Query.equal("userId", user.$id)]))[0];
  if (!me) throw new Error(`${EMAIL} is not on a team`);

  const summaryFile = path.join(REPO, "docs", `project-summary-${fileStamp}.md`);
  const tasks = [
    { title: "count letters", rows: [], prompt: 'Count the letters (not spaces or punctuation) in this sentence: "Small teams share one queue."\nPut the number in the summary when you complete (e.g. "10 letters"). Do not create any files.' },
    { title: "summarize a paragraph", rows: [], prompt: 'Summarize this paragraph in one sentence:\n"A scheduled run asks the server for the next free task, hands it to a fresh subagent, and waits for it to finish. When the server says nothing is left, the run stops and reports a short table of what was done, failed or skipped."\nPut the one-sentence summary in the summary when you complete. Do not create any files.' },
    { title: "multiply two numbers", rows: ["3 x 4", "7 x 8", "12 x 12"], prompt: 'The item is a product like "2 x 5". Work it out and put the result in the summary when you complete (e.g. "2 x 5 = 10"). Do not create any files.' },
    { title: "write a project summary", rows: [], prompt: [
      `Read IDEA.md, PRODUCT.md and TECH.md in the project folder ${REPO}.`,
      `Write a short summary of the project (what it is, who it is for, how it works; about 10-15 lines of Markdown) to this new file:`,
      summaryFile,
      "",
      "Rules:",
      "- Only create that one file. Do not edit any other file, do not commit, do not run anything.",
      '- If the file already exists, do not overwrite it: fail with the reason "file already exists".',
      "- When you complete, put the file path in the summary and the first line of the summary text in details.",
    ].join("\n") },
  ];

  for (const t of tasks) {
    await saveTask(me.teamId, null, { title: `Demo ${stamp}: ${t.title}`, prompt: t.prompt, repeatDays: 0, assignees: [me.$id], rows: t.rows }, me.$id);
  }
  console.log(`seed-demo: ${tasks.length} tasks (${tasks.reduce((n, t) => n + Math.max(1, t.rows.length), 0)} items) for ${me.name} in team "${me.teamId}", titled "Demo ${stamp}: …".`);
  console.log(`The summary task writes ${summaryFile}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
