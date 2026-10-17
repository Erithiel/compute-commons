import Link from "next/link";
import { db, who } from "@/lib/mock";
import { Badge, PageHeader, btn, fmt, input, type Tone } from "@/components/ui";

const tone: Record<string, Tone> = { done: "green", failed: "red", skipped: "amber" };

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
        <select name="task" defaultValue={q.task ?? ""} className={`${input} w-auto`}>
          <option value="">All tasks</option>
          {s.tasks.map((k) => <option key={k.$id} value={k.$id}>{k.title}</option>)}
        </select>
        <select name="by" defaultValue={q.by ?? ""} className={`${input} w-auto`}>
          <option value="">Anyone</option>
          {people.map((p) => <option key={p} value={p}>{who(s, p)}</option>)}
        </select>
        <select name="outcome" defaultValue={q.outcome ?? ""} className={`${input} w-auto`}>
          <option value="">Any result</option>
          {Object.keys(tone).map((o) => <option key={o}>{o}</option>)}
        </select>
        <button className={btn}>Filter</button>
      </form>

      <div className="overflow-x-auto rounded-lg border border-line bg-panel">
        <div className="grid min-w-[680px] grid-cols-[110px_140px_1fr_80px_70px] gap-3 border-b border-line px-3 py-2 text-xs text-muted">
          <span>Finished</span><span>Executed by</span><span>Task · item · summary</span><span>Result</span><span>Took</span>
        </div>
        {logs.map((l) => {
          const task = s.tasks.find((k) => k.$id === l.taskId);
          const item = s.taskItems.find((i) => i.$id === l.taskItemId)?.item;
          return (
            <details key={l.$id} className="group min-w-[680px] border-b border-line last:border-0">
              <summary className="grid cursor-pointer list-none grid-cols-[110px_140px_1fr_80px_70px] items-start gap-3 px-3 py-2.5 text-sm hover:bg-hover">
                <span className="text-xs text-muted">{fmt(l.finishedAt)}</span>
                <span>{who(s, l.by)}</span>
                <span className="min-w-0">
                  <span className="font-medium">{task?.title}</span>
                  {item && <span className="text-muted"> · {item}</span>}
                  <span className="block truncate text-xs text-muted">{l.summary}</span>
                </span>
                <span><Badge tone={tone[l.outcome]}>{l.outcome}</Badge></span>
                <span className="text-xs text-muted">{duration(l.startedAt, l.finishedAt)}</span>
              </summary>
              <div className="space-y-2 bg-hover/50 px-3 py-3 text-sm">
                <p><span className="text-muted">Summary:</span> {l.summary}</p>
                {l.details && <pre className="whitespace-pre-wrap rounded-md bg-paper p-3 font-mono text-xs">{l.details}</pre>}
                <p className="text-xs text-muted">
                  Started {fmt(l.startedAt)} · finished {fmt(l.finishedAt)} · prompt v{l.version} ·{" "}
                  <Link href={`/tasks/${l.taskId}`} className="text-accent hover:underline">open task</Link>
                </p>
              </div>
            </details>
          );
        })}
        {!logs.length && <p className="p-4 text-sm text-muted">No logs yet.</p>}
      </div>
    </>
  );
}
