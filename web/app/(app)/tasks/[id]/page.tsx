import { notFound } from "next/navigation";
import { requireMember } from "@/lib/auth";
import { activeClaim, buildPrompt, db, who } from "@/lib/mock";
import { approveVersion, saveTask, suggestChange } from "@/app/actions";
import { Badge, Card, LeadOnly, PageHeader, btn, btnPrimary, fmt, input, label, type Tone } from "@/components/ui";

const tone: Record<string, Tone> = { available: "gray", done: "green", failed: "red", skipped: "amber" };

export default async function TaskPage({ params, searchParams }: PageProps<"/tasks/[id]">) {
  const { id } = await params;
  const { preview } = (await searchParams) as { preview?: string };
  const me = await requireMember();
  const s = await db();
  const isNew = id === "new";
  const task = s.tasks.find((k) => k.$id === id);
  if (!isNew && !task) notFound();
  const lead = me.role === "lead";

  const versions = s.taskVersions.filter((v) => v.taskId === id).sort((a, b) => b.version - a.version);
  const cur = versions[0];
  const items = s.taskItems.filter((i) => i.taskId === id);
  const logs = s.logs.filter((l) => l.taskId === id);
  const previewItem = preview ?? items[0]?.item ?? "";
  const merged = cur && buildPrompt([s.settings.policy, cur.prompt], { item: previewItem });

  return (
    <>
      <PageHeader title={task?.title ?? "New task"} sub={task?.description}>
        {task && <div className="flex gap-2">
          <Badge>current v{task.currentVersion}</Badge>
          {task.approvedVersion ? <Badge tone="green">approved v{task.approvedVersion}</Badge> : <Badge tone="red">not approved</Badge>}
        </div>}
      </PageHeader>

      <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
        <div className="space-y-6">
          <Card title={lead ? "What should be done" : "Task"} actions={!lead && <LeadOnly />}>
            <form action={saveTask} className="space-y-4">
              <input type="hidden" name="id" value={task?.$id ?? ""} />
              <fieldset disabled={!lead} className="space-y-4">
                <div><label className={label}>Title</label><input name="title" required defaultValue={task?.title} className={input} placeholder="e.g. Weekly dependency check" /></div>
                <div><label className={label}>Description (for people: why and what)</label><input name="description" defaultValue={task?.description} className={input} /></div>
                <div>
                  <label className={label}>Prompt (what Claude will do; markdown). Use {"{{item}}"} for the current line of the item list.</label>
                  <textarea name="prompt" required rows={9} defaultValue={cur?.prompt} className={`${input} font-mono`}
                    placeholder={"Check dependencies in {{item}}.\nList outdated and vulnerable packages. Write reports/deps.md; do not upgrade anything."} />
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  <div><label className={label}>Type</label>
                    <select name="mode" defaultValue={task?.mode ?? "once"} className={input}>
                      <option value="once">One-off (done once)</option>
                      <option value="routine">Routine (comes back)</option>
                    </select>
                  </div>
                  <div><label className={label}>Routine: redo after (days)</label><input name="redoDays" type="number" min={1} defaultValue={task?.redoDays || 7} className={input} /></div>
                  <div><label className={label}>Priority (higher first)</label><input name="priority" type="number" defaultValue={task?.priority ?? 0} className={input} /></div>
                </div>

                <div>
                  <label className={label}>Item list (optional): one per line. Each line is done and claimed separately, so nobody doubles up.</label>
                  <textarea name="items" rows={4} defaultValue={task?.items.join("\n")} className={`${input} font-mono`}
                    placeholder={"https://site-one.ge\nhttps://site-two.ge\n(leave empty for a single job)"} />
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div><label className={label}>Needs (tools/keys, comma list)</label><input name="requires" defaultValue={task?.requires.join(", ")} className={input} placeholder="gh, node" /></div>
                  <div><label className={label}>Risk</label>
                    <select name="riskLabel" defaultValue={cur?.riskLabel ?? "report-only"} className={input}>
                      <option value="report-only">report-only (reads, writes a report)</option>
                      <option value="changes-files">changes-files (edits code)</option>
                    </select>
                  </div>
                </div>
                {lead && <button className={btnPrimary}>{isNew ? "Create task" : "Save"}</button>}
              </fieldset>
            </form>
          </Card>

          {cur && (
            <Card title="What Claude receives">
              {items.some((i) => i.item) && (
                <form className="mb-3 flex gap-2">
                  <select name="preview" defaultValue={previewItem} className={input}>
                    {items.map((i) => <option key={i.$id} value={i.item}>{i.item}</option>)}
                  </select>
                  <button className={btn}>Preview</button>
                </form>
              )}
              <pre className="whitespace-pre-wrap rounded-md bg-hover p-3 font-mono text-xs">{merged!.text}</pre>
              {merged!.missing.length > 0 && <p className="mt-2 text-xs text-red-600">Unfilled blanks: {merged!.missing.join(", ")}</p>}
              <p className="mt-2 text-xs text-muted">Team policy (Settings) first, then this task&apos;s prompt.</p>
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
            <Card title={`Items (${items.length})`}>
              <ul className="divide-y divide-line text-sm">
                {items.map((i) => {
                  const c = activeClaim(s, i.$id);
                  return (
                    <li key={i.$id} className="flex items-center justify-between gap-2 py-1.5">
                      <span className="truncate">{i.item || task.title}</span>
                      <Badge tone={c ? "blue" : tone[i.status]}>{c ? `${who(s, c.by)} on it` : i.status}</Badge>
                    </li>
                  );
                })}
              </ul>
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
                      <p className="text-xs">{s.taskItems.find((i) => i.$id === l.taskItemId)?.item} {l.summary}{" "}
                        {l.branchUrl && <a href={l.branchUrl} target="_blank" className="text-accent hover:underline">branch ↗</a>}</p>
                    </li>
                  ))}
                </ul>
              ) : <p className="text-sm text-muted">Nothing done yet.</p>}
            </Card>

            <Card title="Versions">
              <ul className="-my-2 divide-y divide-line">
                {versions.map((v) => (
                  <li key={v.$id} className="py-2.5 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">v{v.version} {task.approvedVersion === v.version && <Badge tone="green">approved</Badge>}</span>
                      {lead && task.approvedVersion !== v.version && (
                        <form action={approveVersion}>
                          <input type="hidden" name="id" value={task.$id} /><input type="hidden" name="version" value={v.version} />
                          <button className={btn}>Approve</button>
                        </form>
                      )}
                    </div>
                    <p className="text-xs text-muted">{who(s, v.authorId)} · {fmt(v.createdAt)} · {v.riskLabel}</p>
                    <details className="mt-1"><summary className="cursor-pointer text-xs text-accent">prompt</summary>
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
