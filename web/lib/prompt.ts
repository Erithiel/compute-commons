/** What Claude receives: team policy, task prompt, the caller's own note on this task, then the row it claimed (if any). */
export const buildPrompt = (policy: string, prompt: string, note = "", item = "") =>
  [policy, prompt, note && `My notes for this task:\n${note}`, item && `Item: ${item}`].filter((p) => p.trim()).join("\n\n---\n\n");
