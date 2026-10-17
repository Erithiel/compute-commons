import { Query } from "node-appwrite";
import { allRows, T } from "@/lib/appwrite";
import { requireMember } from "@/lib/auth";
import { db, who } from "@/lib/mock";
import { cancelInvite, leaveTeam, removeMember, revokeToken, saveSettings, setRole } from "@/app/actions";
import { ActionForm } from "@/components/auth-forms";
import { InviteForm } from "@/components/client";
import type { Invite } from "@/lib/types";
import { Badge, Card, LeadOnly, PageHeader, btn, btnPrimary, control, fmt, input, label, link } from "@/components/ui";

export default async function SettingsPage() {
  const me = await requireMember();
  const s = await db();
  const lead = me.role === "lead";
  const invites = lead ? await allRows<Invite>(T.invites, [Query.equal("teamId", me.teamId), Query.isNull("usedBy"), Query.equal("revoked", false)]) : [];
  const tokens = s.apiTokens.filter((t) => lead || t.owner === me.$id);

  return (
    <>
      <PageHeader title="Settings" />
      <div className="space-y-6">
        <Card title="Team policy" actions={!lead && <LeadOnly />}>
          <form action={saveSettings} className="space-y-3">
            <fieldset disabled={!lead} className="space-y-3">
              <div>
                <label className={label}>Team policy: rules placed before every task prompt (e.g. how to deliver results, what never to touch).</label>
                <textarea name="policy" rows={5} defaultValue={s.settings.policy} className={`${input} font-mono`} />
              </div>
              {lead && <button className={btnPrimary}>Save</button>}
            </fieldset>
          </form>
        </Card>

        <Card title="MCP tokens">
          <p className="mb-2 text-xs text-muted">Create new tokens on <a href="/setup" className={link}>Connect Claude</a>.</p>
          <ul className="divide-y divide-line text-sm">
            {tokens.map((t) => (
              <li key={t.$id} className="flex items-center justify-between gap-2 py-2">
                <span>{t.name} <span className="text-xs text-muted">· {who(s, t.owner, t.scheduled)} · last used {fmt(t.lastUsedAt)}</span></span>
                {t.revoked ? <Badge tone="red">revoked</Badge> : (
                  <form action={revokeToken}><input type="hidden" name="id" value={t.$id} /><button className={btn}>Revoke</button></form>
                )}
              </li>
            ))}
          </ul>
        </Card>

        {lead && (
          <Card title="Invite">
            <InviteForm />
            <ul className="mt-3 divide-y divide-line text-sm">
              {invites.map((i) => (
                <li key={i.$id} className="flex items-center justify-between gap-2 py-2">
                  <span>{i.role} <span className="text-xs text-muted">· by {who(s, i.createdBy)} · expires {fmt(i.expiresAt)}</span></span>
                  <form action={cancelInvite}><input type="hidden" name="id" value={i.$id} /><button className={btn}>Cancel</button></form>
                </li>
              ))}
            </ul>
          </Card>
        )}

        <Card title="Members" actions={!lead && <LeadOnly />}>
          <ul className="divide-y divide-line text-sm">
            {s.members.map((m) => (
              <li key={m.$id} className="flex items-center justify-between gap-2 py-2">
                <span>{m.name}</span>
                {lead && m.$id !== me.$id ? (
                  <div className="flex gap-2">
                    <ActionForm action={setRole}>
                      <div className="flex gap-1">
                        <input type="hidden" name="id" value={m.$id} />
                        <select name="role" aria-label={`Role for ${m.name}`} defaultValue={m.role} className={`${control} py-1`}>
                          <option>lead</option><option>member</option>
                        </select>
                        <button className={btn}>Set</button>
                      </div>
                    </ActionForm>
                    <ActionForm action={removeMember}><input type="hidden" name="id" value={m.$id} /><button className={btn}>Remove</button></ActionForm>
                  </div>
                ) : <Badge tone={m.role === "lead" ? "amber" : "gray"}>{m.role}</Badge>}
              </li>
            ))}
          </ul>
        </Card>

        <Card title="Leave team">
          <ActionForm action={leaveTeam}>
            <div className="flex items-center gap-3">
              <button className={btn}>Leave team</button>
              <span className="text-xs text-muted">Your MCP tokens stop working.</span>
            </div>
          </ActionForm>
        </Card>

        {lead && (
          <Card title="Audit log">
            <ul className="divide-y divide-line text-sm">
              {s.audit.slice(0, 20).map((a) => (
                <li key={a.$id} className="flex flex-wrap gap-x-3 gap-y-0.5 py-1.5">
                  <span className="w-28 text-xs text-muted">{fmt(a.at)}</span>
                  <span className="font-mono text-xs">{a.action}</span>
                  <span className="text-xs text-muted">{who(s, a.actor)} · {a.entity}{a.after && ` → ${a.after.slice(0, 60)}`}</span>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>
    </>
  );
}
