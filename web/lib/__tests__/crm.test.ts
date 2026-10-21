import { afterEach, describe, expect, it, vi } from "vitest";

const rati = { id: "u1", name: "Rati", email: "rati@rando.ge" };
const nino = { id: "u2", name: "Nino", email: "nino@rando.ge" };

async function load(lists: Array<typeof rati[]>) {
  vi.resetModules();
  Object.assign(process.env, { CRM_URL: "https://crm.test", RELAY_API_KEY: "k", CRM_SUPABASE_URL: "x", CRM_SUPABASE_KEY: "x" });
  const fetch = vi.fn(async () => new Response(JSON.stringify({ users: lists.shift() ?? [] })));
  vi.stubGlobal("fetch", fetch);
  return { ...(await import("../crm")), fetch };
}
afterEach(() => vi.unstubAllGlobals());

describe("approvedUser", () => {
  it("lets in approved users and sends the bridge key", async () => {
    const { approvedUser, fetch } = await load([[rati]]);
    expect(await approvedUser("u1", 0)).toEqual(rati);
    expect(fetch).toHaveBeenCalledWith("https://crm.test/api/bridge/relay/approved", expect.objectContaining({ headers: { "x-api-key": "k" } }));
  });

  it("serves hits from the cache for 5 minutes, then refetches (unapproved → out)", async () => {
    const { approvedUser, fetch } = await load([[rati], []]);
    await approvedUser("u1", 0);
    expect(await approvedUser("u1", 299_999)).toEqual(rati);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(await approvedUser("u1", 300_000)).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("a miss refetches at once, so a newly approved person gets in", async () => {
    const { approvedUser } = await load([[rati], [rati, nino]]);
    await approvedUser("u1", 0);
    expect(await approvedUser("u2", 1)).toEqual(nino);
  });

  it("refuses when the CRM is down instead of letting anyone in", async () => {
    const { approvedUser } = await load([]);
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 500 })));
    await expect(approvedUser("u1", 0)).rejects.toThrow(/HTTP 500/);
  });

  it("test users work only outside production", async () => {
    const { approvedUser } = await load([[]]);
    process.env.RELAY_TEST_USERS = "smoke-lead";
    expect(await approvedUser("smoke-lead", 0)).toMatchObject({ id: "smoke-lead" });
    vi.stubEnv("NODE_ENV", "production");
    expect(await approvedUser("smoke-lead", 0)).toBeNull();
    vi.unstubAllEnvs();
    delete process.env.RELAY_TEST_USERS;
  });
});
