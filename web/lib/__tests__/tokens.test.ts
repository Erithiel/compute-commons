import { it, expect } from "vitest";
import { hashToken, newTokenString } from "../tokens";

it("creates prefixed tokens and stable hashes", () => {
  const t = newTokenString();
  expect(t.startsWith("cc_")).toBe(true);
  expect(hashToken(t)).toBe(hashToken(t));
  expect(hashToken(t)).not.toBe(t);
});
