import { Suspense } from "react";
import { login } from "@/app/(auth)/actions";
import { Mark, btnPrimary } from "@/components/ui";

const PROBLEMS: Record<string, string> = {
  denied: "This Google account is not approved in the Rando CRM. Ask an admin to approve you there, or sign in with your work account.",
  failed: "Sign-in did not finish. Try again.",
};

async function Form({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { next = "", error } = await searchParams;
  return (
    <form action={login} className="w-full max-w-sm space-y-4 rounded-xl border border-line bg-panel p-6 shadow-[0_1px_2px_rgb(0_0_0/0.04),0_8px_24px_-12px_rgb(0_0_0/0.12)]">
      <input type="hidden" name="next" value={next} />
      <div className="space-y-3">
        <Mark className="size-8" />
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Relay</h1>
          <p className="text-sm text-muted">Sign in with the Google account you use for the Rando CRM.</p>
        </div>
      </div>
      <button className={`${btnPrimary} w-full py-2`}>Sign in with Google</button>
      {error && PROBLEMS[error] && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{PROBLEMS[error]}</p>}
    </form>
  );
}

export default function LoginPage({ searchParams }: PageProps<"/login">) {
  return (
    <main className="grid min-h-screen place-items-center bg-sidebar p-4">
      <Suspense><Form searchParams={searchParams as Promise<{ next?: string; error?: string }>} /></Suspense>
    </main>
  );
}
