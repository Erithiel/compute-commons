import Link from "next/link";
import { db, who } from "@/lib/mock";
import { Badge, PageHeader, btn, control, fmt, link, type Tone } from "@/components/ui";

const tone: Record<string, Tone> = { done: "green", failed: "red", skipped: "amber" };
const cols = "md:grid-cols-[110px_140px_minmax(0,1fr)_80px_70px_16px]";

function duration(from: string, to: string) {
  const min = Math.round((new Date(to).getTime() - new Date(from).getTime()) / 60_000);
  return min < 60 ? `${min} min` : `${Math.floor(min / 60)} h ${min % 60} min`;
}

// Who executed what: every attempt on every task. Claude writes these through complete / fail / skip.
export default async function LogsPage({ searchParams }: PageProps<"/logs">) {
  const q = (await searchParams) as { task?: string; by?: string; outcome?: string };
  const s = await db();
  const logs = s.logs.filter((l) => (!q.task || l.taskId === q.task) && (!q.by || l.by === q.by) && (!q.outcome || l.outcome === q.outcome));
  const people = [...new Set(s.logs.map((l) => l.by))];

  return (
    <>
      <PageHeader title="Logs" sub="Who executed what, when, how long it took, and what was done. Click a row for details." />
      <form className="mb-4 flex flex-wrap gap-2">
        <select name="task" defaultValue={q.task ?? ""} aria-label="Task" className={`${control} min-w-0 max-w-full`}>
          <option value="">All tasks</option>
          {s.tasks.map((k) => <option key={k.$id} value={k.$id}>{k.title}</option>)}
        </select>
        <select name="by" defaultValue={q.by ?? ""} aria-label="Executed by" className={control}>
          <option value="">Anyone</option>
          {people.map((p) => <option key={p} value={p}>{who(s, p)}</option>)}
        </select>
        <select name="outcome" defaultValue={q.outcome ?? ""} aria-label="Result" className={control}>
          <option value="">Any result</option>
          {Object.keys(tone).map((o) => <option key={o}>{o}</option>)}
        </select>
        <button className={btn}>Filter</button>
      </form>

      {/* md+: a 6-column table. Below md: task + result on top, a meta line under it. */}
      <div className="rounded-lg border border-line bg-panel">
        <div className={`hidden ${cols} gap-3 border-b border-line px-3 py-2 text-xs font-medium text-muted md:grid`}>
          <span>Finished</span><span>Executed by</span><span>Task · item · summary</span><span>Result</span><span>Took</span><span />
        </div>
        {logs.map((l) => {
          const task = s.tasks.find((k) => k.$id === l.taskId);
          const took = duration(l.startedAt, l.finishedAt);
          return (
            <details key={l.$id} className="group border-b border-line last:border-0">
              <summary className={`grid cursor-pointer list-none grid-cols-[minmax(0,1fr)_auto_auto] items-start gap-x-3 gap-y-1 px-3 py-2.5 text-sm transition-[background-color,color] duration-150 hover:bg-hover ${cols} [&::-webkit-details-marker]:hidden`}>
                <span className="hidden text-xs text-muted md:block">{fmt(l.finishedAt)}</span>
                <span className="hidden md:block">{who(s, l.by, l.scheduled)}</span>
                <span className="min-w-0">
                  <span className="font-medium">{task?.title}</span>
                  {l.item && <span className="text-muted"> · {l.item}</span>}
                  <span className="block truncate text-xs text-muted">{l.summary}</span>
                  <span className="mt-1 block text-xs text-muted md:hidden">{fmt(l.finishedAt)} · {who(s, l.by, l.scheduled)} · {took}</span>
                </span>
                <span><Badge tone={tone[l.outcome]}>{l.outcome}</Badge></span>
                <span className="hidden text-xs text-muted md:block">{took}</span>
                <svg viewBox="0 0 16 16" className="mt-0.5 size-4 text-muted transition-transform duration-200 group-open:rotate-90" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M6 4l4 4-4 4" /></svg>
              </summary>
              <div className="space-y-2 border-t border-line bg-hover/50 px-3 py-3 text-sm">
                <p><span className="text-muted">Summary:</span> {l.summary}</p>
                {l.details && <pre className="overflow-x-auto whitespace-pre-wrap rounded-md bg-paper p-3 font-mono text-xs">{l.details}</pre>}
                <p className="text-xs text-muted">
                  Started {fmt(l.startedAt)} · finished {fmt(l.finishedAt)} · prompt v{l.version} ·{" "}
                  <Link href={`/tasks/${l.taskId}`} className={link}>open task</Link>
                </p>
              </div>
            </details>
          );
        })}
        {!logs.length && <p className="p-8 text-center text-sm text-muted">No logs match these filters.</p>}
      </div>
    </>
  );
}
