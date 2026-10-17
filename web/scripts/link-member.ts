// npm run link-member -- <memberId> <email>   e.g. npm run link-member -- m1 you@rando.ge
// The account must exist (sign up first) and must not be in a team yet.
import { Client, Query, TablesDB, Users } from "node-appwrite";
import { DB_ID, T } from "../lib/tables";

async function main() { // no top-level await: the package is CommonJS
  const [memberId, email] = process.argv.slice(2);
  if (!memberId || !email) throw new Error("usage: link-member <memberId> <email>");
  const client = new Client().setEndpoint(process.env.APPWRITE_ENDPOINT!).setProject(process.env.APPWRITE_PROJECT_ID!).setKey(process.env.APPWRITE_API_KEY!);
  const [user] = (await new Users(client).list([Query.equal("email", email)])).users;
  if (!user) throw new Error(`No account for ${email}. Sign up first.`);
  await new TablesDB(client).updateRow(DB_ID, T.members, memberId, { userId: user.$id, name: user.name || email });
  console.log(`${memberId} is now ${email}`);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
