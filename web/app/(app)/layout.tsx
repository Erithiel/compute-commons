import { Suspense, type ReactNode } from "react";
import { redirect } from "next/navigation";
import { getMember } from "@/lib/auth";
import { db } from "@/lib/mock";
import { ping } from "@/lib/appwrite";
import { signIn, signOut } from "@/app/actions";
import { Nav } from "@/components/client";
import { Badge, Mark, btn, control } from "@/components/ui";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<p className="p-8 text-sm text-muted">Loading…</p>}>
      <Shell>{children}</Shell>
    </Suspense>
  );
}

const Dot = ({ ok }: { ok: boolean | null }) => (
  <span className={`inline-block size-1.5 rounded-full ${ok === null ? "bg-muted/50" : ok ? "bg-green-500" : "bg-red-500"}`} />
);

// Pings Appwrite on every app load to verify endpoint + project.
async function AppwriteStatus() {
  const ok = await ping();
  return <span className="inline-flex items-center gap-1.5"><Dot ok={ok} />Appwrite {ok ? "connected" : "unreachable"}</span>;
}

// Grid: on md the sidebar is column 1 (nav on top, account at the bottom); on mobile the account block falls below the page.
async function Shell({ children }: { children: ReactNode }) {
  const me = await getMember();
  if (!me) redirect("/login");
  const { members } = await db();
  return (
    <div className="min-h-screen md:grid md:grid-cols-[15rem_minmax(0,1fr)] md:grid-rows-[1fr_auto]">
      <aside className="sticky top-0 z-10 space-y-3 border-b border-line bg-sidebar/90 px-4 pt-3 backdrop-blur md:static md:space-y-6 md:border-r md:border-b-0 md:bg-sidebar md:p-4 md:pt-5">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 md:block md:space-y-2">
          <p className="flex items-center gap-2 font-semibold tracking-tight"><Mark />Compute Commons</p>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted md:flex-col md:items-start md:pl-7">
            <span className="inline-flex items-center gap-1.5">team rando <Badge tone="amber">mock data</Badge></span>
            <Suspense fallback={<span className="inline-flex items-center gap-1.5"><Dot ok={null} />Appwrite checking…</span>}><AppwriteStatus /></Suspense>
          </div>
        </div>
        <Nav />
      </aside>
      <main className="mx-auto w-full max-w-5xl px-4 py-6 md:col-start-2 md:row-span-2 md:row-start-1 md:p-8">{children}</main>
      <footer className="border-t border-line bg-sidebar p-4 text-sm md:col-start-1 md:row-start-2 md:border-r">
        {/* Mock-only role switcher, so lead/member permissions can be tried quickly. F1 removes it. */}
        <form action={signIn} className="space-y-1.5">
          <label htmlFor="as" className="block text-xs text-muted">Signed in as</label>
          <div className="flex gap-1.5">
            <select id="as" name="member" defaultValue={me.$id} className={`${control} min-w-0 flex-1 py-1`}>
              {members.map((m) => <option key={m.$id} value={m.$id}>{m.name} ({m.role})</option>)}
            </select>
            <button className={btn}>Switch</button>
          </div>
        </form>
        <form action={signOut} className="mt-2"><button className="text-xs text-muted hover:text-ink hover:underline">Sign out</button></form>
      </footer>
    </div>
  );
}
