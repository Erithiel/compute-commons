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

export function TokenForm({ allowTeam, appUrl }: { allowTeam?: boolean; appUrl: string }) {
  const [state, action, pending] = useActionState(createToken, null);
  const cmd = state && `claude mcp add --transport http commons ${appUrl}/api/mcp --header "Authorization: Bearer ${state.token}"`;
  return (
    <div className="space-y-3">
      <form action={action} className="flex flex-wrap gap-2 sm:flex-nowrap">
        {allowTeam && (
          <select name="owner" className={`${input} sm:w-auto`}>
            <option value="team">For a Claude schedule (team)</option>
            <option value="me">For my own Claude Code</option>
          </select>
        )}
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
