import { Suspense } from "react";
import { login } from "@/app/(auth)/actions";
import { ActionForm } from "@/components/auth-forms";
import { Mark, btnPrimary, input, label } from "@/components/ui";

async function Form({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next = "" } = await searchParams;
  return (
    <ActionForm action={login} className="w-full max-w-sm rounded-xl border border-line bg-panel p-6 shadow-[0_1px_2px_rgb(0_0_0/0.04),0_8px_24px_-12px_rgb(0_0_0/0.12)]">
      <input type="hidden" name="next" value={next} />
      <div className="space-y-3">
        <Mark className="size-8" />
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Relay</h1>
          <p className="text-sm text-muted">Sign in to your team.</p>
        </div>
      </div>
      <div><label htmlFor="email" className={label}>Email</label><input id="email" type="email" name="email" autoComplete="email" required className={input} placeholder="you@rando.ge" /></div>
      <div><label htmlFor="password" className={label}>Password</label><input id="password" type="password" name="password" autoComplete="current-password" required className={input} /></div>
      <button className={`${btnPrimary} w-full py-2`}>Sign in</button>
      <p className="text-sm text-muted"><a href={`/signup?next=${encodeURIComponent(next)}`} className="underline">No account? Create one</a></p>
    </ActionForm>
  );
}

export default function LoginPage({ searchParams }: PageProps<"/login">) {
  return (
    <main className="grid min-h-screen place-items-center bg-sidebar p-4">
      <Suspense><Form searchParams={searchParams as Promise<{ next?: string }>} /></Suspense>
    </main>
  );
}
