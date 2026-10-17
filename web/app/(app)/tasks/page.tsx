import Link from "next/link";
import { requireMember } from "@/lib/auth";
import { activeClaim, db, who } from "@/lib/mock";
import { Badge, PageHeader, btnPrimary } from "@/components/ui";

export default async function TasksPage() {
  const me = await requireMember();
  const s = await db();
  return (
    <>
      <PageHeader title="Tasks" sub="Any repeatable job, written as a prompt. Claude fetches these through the commons connector.">
        {me.role === "lead" && <Link href="/tasks/new" className={btnPrimary}>New task</Link>}
      </PageHeader>
      <div className="overflow-x-auto rounded-lg border border-line bg-panel">
        <table className="w-full text-sm">
          <thead className="border-b border-line text-left text-xs text-muted">
            <tr><th className="p-3">Task</th><th className="p-3">Type</th><th className="p-3">Assigned</th><th className="p-3">Progress</th></tr>
          </thead>
          <tbody className="divide-y divide-line">
            {s.tasks.map((t) => {
              const items = s.taskItems.filter((i) => i.taskId === t.$id);
              const doneCount = items.filter((i) => i.status === "done").length;
              const busy = items.filter((i) => activeClaim(s, i.$id)).length;
              return (
                <tr key={t.$id} className="hover:bg-hover">
                  <td className="p-3">
                    <Link href={`/tasks/${t.$id}`} className="font-medium hover:underline">{t.title}</Link>
                    <p className="text-xs text-muted">{t.description}</p>
                  </td>
                  <td className="p-3">{t.mode === "routine" ? <Badge tone="blue">routine · every {t.redoDays}d</Badge> : <Badge>one-off</Badge>}</td>
                  <td className="p-3 text-xs">{t.assignees.length ? t.assignees.map((a) => who(s, a)).join(", ") : <span className="text-muted">anyone</span>}</td>
                  <td className="p-3 whitespace-nowrap">
                    {doneCount}/{items.length} done{busy > 0 && <> · <Badge tone="blue">{busy} in progress</Badge></>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
