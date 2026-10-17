"use client";
import { useActionState, type ReactNode } from "react";

type State = { error: string } | null;

/** A form bound to a server action that returns { error } on failure. */
export function ActionForm({ action, children, className }: {
  action: (s: State, f: FormData) => Promise<State>; children: ReactNode; className?: string;
}) {
  const [state, run, pending] = useActionState(action, null);
  return (
    <form action={run} className={className}>
      <fieldset disabled={pending} className="space-y-4">{children}</fieldset>
      {state?.error && <p role="alert" className="mt-3 text-sm text-red-600 dark:text-red-400">{state.error}</p>}
    </form>
  );
}
