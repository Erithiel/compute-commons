// npm run link-member -- <memberId> <email>   e.g. npm run link-member -- m1 you@rando.ge
// Points an existing member row (e.g. a sample member with tasks assigned) at a CRM account, before that
// person's first sign-in (which would otherwise add them as a new member). The email must be approved in the CRM.
import { Client, TablesDB } from "node-appwrite";
import { DB_ID, T } from "../lib/tables";

async function main() { // no top-level await: the package is CommonJS
  const [memberId, email] = process.argv.slice(2);
  if (!memberId || !email) throw new Error("usage: link-member <memberId> <email>");
  const res = await fetch(`${process.env.CRM_URL}/api/bridge/relay/approved`, { headers: { "x-api-key": process.env.RELAY_API_KEY! } });
  if (!res.ok) throw new Error(`CRM approved list: HTTP ${res.status}`);
  const { users } = (await res.json()) as { users: Array<{ id: string; name: string; email: string }> };
  const user = users.find((u) => u.email.toLowerCase() === email.trim().toLowerCase());
  if (!user) throw new Error(`${email} is not an approved CRM user.`);
  const client = new Client().setEndpoint(process.env.APPWRITE_ENDPOINT!).setProject(process.env.APPWRITE_PROJECT_ID!).setKey(process.env.APPWRITE_API_KEY!);
  await new TablesDB(client).updateRow(DB_ID, T.members, memberId, { userId: user.id, name: user.name });
  console.log(`${memberId} is now ${email}`);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
