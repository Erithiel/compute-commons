import { Suspense } from "react";
import { acceptInvite } from "@/app/(auth)/actions";
import { ActionForm } from "@/components/auth-forms";
import { Mark, btnPrimary } from "@/components/ui";
import { getUser } from "@/lib/auth";
import { inviteProblem } from "@/lib/team-rules";
import { findInvite } from "@/lib/teams";

const card = "w-full max-w-sm space-y-4 rounded-xl border border-line bg-panel p-6 shadow-[0_1px_2px_rgb(0_0_0/0.04),0_8px_24px_-12px_rgb(0_0_0/0.12)]";

async function Invite({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const found = await findInvite(code);
  const problem = inviteProblem(found?.invite ?? null, new Date());
  const head = <Mark className="size-8" />;
  if (problem || !found) return <div className={card}>{head}<p role="alert" className="text-sm">{problem}</p></div>;
  const user = await getUser();
  const line = <p className="text-sm">You&apos;re invited to <strong>{found.team.name}</strong> as {found.invite.role}.</p>;
  if (!user) {
    const next = encodeURIComponent(`/join/${code}`);
    return (
      <div className={card}>{head}{line}
        <p className="text-sm text-muted"><a href={`/signup?next=${next}`} className="underline">Create an account</a> or <a href={`/login?next=${next}`} className="underline">sign in</a> to join.</p>
      </div>
    );
  }
  return (
    <ActionForm action={acceptInvite} className={card}>
      {head}{line}
      <input type="hidden" name="code" value={code} />
      <button className={`${btnPrimary} w-full py-2`}>Join {found.team.name}</button>
    </ActionForm>
  );
}

export default function JoinPage({ params }: PageProps<"/join/[code]">) {
  return (
    <main className="grid min-h-screen place-items-center bg-sidebar p-4">
      <Suspense><Invite params={params} /></Suspense>
    </main>
  );
}
