/** Sent by the MCP server as its `instructions` when Claude connects (F5), never pasted anywhere. */
export const MCP_INSTRUCTIONS = [
  "This server hands out team tasks. To work on them:",
  "1. Call next_task. It claims the next free task (or one row of a task) for you and returns what to do. If it returns nothing, stop.",
  "2. (To pick a specific one instead: call list_work, then claim it. If claim says taken or done, choose another.)",
  "3. Do what the prompt says, for the item it names if there is one. Never work on something you have not claimed.",
  "4. On long work, call heartbeat at least every 30 minutes.",
  "5. Finish with complete (a short summary, and details: what you did, where the result is, anything a human should know), fail (reason), or skip (reason).",
  "6. Repeat from step 1 until next_task returns nothing.",
].join("\n");

/** The one line pasted into a Claude scheduled task. */
export const SETUP_PROMPT = `Use the "commons" MCP connector and work through our team's task queue.`;
