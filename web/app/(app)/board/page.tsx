import Link from "next/link";
import { requireMember } from "@/lib/auth";
import { canTake, db, itemState, itemsOf, repeatLabel, who } from "@/lib/mock";
import { quickTask } from "@/app/actions";
import { Badge, Card, PageHeader, btn, btnPrimary, input, type Tone } from "@/components/ui";

const tone: Record<string, Tone> = { free: "gray", "in progress": "blue", done: "green", failed: "red", skipped: "amber" };

// Read-only: only Claude claims and finishes work, through MCP. The board shows who is on what.
export default async function BoardPage({ searchParams }: PageProps<"/board">) {
  const q = (await searchParams) as Record<string, string | undefined>;
  const me = await requireMember();
  const s = await db();

  const groups = s.tasks
    .filter((t) => !q.mine || (t.assignees.length > 0 && canTake(t, me.$id)))
    .map((task) => ({
      task,
      rows: itemsOf(s, task.$id).map((item) => ({ item, st: itemState(s, item), log: s.logs.find((l) => l.$id === item.lastLogId) ?? null }))
        .filter((r) => !q.status || r.st.key === q.status),
    }))
    .filter((g) => g.rows.length);
  const all = groups.flatMap((g) => g.rows);

  return (
    <>
      <PageHeader title="Board" sub="Who is on what, what is free, and what came back. Claude claims work before doing it, so nothing is done twice.">
        <Link href="/board" className={btn}>Refresh</Link>
      </PageHeader>

      {me.role === "lead" && (
        <form action={quickTask} className="mb-6 space-y-2 rounded-lg border border-line bg-panel p-3">
          <p className="text-sm font-medium">Add a task</p>
          <input name="title" required placeholder="Title" className={input} />
          <textarea name="prompt" required rows={2} placeholder="Prompt: anything you want Claude to do" className={input} />
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-muted">Runs once, anyone can take it. For rows, repeating or assignees, use <Link href="/tasks/new" className="text-accent hover:underline">New task</Link>.</p>
            <button className={btnPrimary}>Add</button>
          </div>
        </form>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {Object.keys(tone).map((st) => <Badge key={st} tone={tone[st]}>{all.filter((r) => r.st.key === st).length} {st}</Badge>)}
        <form className="ml-auto flex items-center gap-2">
          <select name="status" defaultValue={q.status ?? ""} className={`${input} w-auto`}>
            <option value="">Any status</option>
            {Object.keys(tone).map((st) => <option key={st}>{st}</option>)}
          </select>
          <label className="flex items-center gap-1.5 text-sm"><input type="checkbox" name="mine" value="1" defaultChecked={!!q.mine} /> Assigned to me</label>
          <button className={btn}>Filter</button>
        </form>
      </div>

      <div className="space-y-4">
        {groups.map(({ task, rows }) => (
          <Card key={task.$id}
            title={task.title}
            actions={<div className="flex items-center gap-2 text-xs text-muted">
              {repeatLabel(task)} · {task.assignees.length ? task.assignees.map((a) => who(s, a)).join(", ") : "anyone"}
              <Link href={`/tasks/${task.$id}`} className="text-accent hover:underline">open</Link>
            </div>}>
            <ul className="-my-2 divide-y divide-line">
              {rows.map(({ item, st, log }) => (
                <li key={item.$id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2">
                  {item.text && <span className="min-w-48 flex-1 truncate text-sm">{item.text}</span>}
                  <span className="flex-[2] text-sm">
                    <Badge tone={tone[st.key]}>{st.label}</Badge>
                    {log && st.key !== "in progress" && <span className="ml-2 text-xs text-muted">{who(s, log.by, log.scheduled)}: {log.summary}</span>}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        ))}
        {!groups.length && <p className="text-sm text-muted">Nothing matches.</p>}
      </div>
    </>
  );
}
