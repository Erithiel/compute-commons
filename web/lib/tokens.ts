// MCP tokens (F5). The raw token is shown once; only its sha256 is stored.
import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { ID, Query } from "node-appwrite";
import { adminTables, allRows, DB_ID, rowOrNull, T } from "./appwrite";
import type { ApiToken, Caller, Member } from "./types";

export const newTokenString = () => `cc_${randomBytes(32).toString("base64url")}`;
export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

/** A token always belongs to one member; the same token serves their Claude Code sessions and Claude schedules. */
export async function createToken(teamId: string, memberId: string, name: string) {
  const token = newTokenString();
  const row = await adminTables().createRow(DB_ID, T.apiTokens, ID.unique(), {
    teamId, owner: memberId, name: name.trim() || "token", tokenHash: hashToken(token), lastUsedAt: null, revoked: false,
  });
  return { token, row: row as unknown as ApiToken };
}

/** "Bearer cc_..." → the caller, or null (missing, unknown, revoked, or its member was removed). */
export async function verifyBearer(header: string | null): Promise<Caller | null> {
  const token = header?.match(/^Bearer\s+(cc_\S+)$/i)?.[1];
  if (!token) return null;
  const [row] = await allRows<ApiToken>(T.apiTokens, [Query.equal("tokenHash", hashToken(token)), Query.equal("revoked", false)]);
  const member = row && await rowOrNull<Member>(T.members, row.owner);
  if (!member || row.teamId !== member.teamId) return null;
  await adminTables().updateRow(DB_ID, T.apiTokens, row.$id, { lastUsedAt: new Date().toISOString() });
  return { kind: "member", memberId: member.$id, teamId: member.teamId, role: member.role };
}

export async function revokeToken(id: string) {
  await adminTables().updateRow(DB_ID, T.apiTokens, id, { revoked: true });
}
