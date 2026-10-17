import { signIn } from "@/app/actions";
import { Mark, btnPrimary, input, label } from "@/components/ui";

// Mock login: email/password are ignored, the select picks who you are. F1 wires Appwrite sessions.
export default function LoginPage() {
  return (
    <main className="grid min-h-screen place-items-center bg-sidebar p-4">
      <form action={signIn} className="w-full max-w-sm space-y-4 rounded-xl border border-line bg-panel p-6 shadow-[0_1px_2px_rgb(0_0_0/0.04),0_8px_24px_-12px_rgb(0_0_0/0.12)]">
        <div className="space-y-3">
          <Mark className="size-8" />
          <div>
            <h1 className="text-lg font-semibold tracking-tight">Compute Commons</h1>
            <p className="text-sm text-muted">Sign in to your team.</p>
          </div>
        </div>
        <div><label htmlFor="email" className={label}>Email</label><input id="email" type="email" name="email" autoComplete="email" className={input} placeholder="you@rando.ge" /></div>
        <div><label htmlFor="password" className={label}>Password</label><input id="password" type="password" name="password" autoComplete="current-password" className={input} /></div>
        <div>
          <label htmlFor="member" className={label}>Mock: sign in as</label>
          <select id="member" name="member" className={input} defaultValue="m1">
            <option value="m1">Rati (lead)</option>
            <option value="m2">Nino (member)</option>
          </select>
        </div>
        <button className={`${btnPrimary} w-full py-2`}>Sign in</button>
      </form>
    </main>
  );
}
