import Link from "next/link";
import { requireMember } from "@/lib/auth";
import { activeClaim, db, itemsOf, repeatLabel, who } from "@/lib/mock";
import { Badge, PageHeader, btnPrimary } from "@/components/ui";

export default async function TasksPage() {
  const me = await requireMember();
  const s = await db();
  return (
    <>
      <PageHeader title="Tasks" sub="A task is a title and a prompt. The prompt can ask for anything.">
        {me.role === "lead" && <Link href="/tasks/new" className={btnPrimary}>New task</Link>}
      </PageHeader>
      <div className="overflow-x-auto rounded-lg border border-line bg-panel">
        <table className="w-full min-w-[560px] text-sm">
          <thead className="border-b border-line text-left text-xs font-medium text-muted">
            <tr><th className="p-3">Task</th><th className="p-3">Repeat</th><th className="p-3">Assigned</th><th className="p-3">Progress</th></tr>
          </thead>
          <tbody className="divide-y divide-line">
            {s.tasks.map((t) => {
              const items = itemsOf(s, t.$id);
              const doneCount = items.filter((i) => i.status === "done").length;
              const busy = items.filter((i) => activeClaim(s, i.$id)).length;
              const hasRows = items.some((i) => i.text);
              return (
                <tr key={t.$id} className="hover:bg-hover">
                  <td className="p-3"><Link href={`/tasks/${t.$id}`} className="font-medium hover:text-accent hover:underline">{t.title}</Link></td>
                  <td className="p-3">{t.repeatDays ? <Badge tone="blue">{repeatLabel(t)}</Badge> : <Badge>once</Badge>}</td>
                  <td className="p-3 text-xs">{t.assignees.length ? t.assignees.map((a) => who(s, a)).join(", ") : <span className="text-muted">anyone</span>}</td>
                  <td className="whitespace-nowrap p-3 text-xs">
                    {hasRows ? `${doneCount}/${items.length} rows done` : doneCount ? "done" : "not done"}
                    {busy > 0 && <> · <Badge tone="blue">{busy} in progress</Badge></>}
                  </td>
                </tr>
              );
            })}
            {!s.tasks.length && <tr><td colSpan={4} className="p-8 text-center text-muted">No tasks yet.{me.role === "lead" && " Create one and your team's Claude can pick it up."}</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
