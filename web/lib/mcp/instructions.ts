/** Sent by the MCP server as its `instructions` when Claude connects (F5), never pasted anywhere. */
export const MCP_INSTRUCTIONS = [
  "This server is a team's shared task queue.",
  "",
  "DOING WORK (any member):",
  "1. Call next_task. It claims the next free task (or one row of a task) for you and returns what to do. If it returns nothing, stop.",
  "2. (To pick a specific one instead: call list_work, then claim it. If claim says taken or done, choose another.)",
  "3. Do what the prompt says, for the item it names if there is one. Never work on something you have not claimed.",
  "4. On long work, call heartbeat at least every 30 minutes.",
  "5. Finish with complete (a short summary, and details: what you did, where the result is, anything a human should know), fail (reason), or skip (reason).",
  "6. Repeat from step 1 until next_task returns nothing.",
  "",
  "SETTING UP WORK (team leads; members can read everything):",
  "- When the user describes work in plain words, turn it into tasks. A task is a title and a prompt: free text saying what to do and where the result goes.",
  "- A routine is a task with repeatDays (7 = weekly). Rows are the things to do it for (clients, sites, files): the same prompt runs once per row, and each row is claimed separately.",
  "- Call list_members and list_tasks first. Assign people by name; no assignees means anyone may take it. Then create_task, or view_task and update_task to change one.",
  "- Confirm with the user before delete_task, remove_member, or removing rows.",
  "- get_policy / set_policy: rules placed before every prompt. invite_member (one-time join link) / set_member_role / remove_member manage the team. board and list_logs show who did what.",
].join("\n");

/** The one line pasted into a Claude scheduled task. */
export const SETUP_PROMPT = `Use the "commons" MCP connector and work through our team's task queue.`;
