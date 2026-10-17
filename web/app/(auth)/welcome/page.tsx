import { Suspense } from "react";
import { redirect } from "next/navigation";
import { newTeam } from "@/app/(auth)/actions";
import { ActionForm } from "@/components/auth-forms";
import { Mark, btnPrimary, input, label } from "@/components/ui";
import { getMember, getUser } from "@/lib/auth";

async function Form() {
  if (!(await getUser())) redirect("/login");
  if (await getMember()) redirect("/board");
  return (
    <ActionForm action={newTeam} className="w-full max-w-sm rounded-xl border border-line bg-panel p-6 shadow-[0_1px_2px_rgb(0_0_0/0.04),0_8px_24px_-12px_rgb(0_0_0/0.12)]">
      <div className="space-y-3">
        <Mark className="size-8" />
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Welcome</h1>
          <p className="text-sm text-muted">Create your team to get started.</p>
        </div>
      </div>
      <div><label htmlFor="team" className={label}>Team name</label><input id="team" name="team" required maxLength={128} className={input} /></div>
      <button className={`${btnPrimary} w-full py-2`}>Create team</button>
      <p className="text-sm text-muted">Joining an existing team? Open the invite link your lead sent you.</p>
    </ActionForm>
  );
}

export default function WelcomePage() {
  return (
    <main className="grid min-h-screen place-items-center bg-sidebar p-4">
      <Suspense><Form /></Suspense>
    </main>
  );
}
