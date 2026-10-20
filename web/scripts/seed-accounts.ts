// Dev seed: login accounts for the sample members (Rati, Nino, Giorgi in team "rando").
//   npm run seed:accounts
// Run `npm run setup:appwrite -- --sample` first. Safe to run again: existing accounts are reused.
// The passwords below are public (they are in the repo), so the script refuses to run unless SEED_DEMO=yes is set.
import { Client, ID, Query, TablesDB, Users } from "node-appwrite";
import { DB_ID, T } from "../lib/tables";

const ACCOUNTS = [
  { memberId: "m1", email: "admin@admin.com", password: "admin123", name: "Rati" },  // lead
  { memberId: "m2", email: "admin2@admin.com", password: "admin123", name: "Nino" },
  { memberId: "m3", email: "admin3@admin.com", password: "admin123", name: "Giorgi" },
];

async function main() {
  if (process.env.SEED_DEMO !== "yes") throw new Error("Demo accounts have public passwords. Only for a dev project: SEED_DEMO=yes npm run seed:accounts");
  const client = new Client().setEndpoint(process.env.APPWRITE_ENDPOINT!).setProject(process.env.APPWRITE_PROJECT_ID!).setKey(process.env.APPWRITE_API_KEY!);
  const users = new Users(client);
  const tables = new TablesDB(client);
  for (const a of ACCOUNTS) {
    const user = (await users.list([Query.equal("email", a.email)])).users[0]
      ?? await users.create(ID.unique(), a.email, undefined, a.password, a.name);
    await tables.updateRow(DB_ID, T.members, a.memberId, { userId: user.$id, name: a.name });
    console.log(`${a.email} / ${a.password} → ${a.name} (${a.memberId})`);
  }
}

main().catch((e) => { console.error(e.message); process.exit(1); });
