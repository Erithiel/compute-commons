// Table ids and env constants. No "server-only" here so scripts/ and tests can import it.
export const DB_ID = process.env.APPWRITE_DATABASE_ID ?? "commons";
export const TEAM_ID = process.env.TEAM_ID ?? "rando";
export const T = {
  members: "members", tasks: "tasks", taskVersions: "task_versions", taskItems: "task_items", memberNotes: "member_notes",
  claims: "claims", takeovers: "claim_takeovers", logs: "logs", settings: "settings", apiTokens: "api_tokens", audit: "audit_log",
  teams: "teams", invites: "invites", loginAttempts: "login_attempts",
} as const;

export const DEFAULT_POLICY = `Rules for every task:
- Use no secrets and do not touch anything the task does not ask for.
- If the task is unclear or needs a human decision, stop and call fail with the reason.
- Finish by calling complete with a short summary and details (what you did, where the result is, anything a human should know).`;
