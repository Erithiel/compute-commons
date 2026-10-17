import { it, expect } from "vitest";
import { buildPrompt } from "../prompt";

it("orders policy, prompt, note, row and skips empty parts", () => {
  expect(buildPrompt("P", "Do X")).toBe("P\n\n---\n\nDo X");
  expect(buildPrompt("", "Do X", "", "Acme")).toBe("Do X\n\n---\n\nItem: Acme");
  expect(buildPrompt("", "Do X", "Files in D:/x")).toBe("Do X\n\n---\n\nMy notes for this task:\nFiles in D:/x");
  expect(buildPrompt("P", "Do X", "N", "Acme")).toBe("P\n\n---\n\nDo X\n\n---\n\nMy notes for this task:\nN\n\n---\n\nItem: Acme");
});
