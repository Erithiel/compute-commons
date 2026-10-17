// MCP endpoint (TECH §5): https://<app>/api/mcp, stateless Streamable HTTP. Every request needs "Authorization: Bearer cc_…".
import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { MCP_INSTRUCTIONS } from "@/lib/mcp/instructions";
import { registerManageTools } from "@/lib/mcp/manage";
import { registerWorkTools } from "@/lib/mcp/work";
import { verifyBearer } from "@/lib/tokens";

const mcp = createMcpHandler((server) => {
  registerWorkTools(server);
  registerManageTools(server);
},{ instructions: MCP_INSTRUCTIONS, serverInfo: { name: "commons", version: "0.1.0" } });

/** The token's member becomes the caller of every tool (read back with callerOf in lib/mcp/reply.ts). */
const handler = withMcpAuth(mcp, async (req, bearer) => {
  const caller = await verifyBearer(req.headers.get("authorization"));
  return caller ? { token: bearer ?? "", clientId: caller.memberId, scopes: [], extra: { caller } } : undefined;
}, { required: true });

export { handler as GET, handler as POST, handler as DELETE };
