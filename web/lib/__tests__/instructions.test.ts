import { it, expect } from "vitest";
import { SETUP_PROMPT, MCP_INSTRUCTIONS } from "../mcp/instructions";

it("keeps the pasted prompt to one line and the workflow on the server", () => {
  expect(SETUP_PROMPT.split("\n")).toHaveLength(1);
  expect(MCP_INSTRUCTIONS).toContain("next_task");
});
