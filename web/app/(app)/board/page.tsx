import Link from "next/link";
import { requireMember } from "@/lib/auth";
import { activeClaim, canTake, db, who } from "@/lib/mock";
import { claimItem, finishItem, quickTask, releaseClaim, resetItem } from "@/app/actions";
import { Badge, Card, PageHeader, btn, btnPrimary, fmt, input, type Tone } from "@/components/ui";

const tone: Record<string, Tone> = { free: "gray", "in progress": "blue", done: "green", failed: "red", skipped: "amber" };

export default async function BoardPage({ searchParams }: PageProps<"/board">) {
  const q = (await searchParams) as Record<string, string | undefined>;
  const me = await requireMember();
  const s = await db();
  const lead = me.role === "lead";

  const rows = s.taskItems.map((item) => {
    const task = s.tasks.find((k) => k.$id === item.taskId)!;
    const claim = activeClaim(s, item.$id);
    const log = s.logs.find((l) => l.$id === item.lastLogId) ?? null;
    const state = claim ? "in progress" : item.status === "available" ? "free" : item.status;
    return { item, task, claim, log, state };
  }).filter((r) => (!q.task || r.task.$id === q.task) && (!q.status || r.state === q.status) && (!q.mine || (r.task.assignees.length > 0 && canTake(r.task, me.$id))));

  return (
    <>
      <PageHeader title="Board" sub="What is free, who is on what, and what came back. Claude claims an item before working, so nothing is done twice.">
        <Link href="/board" className={btn}>Refresh</Link>
      </PageHeader>

      {lead && (
        <form action={quickTask} className="mb-6 space-y-2 rounded-lg border border-line bg-panel p-3">
          <p className="text-sm font-medium">Add a one-off task</p>
          <input name="title" required placeholder="Title, e.g. Review PR 52" className={input} />
          <textarea name="prompt" required rows={2} placeholder="What should Claude do? e.g. Review https://github.com/x/y/pull/52 and write notes to reviews/pr-52.md" className={input} />
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-muted">For lists, routines or assignees, use <Link href="/tasks/new" className="text-accent hover:underline">New task</Link>.</p>
            <button className={btnPrimary}>Add</button>
          </div>
        </form>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {Object.keys(tone).map((st) => <Badge key={st} tone={tone[st]}>{rows.filter((r) => r.state === st).length} {st}</Badge>)}
        <form className="ml-auto flex gap-2">
          <select name="task" defaultValue={q.task ?? ""} className={`${input} w-auto`}>
            <option value="">All tasks</option>
            {s.tasks.map((k) => <option key={k.$id} value={k.$id}>{k.title}</option>)}
          </select>
          <select name="status" defaultValue={q.status ?? ""} className={`${input} w-auto`}>
            <option value="">Any status</option>
            {Object.keys(tone).map((st) => <option key={st}>{st}</option>)}
          </select>
          <label className="flex items-center gap-1.5 text-sm"><input type="checkbox" name="mine" value="1" defaultChecked={!!q.mine} /> Assigned to me</label>
          <button className={btn}>Filter</button>
        </form>
      </div>

      <div className="space-y-6">
        {s.tasks.map((task) => {
          const group = rows.filter((r) => r.task.$id === task.$id);
          if (!group.length) return null;
          return (
            <Card key={task.$id} title={task.title}
              actions={<div className="flex items-center gap-2">
                {task.mode === "routine" ? <Badge tone="blue">every {task.redoDays}d</Badge> : <Badge>one-off</Badge>}
                {task.assignees.length > 0 && <span className="text-xs text-muted">→ {task.assignees.map((a) => who(s, a)).join(", ")}</span>}
                <Link href={`/tasks/${task.$id}`} className="text-xs text-accent hover:underline">open</Link>
              </div>}>
              <ul className="-my-2 divide-y divide-line">
                {group.map(({ item, claim, log, state }) => (
                  <li key={item.$id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-2.5">
                    <p className="min-w-48 flex-1 truncate text-sm font-medium">{item.item || "Whole task"}</p>
                    <div className="min-w-56 flex-[2] text-sm">
                      <Badge tone={tone[state]}>
                        {claim ? `${who(s, claim.by, claim.scheduled)} · until ${fmt(claim.leaseUntil).split(", ")[1]}` : state === "done" ? `done ${fmt(item.lastDoneAt)}` : state}
                      </Badge>
                      {log && !claim && (
                        <p className="mt-1 text-xs text-muted">
                          {who(s, log.by, log.scheduled)}: {log.summary}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {claim?.by === me.$id && <>
                        <ActionBtn action={finishItem} id={item.$id} outcome="done">Complete</ActionBtn>
                        <ActionBtn action={finishItem} id={item.$id} outcome="failed">Fail</ActionBtn>
                      </>}
                      {!claim && state !== "done" && canTake(task, me.$id) && <ActionBtn action={claimItem} id={item.$id}>Claim</ActionBtn>}
                      {lead && claim && claim.by !== me.$id && <ActionBtn action={releaseClaim} id={item.$id}>Release</ActionBtn>}
                      {lead && !claim && state !== "free" && <ActionBtn action={resetItem} id={item.$id}>Reset</ActionBtn>}
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          );
        })}
        {!rows.length && <p className="text-sm text-muted">Nothing matches.</p>}
      </div>
      <p className="mt-6 text-xs text-muted">Mock only: Claim / Complete / Fail stand in for what Claude does through the MCP tools.</p>
    </>
  );
}

function ActionBtn({ action, id, outcome, children }: { action: (f: FormData) => Promise<void>; id: string; outcome?: string; children: string }) {
  return (
    <form action={action}>
      <input type="hidden" name="id" value={id} />
      {outcome && <input type="hidden" name="outcome" value={outcome} />}
      <button className={btn}>{children}</button>
    </form>
  );
}
