import { Suspense, type ReactNode } from "react";
import { redirect } from "next/navigation";
import { getMember } from "@/lib/auth";
import { db } from "@/lib/mock";
import { ping } from "@/lib/appwrite";
import { signIn, signOut } from "@/app/actions";
import { Nav } from "@/components/client";
import { Badge } from "@/components/ui";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<p className="p-8 text-sm text-muted">Loading…</p>}>
      <Shell>{children}</Shell>
    </Suspense>
  );
}

// Pings Appwrite on every app load to verify endpoint + project.
async function AppwriteStatus() {
  const ok = await ping();
  return <p className="text-xs text-muted">Appwrite: <Badge tone={ok ? "green" : "red"}>{ok ? "connected" : "unreachable"}</Badge></p>;
}

async function Shell({ children }: { children: ReactNode }) {
  const me = await getMember();
  if (!me) redirect("/login");
  const { members } = await db();
  return (
    <div className="md:flex md:min-h-screen">
      <aside className="flex flex-col gap-4 border-b border-line bg-panel p-4 md:w-56 md:shrink-0 md:border-r md:border-b-0">
        <div className="flex items-center justify-between md:block">
          <p className="font-semibold tracking-tight">Compute Commons</p>
          <p className="text-xs text-muted">team: rando · <Badge tone="amber">mock data</Badge></p>
          <Suspense fallback={<p className="text-xs text-muted">Appwrite: checking…</p>}><AppwriteStatus /></Suspense>
        </div>
        <Nav />
        <div className="mt-auto space-y-2 border-t border-line pt-3 text-sm">
          {/* Mock-only role switcher, so lead/member permissions can be tried quickly. F1 removes it. */}
          <form action={signIn} className="space-y-1">
            <label className="block text-xs text-muted">Signed in as</label>
            <select name="member" defaultValue={me.$id} className="w-full rounded-md border border-line bg-panel px-2 py-1 text-sm">
              {members.map((m) => <option key={m.$id} value={m.$id}>{m.name} ({m.role})</option>)}
            </select>
            <button className="text-xs text-accent hover:underline">Switch</button>
          </form>
          <form action={signOut}><button className="text-xs text-muted hover:underline">Sign out</button></form>
        </div>
      </aside>
      <main className="mx-auto w-full max-w-5xl p-4 md:p-8">{children}</main>
    </div>
  );
}
