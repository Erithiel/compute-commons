"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useActionState, useState } from "react";
import { createToken } from "@/app/actions";
import { btn, btnPrimary, input } from "./ui";

const links = [
  ["/board", "Board"], ["/tasks", "Tasks"], ["/logs", "Logs"], ["/setup", "Connect Claude"], ["/settings", "Settings"],
] as const;

export function Nav() {
  const path = usePathname();
  return (
    <nav className="flex gap-1 md:flex-col">
      {links.map(([href, text]) => (
        <Link key={href} href={href}
          className={`rounded-md px-3 py-1.5 text-sm ${path.startsWith(href) ? "bg-hover font-medium" : "text-muted hover:bg-hover"}`}>
          {text}
        </Link>
      ))}
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

type Row = { key: number; text: string; status?: { label: string; tone: string } };

/** Editable rows of a task. Each row is claimed separately by Claude; status/who is read-only. */
export function ItemsTable({ initial, editable }: { initial: Omit<Row, "key">[]; editable: boolean }) {
  const [rows, setRows] = useState<Row[]>(() => initial.map((r, i) => ({ ...r, key: i })));
  const [next, setNext] = useState(initial.length);
  const add = (texts: string[], at = rows.length) => {
    setRows((rs) => [...rs.slice(0, at), ...texts.map((text, i) => ({ key: next + i, text })), ...rs.slice(at)]);
    setNext((n) => n + texts.length);
  };
  const set = (key: number, text: string) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, text } : r)));
  const remove = (key: number) => setRows((rs) => rs.filter((r) => r.key !== key));

  return (
    <div className="overflow-hidden rounded-md border border-line">
      <table className="w-full text-sm">
        <thead className="bg-hover text-left text-xs text-muted">
          <tr><th className="w-8 px-2 py-1.5">#</th><th className="px-2 py-1.5">Item</th><th className="px-2 py-1.5">Status</th>{editable && <th className="w-8" />}</tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((r, i) => (
            <tr key={r.key}>
              <td className="px-2 text-xs text-muted">{i + 1}</td>
              <td className="px-1 py-1">
                <input name="items" value={r.text} readOnly={!editable} placeholder="e.g. a client, a site, a file…"
                  onChange={(e) => set(r.key, e.target.value)}
                  onPaste={(e) => {
                    const lines = e.clipboardData.getData("text").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
                    if (lines.length < 2) return;
                    e.preventDefault();
                    set(r.key, lines[0]);
                    add(lines.slice(1), i + 1);
                  }}
                  className="w-full rounded border border-transparent bg-transparent px-1.5 py-1 outline-none focus:border-accent" />
              </td>
              <td className="whitespace-nowrap px-2 text-xs">
                {r.status ? <span className={r.status.tone}>{r.status.label}</span> : <span className="text-muted">new</span>}
              </td>
              {editable && <td><button type="button" onClick={() => remove(r.key)} className="px-2 text-muted hover:text-red-600" aria-label="Remove row">×</button></td>}
            </tr>
          ))}
          {!rows.length && <tr><td colSpan={4} className="px-2 py-3 text-xs text-muted">No rows: the task is done as one piece of work.</td></tr>}
        </tbody>
      </table>
      {editable && (
        <div className="border-t border-line px-2 py-1.5">
          <button type="button" onClick={() => add([""])} className="text-xs text-accent hover:underline">+ Add row</button>
          <span className="ml-3 text-xs text-muted">Tip: paste many lines into a row to add them all.</span>
        </div>
      )}
    </div>
  );
}

export function TokenForm({ appUrl }: { appUrl: string }) {
  const [state, action, pending] = useActionState(createToken, null);
  const cmd = state && `claude mcp add --transport http commons ${appUrl}/api/mcp --header "Authorization: Bearer ${state.token}"`;
  return (
    <div className="space-y-3">
      <form action={action} className="flex flex-wrap gap-2 sm:flex-nowrap">
        <select name="kind" className={`${input} sm:w-auto`}>
          <option value="schedule">For my Claude schedule</option>
          <option value="manual">For my own Claude Code sessions</option>
        </select>
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
