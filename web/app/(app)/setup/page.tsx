import { requireMember } from "@/lib/auth";
import { MCP_INSTRUCTIONS, SETUP_PROMPT } from "@/lib/mock";
import { CopyButton, TokenForm } from "@/components/client";
import { Card, PageHeader, link } from "@/components/ui";

const APP_URL = "https://commons.example"; // ponytail: replace with the deployed URL (F0 step 11)

// One-time setup: connect Claude to our MCP server. After this, Claude fetches tasks by itself.
export default async function SetupPage() {
  const me = await requireMember();

  return (
    <>
      <PageHeader title="Connect Claude" sub="Do this once. After that, your Claude schedule fetches tasks from here on every run." />
      <ol className="space-y-6">
        <li>
          <Card title="1 · Create a token">
            <p className="mb-3 text-sm text-muted">
              The token says who you are, so the work is logged under your name and uses your own Claude limit.
              Pick <b>schedule</b> for a Claude scheduled task (its work is logged as &quot;{me.name} · scheduled&quot;)
              or <b>own sessions</b> for working in Claude Code yourself. It is shown once.
            </p>
            <TokenForm appUrl={APP_URL} />
          </Card>
        </li>

        <li>
          <Card title="2 · Add the connector in Claude">
            <ol className="list-decimal space-y-2 pl-5 text-sm">
              <li>In Claude, open <b>Settings → Connectors</b> and add a custom connector.</li>
              <li>Name it <code className="rounded bg-hover px-1">commons</code> and use this URL:
                <div className="mt-1 flex items-center gap-2">
                  <code className="rounded bg-hover px-2 py-1 font-mono text-xs">{APP_URL}/api/mcp</code>
                  <CopyButton text={`${APP_URL}/api/mcp`} />
                </div>
              </li>
              <li>Under request headers, add <code className="rounded bg-hover px-1">Authorization</code> = <code className="rounded bg-hover px-1">Bearer &lt;your token&gt;</code>.</li>
            </ol>
            <p className="mt-3 text-xs text-muted">
              Request headers are a beta in Claude and not every organization has them yet (TECH.md §6). If you don&apos;t see them, tell the lead.
              For your own Claude Code on a laptop, the command shown in step 1 does the same thing.
            </p>
          </Card>
        </li>

        <li>
          <Card title="3 · Create the Claude schedule" actions={<CopyButton text={SETUP_PROMPT} label="Copy prompt" />}>
            <pre className="whitespace-pre-wrap rounded-md bg-hover p-3 font-mono text-xs">{SETUP_PROMPT}</pre>
            <p className="mt-2 text-sm text-muted">
              Create a scheduled task in Claude, paste this as its prompt, pick the time, and enable the <b>commons</b> connector for it.
              That&apos;s all it needs: the tasks, and how to work on them, come from this app on every run.
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
              Run the schedule once by hand. On the <a href="/board" className={link}>Board</a> an item should go to
              <b> in progress</b>, then <b>done</b>, and a new entry appears in <a href="/logs" className={link}>Logs</a> with what was done.
              Two runs never take the same item: Claude must claim it first, and a second claim is refused.
            </p>
          </Card>
        </li>
      </ol>
    </>
  );
}
