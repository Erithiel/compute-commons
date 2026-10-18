import { Suspense } from "react";
import { signup } from "@/app/(auth)/actions";
import { ActionForm } from "@/components/auth-forms";
import { Mark, btnPrimary, input, label } from "@/components/ui";

async function Form({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next = "" } = await searchParams;
  return (
    <ActionForm action={signup} className="w-full max-w-sm rounded-xl border border-line bg-panel p-6 shadow-[0_1px_2px_rgb(0_0_0/0.04),0_8px_24px_-12px_rgb(0_0_0/0.12)]">
      <input type="hidden" name="next" value={next} />
      <div className="space-y-3">
        <Mark className="size-8" />
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Relay</h1>
          <p className="text-sm text-muted">Create your account.</p>
        </div>
      </div>
      <div><label htmlFor="name" className={label}>Name</label><input id="name" name="name" autoComplete="name" required maxLength={128} className={input} /></div>
      <div><label htmlFor="email" className={label}>Email</label><input id="email" type="email" name="email" autoComplete="email" required className={input} placeholder="you@rando.ge" /></div>
      <div><label htmlFor="password" className={label}>Password</label><input id="password" type="password" name="password" minLength={8} autoComplete="new-password" required className={input} /></div>
      <button className={`${btnPrimary} w-full py-2`}>Create account</button>
      <p className="text-sm text-muted"><a href={`/login?next=${encodeURIComponent(next)}`} className="underline">Already have an account? Sign in</a></p>
    </ActionForm>
  );
}

export default function SignupPage({ searchParams }: PageProps<"/signup">) {
  return (
    <main className="grid min-h-screen place-items-center bg-sidebar p-4">
      <Suspense><Form searchParams={searchParams as Promise<{ next?: string }>} /></Suspense>
    </main>
  );
}
