"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useActionState, useState } from "react";
import { createToken, makeInvite } from "@/app/actions";
import { btn, btnPrimary, control, input, link } from "./ui";

const links = [
  ["/board", "Board"], ["/tasks", "Tasks"], ["/logs", "Logs"], ["/setup", "Connect Claude"], ["/settings", "Settings"],
] as const;

export function Nav() {
  const path = usePathname();
  return (
    <nav className="-mx-4 flex gap-1 overflow-x-auto px-4 pb-3 [scrollbar-width:none] md:mx-0 md:flex-col md:overflow-visible md:p-0">
      {links.map(([href, text]) => {
        const on = path.startsWith(href);
        return (
          <Link key={href} href={href} aria-current={on ? "page" : undefined}
            className={`whitespace-nowrap rounded-md px-2.5 py-1.5 text-sm md:px-3 transition-[background-color,color] duration-150 ${on ? "bg-panel font-medium shadow-[0_1px_2px_rgb(0_0_0/0.06)] ring-1 ring-line" : "text-muted hover:bg-hover hover:text-ink"}`}>
            {text}
          </Link>
        );
      })}
    </nav>
  );
}

export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [ok, setOk] = useState(false);
  return (
    <button type="button" className={btn}
      onClick={() => navigator.clipboard.writeText(text).then(() => { setOk(true); setTimeout(() => setOk(false), 1500); })}>
      {ok ? "Copied" : label}
    </button>
  );
}

type Row = { key: number; values: string[]; status?: { label: string; tone: string } };
const cell = "w-full min-w-24 rounded border border-transparent bg-transparent px-1.5 py-1 outline-none focus:border-accent";
const xIcon = <svg viewBox="0 0 16 16" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden><path d="M4 4l8 8M12 4l-8 8" /></svg>;

/** Editable rows of a task, with lead-defined columns. Each row is claimed separately by Claude; status/who is read-only. */
export function ItemsTable({ initial, columns: initialColumns, editable }: { initial: Omit<Row, "key">[]; columns: string[]; editable: boolean }) {
  const [cols, setCols] = useState(initialColumns.length ? initialColumns : ["Item"]);
  const [rows, setRows] = useState<Row[]>(() => initial.map((r, i) => ({ ...r, key: i })));
  const [next, setNext] = useState(initial.length);
  const add = (values: string[][], at = rows.length) => {
    setRows((rs) => [...rs.slice(0, at), ...values.map((v, i) => ({ key: next + i, values: v })), ...rs.slice(at)]);
    setNext((n) => n + values.length);
  };
  const set = (key: number, c: number, v: string) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, values: cols.map((_, j) => (j === c ? v : r.values[j] ?? "")) } : r)));
  const remove = (key: number) => setRows((rs) => rs.filter((r) => r.key !== key));
  const removeCol = (c: number) => {
    setCols((cs) => cs.filter((_, j) => j !== c));
    setRows((rs) => rs.map((r) => ({ ...r, values: r.values.filter((_, j) => j !== c) })));
  };

  return (
    <div className="overflow-hidden rounded-md border border-line">
      <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-hover text-left text-xs text-muted">
          <tr>
            <th className="w-8 px-2 py-1.5">#</th>
            {cols.map((c, j) => (
              <th key={j} className="px-1 py-1 font-medium">
                <div className="flex items-center">
                  <input name="columns" value={c} readOnly={!editable} aria-label={`Column ${j + 1} name`}
                    onChange={(e) => setCols((cs) => cs.map((x, k) => (k === j ? e.target.value : x)))} className={cell} />
                  {editable && cols.length > 1 && <button type="button" onClick={() => removeCol(j)} aria-label={`Remove column ${c}`}
                    className="grid size-6 shrink-0 place-items-center rounded hover:bg-red-500/10 hover:text-red-600">{xIcon}</button>}
                </div>
              </th>
            ))}
            <th className="px-2 py-1.5">Status</th>{editable && <th className="w-8" />}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((r, i) => (
            <tr key={r.key}>
              <td className="px-2 text-xs text-muted">{i + 1}<input type="hidden" name="items" value={JSON.stringify(cols.map((_, j) => r.values[j] ?? ""))} /></td>
              {cols.map((c, j) => (
                <td key={j} className="px-1 py-1">
                  <input value={r.values[j] ?? ""} readOnly={!editable} aria-label={`Row ${i + 1} ${c}`} placeholder={i === 0 && j === 0 ? "e.g. a client, a site, a file…" : undefined}
                    onChange={(e) => set(r.key, j, e.target.value)}
                    onPaste={(e) => {
                      // Lines become rows; tabs (pasted from a spreadsheet) fill the next columns.
                      const lines = e.clipboardData.getData("text").split(/\r?\n/).filter((l) => l.trim()).map((l) => l.split("\t").map((v) => v.trim()));
                      if (lines.length < 2 && lines[0]?.length < 2) return;
                      e.preventDefault();
                      const fill = (vals: string[], base: string[] = []) => cols.map((_, k) => (k >= j && k - j < vals.length ? vals[k - j] : base[k] ?? ""));
                      setRows((rs) => rs.map((x) => (x.key === r.key ? { ...x, values: fill(lines[0], x.values) } : x)));
                      add(lines.slice(1).map((l) => fill(l)), i + 1);
                    }}
                    className={cell} />
                </td>
              ))}
              <td className="whitespace-nowrap px-2 text-xs">
                {r.status ? <span className={r.status.tone}>{r.status.label}</span> : <span className="text-muted">new</span>}
              </td>
              {editable && <td><button type="button" onClick={() => remove(r.key)} className="grid size-7 place-items-center rounded text-muted hover:bg-red-500/10 hover:text-red-600" aria-label={`Remove row ${i + 1}`}>
                {xIcon}
              </button></td>}
            </tr>
          ))}
          {!rows.length && <tr><td colSpan={cols.length + 3} className="px-2 py-3 text-xs text-muted">No rows: the task is done as one piece of work.</td></tr>}
        </tbody>
      </table>
      </div>
      {editable && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line px-2 py-1.5">
          <button type="button" onClick={() => add([cols.map(() => "")])} className={`text-xs ${link}`}>+ Add row</button>
          <button type="button" onClick={() => setCols((cs) => [...cs, `Column ${cs.length + 1}`])} className={`text-xs ${link}`}>+ Add column</button>
          <span className="text-xs text-muted">Tip: paste lines (or cells from a spreadsheet) into a row to add them all.</span>
        </div>
      )}
    </div>
  );
}

export function TokenForm({ appUrl }: { appUrl: string }) {
  const [state, action, pending] = useActionState(createToken, null);
  const cmd = state && `claude mcp add --scope user --transport http commons ${appUrl}/api/mcp --header "Authorization: Bearer ${state.token}"`;
  return (
    <div className="space-y-3">
      <form action={action} className="flex flex-wrap gap-2 sm:flex-nowrap">
        <input name="name" placeholder="Token name (e.g. laptop)" className={input} required />
        <button className={btnPrimary} disabled={pending}>Create token</button>
      </form>
      {cmd && (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
          <p className="mb-2 font-medium">Shown once. Copy it now.</p>
          <pre className="mb-2 overflow-x-auto whitespace-pre-wrap break-all rounded bg-paper p-2 font-mono text-xs">{cmd}</pre>
          <CopyButton text={cmd} label="Copy command" />
        </div>
      )}
    </div>
  );
}

export function InviteForm() {
  const [state, action, pending] = useActionState(makeInvite, null);
  return (
    <div className="space-y-3">
      <form action={action} className="flex flex-wrap gap-2 sm:flex-nowrap">
        <select name="role" aria-label="Role" className={control}><option value="member">Member</option><option value="lead">Lead</option></select>
        <button className={btnPrimary} disabled={pending}>Create invite link</button>
      </form>
      {state && "error" in state && <p role="alert" className="text-sm text-red-600">{state.error}</p>}
      {state && "link" in state && (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
          <pre className="mb-2 overflow-x-auto whitespace-pre-wrap break-all rounded bg-paper p-2 font-mono text-xs">{state.link}</pre>
          <p className="mb-2 text-xs text-muted">Send this link to one person. It works once, for 7 days.</p>
          <CopyButton text={state.link} />
        </div>
      )}
    </div>
  );
}
