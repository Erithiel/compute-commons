import type { ReactNode } from "react";

// ponytail: plain Tailwind classes; swap for shadcn components (F0 step 1) when the UI grows.
export const btn = "inline-flex items-center gap-1 rounded-md border border-line bg-panel px-2.5 py-1 text-sm hover:bg-hover disabled:opacity-50";
export const btnPrimary = "inline-flex items-center gap-1 rounded-md bg-ink px-3 py-1.5 text-sm font-medium text-paper hover:opacity-90";
export const input = "w-full rounded-md border border-line bg-panel px-2.5 py-1.5 text-sm outline-none focus:border-accent";
export const label = "block text-xs font-medium text-muted mb-1";

const tones = {
  gray: "bg-hover text-muted",
  green: "bg-green-500/15 text-green-700 dark:text-green-400",
  blue: "bg-blue-500/15 text-blue-700 dark:text-blue-400",
  red: "bg-red-500/15 text-red-700 dark:text-red-400",
  amber: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
};
export type Tone = keyof typeof tones;

export function Badge({ tone = "gray", children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`inline-block whitespace-nowrap rounded px-1.5 py-0.5 text-xs font-medium ${tones[tone]}`}>{children}</span>;
}

export function Card({ title, children, actions }: { title?: string; children: ReactNode; actions?: ReactNode }) {
  return (
    <section className="rounded-lg border border-line bg-panel">
      {title && (
        <header className="flex items-center justify-between border-b border-line px-4 py-2.5">
          <h2 className="text-sm font-semibold">{title}</h2>
          {actions}
        </header>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}

export function PageHeader({ title, sub, children }: { title: string; sub?: string; children?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {sub && <p className="mt-1 text-sm text-muted">{sub}</p>}
      </div>
      {children}
    </div>
  );
}

export const LeadOnly = () => <Badge tone="amber">lead only</Badge>;

export const fmt = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—";
