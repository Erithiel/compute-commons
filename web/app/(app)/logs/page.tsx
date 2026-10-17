import Link from "next/link";
import { db, who } from "@/lib/mock";
import { Badge, PageHeader, btn, fmt, input, type Tone } from "@/components/ui";

const tone: Record<string, Tone> = { done: "green", failed: "red", skipped: "amber" };

// Every attempt on every task: who, when, what came back. Claude writes these through complete / fail / skip.
export default async function LogsPage({ searchParams }: PageProps<"/logs">) {
  const q = (await searchParams) as { task?: string; by?: string };
  const s = await db();
  const logs = s.logs.filter((l) => (!q.task || l.taskId === q.task) && (!q.by || l.by === q.by));
  const people = [...new Set(s.logs.map((l) => l.by))];

  return (
    <>
      <PageHeader title="Logs" sub="Who did which task, when, and what came back." />
      <form className="mb-4 flex flex-wrap gap-2">
        <select name="task" defaultValue={q.task ?? ""} className={`${input} w-auto`}>
          <option value="">All tasks</option>
          {s.tasks.map((k) => <option key={k.$id} value={k.$id}>{k.title}</option>)}
        </select>
        <select name="by" defaultValue={q.by ?? ""} className={`${input} w-auto`}>
          <option value="">Anyone</option>
          {people.map((p) => <option key={p} value={p}>{who(s, p)}</option>)}
        </select>
        <button className={btn}>Filter</button>
      </form>
      <div className="overflow-x-auto rounded-lg border border-line bg-panel">
        <table className="w-full text-sm">
          <thead className="border-b border-line text-left text-xs text-muted">
            <tr><th className="p-3">When</th><th className="p-3">Who</th><th className="p-3">Task</th><th className="p-3">Result</th></tr>
          </thead>
          <tbody className="divide-y divide-line">
            {logs.map((l) => {
              const task = s.tasks.find((k) => k.$id === l.taskId);
              const item = s.taskItems.find((i) => i.$id === l.taskItemId)?.item;
              return (
                <tr key={l.$id} className="align-top">
                  <td className="whitespace-nowrap p-3 text-xs text-muted">{fmt(l.finishedAt)}</td>
                  <td className="whitespace-nowrap p-3">{who(s, l.by)}</td>
                  <td className="p-3">
                    <Link href={`/tasks/${l.taskId}`} className="hover:underline">{task?.title}</Link>
                    {item && <p className="text-xs text-muted">{item}</p>}
                    <p className="text-xs text-muted">v{l.version}</p>
                  </td>
                  <td className="p-3">
                    <Badge tone={tone[l.outcome]}>{l.outcome}</Badge>
                    <p className="mt-1 text-xs">{l.summary} {l.branchUrl && <a href={l.branchUrl} target="_blank" className="text-accent hover:underline">branch ↗</a>}</p>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!logs.length && <p className="p-4 text-sm text-muted">No logs yet.</p>}
      </div>
    </>
  );
}
