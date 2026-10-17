import { requireMember } from "@/lib/auth";
import { MCP_INSTRUCTIONS, SETUP_PROMPT } from "@/lib/mock";
import { CopyButton, TokenForm } from "@/components/client";
import { Card, PageHeader, link } from "@/components/ui";

const APP_URL = process.env.APP_URL ?? "http://localhost:3000"; // the deployed URL in production

// One-time setup: connect Claude to our MCP server. After this, Claude fetches tasks by itself.
export default async function SetupPage() {
  await requireMember();

  return (
    <>
      <PageHeader title="Connect Claude" sub="Do this once. After that, your Claude schedule fetches tasks from here on every run." />
      <ol className="space-y-6">
        <li>
          <Card title="1 · Create a token">
            <p className="mb-3 text-sm text-muted">
              The token says who you are, so the work is logged under your name and uses your own Claude limit.
              One token works for your Claude Code sessions and your Claude schedules. It is shown once.
            </p>
            <TokenForm appUrl={APP_URL} />
          </Card>
        </li>

        <li>
          <Card title="2 · Add the connector to Claude Code">
            <ol className="list-decimal space-y-2 pl-5 text-sm">
              <li>Run the command from step 1 in a terminal on your computer (PowerShell is fine). It adds the <code className="rounded bg-hover px-1">commons</code> connector with your token, for every folder (<code className="rounded bg-hover px-1">--scope user</code>).</li>
              <li>Check it: <code className="rounded bg-hover px-1">claude mcp list</code> shows <code className="rounded bg-hover px-1">commons</code> as connected.</li>
            </ol>
            <p className="mt-3 text-xs text-muted">
              Lost the token? Revoke it in Settings and create a new one, then run the new command.
              Claude&apos;s web Settings → Connectors does not work for this yet: it needs a public https:// address and has no place for the token.
            </p>
          </Card>
        </li>

        <li>
          <Card title="3 · Create the Claude schedule" actions={<CopyButton text={SETUP_PROMPT} label="Copy prompt" />}>
            <pre className="whitespace-pre-wrap rounded-md bg-hover p-3 font-mono text-xs">{SETUP_PROMPT}</pre>
            <p className="mt-2 text-sm text-muted">In the Claude app, create a scheduled task, paste this as its prompt, then set:</p>
            <ol className="mt-2 list-decimal space-y-2 pl-5 text-sm">
              <li><b>Trigger:</b> Schedule, how often (e.g. Daily) and the time.</li>
              <li><b>Advanced settings → General → Require this computer:</b> on. The connector from step 2 lives on this computer, so the task must run here. It only runs while the computer is awake.</li>
              <li><b>Local folder:</b> the folder your tasks work in, if they need your files (e.g. your clients&apos; repos). Otherwise leave it at None. Your own note on a task can say where things are.</li>
              <li><b>Repository</b> and <b>Project:</b> leave at None.</li>
              <li><b>Connectors:</b> make sure <code className="rounded bg-hover px-1">commons</code> is on.</li>
            </ol>
            <p className="mt-3 text-sm text-muted">
              That&apos;s all it needs: how to work (until the queue is empty, each task in its own fresh subagent) and the tasks themselves come from this app on every run.
            </p>
            <details className="mt-3">
              <summary className={`cursor-pointer text-xs ${link}`}>What our server tells Claude when it connects</summary>
              <pre className="mt-2 whitespace-pre-wrap rounded-md bg-hover p-3 font-mono text-xs">{MCP_INSTRUCTIONS}</pre>
            </details>
          </Card>
        </li>

        <li>
          <Card title="4 · Check it works">
            <p className="text-sm text-muted">
              Run the schedule once by hand (open it in Claude and run it now). On the <a href="/board" className={link}>Board</a> an item should go to
              <b> in progress</b>, then <b>done</b>, and a new entry appears in <a href="/logs" className={link}>Logs</a> with what was done.
              Two runs never take the same item: Claude must claim it first, and a second claim is refused.
            </p>
          </Card>
        </li>
      </ol>
    </>
  );
}
