import Link from "next/link";
import { notFound } from "next/navigation";
import { requireMember } from "@/lib/auth";
import { buildPrompt, db, itemState, itemsOf, noteOf, queryLogs, who } from "@/lib/mock";
import { itemPrompt } from "@/lib/prompt";
import { saveMyNote, saveTask, suggestChange } from "@/app/actions";
import { ItemsTable } from "@/components/client";
import { Badge, Card, LeadOnly, PageHeader, btn, btnPrimary, control, fmt, input, label, link, type Tone } from "@/components/ui";

const tone: Record<string, Tone> = { free: "gray", "in progress": "blue", done: "green", failed: "red", skipped: "amber" };
const text: Record<string, string> = {
  free: "text-muted", "in progress": "text-blue-600 dark:text-blue-400", done: "text-green-700 dark:text-green-400",
  failed: "text-red-600 dark:text-red-400", skipped: "text-amber-700 dark:text-amber-400",
};

const notePlaceholder = "Only your Claude gets this, e.g.\nMy client files are in D:\\work\\clients. Use the gdrive connector for spreadsheets.";
const noteHint = "Added after the task prompt when your Claude fetches this task. Others never see it.";

export default async function TaskPage({ params }: PageProps<"/tasks/[id]">) {
  const { id } = await params;
  const me = await requireMember();
  const s = await db();
  const isNew = id === "new";
  const task = s.tasks.find((k) => k.$id === id);
  if (!isNew && !task) notFound();
  const lead = me.role === "lead";

  const versions = s.taskVersions.filter((v) => v.taskId === id).sort((a, b) => b.version - a.version);
  const cur = versions[0];
  const items = task ? itemsOf(s, task.$id) : [];
  const rows = items.filter((i) => i.text);
  const single = items.length === 1 && !items[0].text ? itemState(s, items[0]) : null;
  const logs = task ? await queryLogs(me.teamId, { taskId: task.$id }, 20) : [];
  const myNote = noteOf(s, id, me.$id);
  const columns = task?.columns ?? [];
  const valuesOf = (i: (typeof items)[number]) => {
    try { const d = i.data && JSON.parse(i.data); if (d) return columns.map((c) => String(d[c] ?? "")); } catch {}
    return [i.text];
  };
  // New tasks default to "every 1 day for a month". repeatFor is stored in days; show it in the largest unit that divides it.
  const every = isNew || !!task?.repeatDays;
  const forDays = isNew ? 30 : task?.repeatFor ?? 0;
  const forUnit = forDays && forDays % 30 === 0 ? 30 : forDays && forDays % 7 === 0 ? 7 : 1;
  const forN = forDays / forUnit;

  return (
    <>
      <PageHeader title={task?.title ?? "New task"}>
        {single && <Badge tone={tone[single.key]}>{single.label}</Badge>}
      </PageHeader>

      <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
        <div className="space-y-6">
          <Card title="Task" actions={!lead && <LeadOnly />}>
            <form action={saveTask} className="space-y-4">
              <input type="hidden" name="id" value={task?.$id ?? ""} />
              <fieldset disabled={!lead} className="space-y-4">
                <div><label className={label}>Title</label><input name="title" required defaultValue={task?.title} className={input} /></div>
                <div>
                  <label className={label}>Prompt: anything you want Claude to do</label>
                  <textarea name="prompt" required rows={10} defaultValue={cur?.prompt} className={`${input} font-mono`} />
                </div>
                <div>
                  <label className={label}>Rows (optional): the same prompt for each row, e.g. a list of clients or sites. Each row is claimed separately, so nobody doubles up.</label>
                  {/* ItemsTable keeps rows in local state; the key remounts it when a row's status changes so claims show up. */}
                  <ItemsTable editable={lead} columns={columns}
                    key={rows.map((i) => itemState(s, i).label).join("|")}
                    initial={rows.map((i) => { const st = itemState(s, i); return { values: valuesOf(i), status: { label: st.label, tone: text[st.key] } }; })} />
                </div>
                <div className="flex flex-wrap items-center gap-4 text-sm">
                  <span className="text-xs font-medium text-muted">Repeat</span>
                  <label className="flex items-center gap-1.5"><input type="radio" name="repeat" value="once" defaultChecked={!every} /> Once</label>
                  <label className="flex flex-wrap items-center gap-1.5">
                    <input type="radio" name="repeat" value="every" defaultChecked={every} /> Every
                    <input name="repeatDays" type="number" min={1} defaultValue={task?.repeatDays || 1} aria-label="Repeat every N days" className={`${control} w-16 py-1`} /> days
                    <span>for a</span>
                    <input name="repeatFor" type="number" min={0} defaultValue={forN} aria-label="Repeat for (0 = no end)" title="0 = no end" className={`${control} w-16 py-1`} />
                    <select name="repeatForUnit" defaultValue={forUnit} aria-label="Repeat for unit" className={`${control} py-1`}>
                      <option value="1">days</option><option value="7">weeks</option><option value="30">months</option>
                    </select>
                  </label>
                </div>
                <div>
                  <label className={label}>Assigned to (none ticked = anyone)</label>
                  <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
                    {s.members.map((m) => (
                      <label key={m.$id} className="flex items-center gap-1.5">
                        <input type="checkbox" name="assignees" value={m.$id} defaultChecked={task?.assignees.includes(m.$id)} /> {m.name}
                      </label>
                    ))}
                  </div>
                </div>
                {isNew && lead && (
                  <div>
                    <label className={label}>My note (optional): your own addition to the prompt</label>
                    <textarea name="myNote" rows={2} className={`${input} font-mono`} placeholder={notePlaceholder} />
                    <p className="mt-1 text-xs text-muted">{noteHint} Each member adds their own on the task page.</p>
                  </div>
                )}
                {lead && <button className={btnPrimary}>{isNew ? "Create task" : "Save"}</button>}
              </fieldset>
            </form>
          </Card>

          {cur && (
            <Card title="What your Claude receives">
              <pre className="whitespace-pre-wrap rounded-md bg-hover p-3 font-mono text-xs">{buildPrompt(s.settings.policy, cur.prompt, myNote, rows[0] && itemPrompt(rows[0]))}</pre>
              <p className="mt-2 text-xs text-muted">
                Team policy (Settings), then this prompt{myNote && ", then your note"}{rows.length > 0 && ", then the row Claude claimed (shown for the first row)"}.
              </p>
            </Card>
          )}

          {task && !lead && (
            <Card title="Suggest a change">
              <form action={suggestChange} className="space-y-2">
                <input type="hidden" name="id" value={task.$id} />
                <textarea name="note" required rows={3} className={input} placeholder="What should the lead change?" />
                <button className={btn}>Send suggestion</button>
              </form>
            </Card>
          )}
        </div>

        {task && (
          <div className="space-y-6">
            <Card title="My note for this task">
              <form action={saveMyNote} className="space-y-2">
                <input type="hidden" name="id" value={task.$id} />
                <textarea name="note" rows={4} defaultValue={myNote} className={`${input} font-mono`} placeholder={notePlaceholder} />
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs text-muted">{noteHint}</p>
                  <button className={btn}>Save note</button>
                </div>
              </form>
            </Card>

            <Card title="Log">
              {logs.length ? (
                <ul className="divide-y divide-line text-sm">
                  {logs.map((l) => (
                    <li key={l.$id} className="py-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs text-muted">{who(s, l.by)} · {fmt(l.finishedAt)}</span>
                        <Badge tone={tone[l.outcome]}>{l.outcome}</Badge>
                      </div>
                      <p className="text-xs">{l.item && <span className="text-muted">{l.item}: </span>}{l.summary}</p>
                    </li>
                  ))}
                  {logs.length === 20 && <li className="py-2 text-xs"><Link href={`/logs?task=${task!.$id}`} className={link}>All logs of this task</Link></li>}
                </ul>
              ) : <p className="text-sm text-muted">Nothing done yet.</p>}
            </Card>

            <Card title="Prompt history">
              <ul className="-my-2 divide-y divide-line">
                {versions.map((v) => (
                  <li key={v.$id} className="py-2.5 text-sm">
                    <span className="font-medium">v{v.version} {v.version === task.currentVersion && <Badge tone="green">in use</Badge>}</span>
                    <p className="text-xs text-muted">{who(s, v.authorId)} · {fmt(v.createdAt)}</p>
                    <details className="mt-1"><summary className={`cursor-pointer text-xs ${link}`}>Show prompt</summary>
                      <pre className="mt-1 whitespace-pre-wrap rounded bg-hover p-2 font-mono text-xs">{v.prompt}</pre>
                    </details>
                  </li>
                ))}
              </ul>
            </Card>
          </div>
        )}
      </div>
    </>
  );
}
