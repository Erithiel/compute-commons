import { Suspense, type ReactNode } from "react";
import { redirect } from "next/navigation";
import { getMember, getUser } from "@/lib/auth";
import { rowOrNull, T } from "@/lib/appwrite";
import type { Team } from "@/lib/types";
import { logout } from "@/app/(auth)/actions";
import { Nav } from "@/components/client";
import { Mark } from "@/components/ui";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<p className="p-8 text-sm text-muted">Loading…</p>}>
      <Shell>{children}</Shell>
    </Suspense>
  );
}

// Grid: on md the sidebar is column 1 (nav on top, account at the bottom); on mobile the account block falls below the page.
async function Shell({ children }: { children: ReactNode }) {
  const user = await getUser();
  if (!user) redirect("/login");
  const me = await getMember();
  if (!me) redirect("/welcome");
  const team = await rowOrNull<Team>(T.teams, me.teamId);
  return (
    <div className="min-h-screen md:grid md:grid-cols-[15rem_minmax(0,1fr)] md:grid-rows-[1fr_auto]">
      <aside className="sticky top-0 z-10 space-y-3 border-b border-line bg-sidebar/90 px-4 pt-3 backdrop-blur md:static md:space-y-6 md:border-r md:border-b-0 md:bg-sidebar md:p-4 md:pt-5">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 md:block md:space-y-2">
          <p className="flex items-center gap-2 font-semibold tracking-tight"><Mark />Relay</p>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted md:flex-col md:items-start md:pl-7">
            <span className="inline-flex items-center gap-1.5">{team?.name}</span>          </div>
        </div>
        <Nav />
      </aside>
      <main className="mx-auto w-full max-w-5xl px-4 py-6 md:col-start-2 md:row-span-2 md:row-start-1 md:p-8">{children}</main>
      <footer className="border-t border-line bg-sidebar p-4 text-sm md:col-start-1 md:row-start-2 md:border-r">
        <p className="text-xs text-muted">Signed in as {me.name} ({me.role})</p>
        <form action={logout} className="mt-2"><button className="text-xs text-muted hover:text-ink hover:underline">Sign out</button></form>
      </footer>
    </div>
  );
}
