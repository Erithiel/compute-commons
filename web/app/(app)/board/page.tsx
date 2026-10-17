import Link from "next/link";
import { requireMember } from "@/lib/auth";
import { canTake, db, itemState, itemsOf, repeatLabel, who } from "@/lib/mock";
import { quickTask } from "@/app/actions";
import { Badge, Card, PageHeader, btn, btnPrimary, control, input, link, type Tone } from "@/components/ui";

const tone: Record<string, Tone> = { free: "gray", "in progress": "blue", done: "green", failed: "red", skipped: "amber" };

// Read-only: only Claude claims and finishes work, through MCP. The board shows who is on what.
export default async function BoardPage({ searchParams }: PageProps<"/board">) {
  const q = (await searchParams) as Record<string, string | undefined>;
  const me = await requireMember();
  const s = await db();

  const unfiltered = s.tasks
    .filter((t) => !q.mine || (t.assignees.length > 0 && canTake(t, me.$id)))
    .map((task) => ({
      task,
      rows: itemsOf(s, task.$id).map((item) => ({ item, st: itemState(s, item), log: s.logs.find((l) => l.$id === item.lastLogId) ?? null })),
    }));
  const all = unfiltered.flatMap((g) => g.rows); // counts ignore the status filter, so every count stays meaningful
  const groups = unfiltered
    .map((g) => ({ ...g, rows: g.rows.filter((r) => !q.status || r.st.key === q.status) }))
    .filter((g) => g.rows.length);

  return (
    <>
      <PageHeader title="Board" sub="Who is on what, what is free, and what came back. Claude claims work before doing it, so nothing is done twice.">
        <Link href="/board" className={btn}>Refresh</Link>
      </PageHeader>

      {me.role === "lead" && (
        <form action={quickTask} className="mb-8 space-y-2 rounded-lg border border-line bg-panel p-4">
          <h2 className="text-sm font-semibold">Add a task</h2>
          <input name="title" required placeholder="Title" aria-label="Title" className={input} />
          <textarea name="prompt" required rows={2} placeholder="Prompt: anything you want Claude to do" aria-label="Prompt" className={input} />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-muted">Runs once, anyone can take it. For rows, repeating or assignees, use <Link href="/tasks/new" className={link}>New task</Link>.</p>
            <button className={btnPrimary}>Add</button>
          </div>
        </form>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-3">
        {/* Each count is a shortcut for the status filter; click again to clear. */}
        <div className="flex flex-wrap gap-1.5">
          {Object.keys(tone).map((st) => {
            const on = q.status === st;
            const href = on ? `/board${q.mine ? "?mine=1" : ""}` : `/board?status=${encodeURIComponent(st)}${q.mine ? "&mine=1" : ""}`;
            return (
              <Link key={st} href={href} aria-current={on || undefined}
                className={`rounded transition-shadow duration-150 hover:ring-2 hover:ring-line ${on ? "ring-2 ring-accent" : ""}`}>
                <Badge tone={tone[st]}>{all.filter((r) => r.st.key === st).length} {st}</Badge>
              </Link>
            );
          })}
        </div>
        {/* key remounts the form on soft navigation, so the inputs follow the URL. */}
        <form key={`${q.status}-${q.mine}`} className="ml-auto flex flex-wrap items-center gap-2">
          <select name="status" defaultValue={q.status ?? ""} aria-label="Status" className={control}>
            <option value="">Any status</option>
            {Object.keys(tone).map((st) => <option key={st}>{st}</option>)}
          </select>
          <label className="flex items-center gap-1.5 whitespace-nowrap text-sm"><input type="checkbox" name="mine" value="1" defaultChecked={!!q.mine} /> Assigned to me</label>
          <button className={btn}>Filter</button>
        </form>
      </div>

      <div className="space-y-4">
        {groups.map(({ task, rows }) => (
          <Card key={task.$id}
            title={<Link href={`/tasks/${task.$id}`} className="hover:text-accent hover:underline">{task.title}</Link>}
            actions={<span className="text-xs text-muted">
              {repeatLabel(task)} · {task.assignees.length ? task.assignees.map((a) => who(s, a)).join(", ") : "anyone"}
            </span>}>
            <ul className="-my-2 divide-y divide-line">
              {rows.map(({ item, st, log }) => (
                <li key={item.$id} className="grid gap-x-6 gap-y-1 py-2.5 sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] sm:items-baseline">
                  {item.text && <span className="truncate text-sm font-medium sm:font-normal">{item.text}</span>}
                  <span className={`text-sm ${item.text ? "" : "sm:col-span-2"}`}>
                    <Badge tone={tone[st.key]}>{st.label}</Badge>
                    {log && st.key !== "in progress" && <span className="ml-2 text-xs text-muted">{who(s, log.by, log.scheduled)}: {log.summary}</span>}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        ))}
        {!groups.length && (
          <div className="rounded-lg border border-dashed border-line p-8 text-center text-sm text-muted">
            Nothing matches these filters. <Link href="/board" className={link}>Show everything</Link>
          </div>
        )}
      </div>
    </>
  );
}
