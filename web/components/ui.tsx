import type { ReactNode } from "react";

// ponytail: plain Tailwind classes; swap for shadcn components (F0 step 1) when the UI grows.
const press = "transition-[background-color,opacity,transform] duration-150 active:translate-y-px disabled:pointer-events-none disabled:opacity-50";
export const btn = `inline-flex items-center justify-center gap-1 whitespace-nowrap rounded-md border border-line bg-panel px-2.5 py-1 text-sm hover:bg-hover ${press}`;
export const btnPrimary = `inline-flex items-center justify-center gap-1 whitespace-nowrap rounded-md bg-ink px-3 py-1.5 text-sm font-medium text-paper hover:opacity-85 ${press}`;
/** Form control without a width, for selects and inputs that size themselves. */
export const control = "rounded-md border border-line bg-panel px-2.5 py-1.5 text-sm outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-muted/80 focus:border-accent focus:ring-3 focus:ring-accent-soft disabled:bg-hover disabled:text-muted";
export const input = `${control} w-full`;
export const label = "block text-xs font-medium text-muted mb-1";
export const link = "text-accent underline-offset-3 hover:underline";

const tones = {
  gray: "bg-hover text-muted",
  green: "bg-green-500/15 text-green-700 dark:text-green-400",
  blue: "bg-blue-500/15 text-blue-700 dark:text-blue-400",
  red: "bg-red-500/15 text-red-700 dark:text-red-400",
  amber: "bg-amber-500/15 text-amber-800 dark:text-amber-400",
};
export type Tone = keyof typeof tones;

export function Badge({ tone = "gray", children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`inline-block whitespace-nowrap rounded px-1.5 py-0.5 text-xs font-medium ${tones[tone]}`}>{children}</span>;
}

export function Card({ title, children, actions }: { title?: ReactNode; children: ReactNode; actions?: ReactNode }) {
  return (
    <section className="rounded-lg border border-line bg-panel">
      {title && (
        <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-line px-4 py-2.5">
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
      <div className="max-w-2xl">
        <h1 className="text-xl font-semibold tracking-tight text-balance">{title}</h1>
        {sub && <p className="mt-1 text-sm text-pretty text-muted">{sub}</p>}
      </div>
      {children}
    </div>
  );
}

/** Brand mark: three overlapping circles, the shared middle filled. */
export function Mark({ className = "size-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" className={`shrink-0 text-accent ${className}`} aria-hidden>
      <g fill="none" stroke="currentColor" strokeWidth="1.6">
        <circle cx="7" cy="7.5" r="4.6" /><circle cx="13" cy="7.5" r="4.6" /><circle cx="10" cy="12.7" r="4.6" />
      </g>
      <circle cx="10" cy="9.3" r="1.6" fill="currentColor" />
    </svg>
  );
}

export const LeadOnly = () => <Badge tone="amber">lead only</Badge>;

export const fmt = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—";
