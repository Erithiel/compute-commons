import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // "server-only" throws outside Next's server bundle; tests are server code too.
  resolve: { alias: { "server-only": fileURLToPath(new URL("./lib/__tests__/empty.ts", import.meta.url)), "@": fileURLToPath(new URL(".", import.meta.url)) } },
  test: { include: ["lib/**/*.test.ts"] },
});
