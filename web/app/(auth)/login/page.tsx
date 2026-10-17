import { signIn } from "@/app/actions";
import { btnPrimary, input, label } from "@/components/ui";

// Mock login: email/password are ignored, the select picks who you are. F1 wires Appwrite sessions.
export default function LoginPage() {
  return (
    <main className="grid min-h-screen place-items-center p-4">
      <form action={signIn} className="w-full max-w-sm space-y-4 rounded-lg border border-line bg-panel p-6">
        <div>
          <h1 className="text-lg font-semibold">Compute Commons</h1>
          <p className="text-sm text-muted">Sign in to your team.</p>
        </div>
        <div><label className={label}>Email</label><input type="email" name="email" className={input} placeholder="you@rando.ge" /></div>
        <div><label className={label}>Password</label><input type="password" name="password" className={input} /></div>
        <div>
          <label className={label}>Mock: sign in as</label>
          <select name="member" className={input} defaultValue="m1">
            <option value="m1">Rati (lead)</option>
            <option value="m2">Nino (member)</option>
          </select>
        </div>
        <button className={`${btnPrimary} w-full justify-center`}>Sign in</button>
      </form>
    </main>
  );
}
