import { it, expect } from "vitest";
import { SETUP_PROMPT, MCP_INSTRUCTIONS } from "../mcp/instructions";

it("keeps the pasted prompt to one line and the workflow on the server", () => {
  expect(SETUP_PROMPT.split("\n")).toHaveLength(1);
  expect(MCP_INSTRUCTIONS).toContain("next_task");
});

it("explains how to set up work from a plain-language request", () => {
  for (const word of ["list_members", "create_task", "update_task", "repeatDays", "rows", "Confirm with the user"]) expect(MCP_INSTRUCTIONS).toContain(word);
});
