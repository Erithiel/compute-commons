/** What Claude receives: team policy, task prompt, the caller's own note on this task, then the row it claimed (if any). */
export const buildPrompt = (policy: string, prompt: string, note = "", item = "") =>
  [policy, prompt, note && `My notes for this task:\n${note}`, item && `Item:${item.includes("\n") ? "\n" : " "}${item}`]
    .filter((p) => p.trim()).join("\n\n---\n\n");

/** A claimed row as Claude reads it: "Column: value" lines when the task has several columns, else the row text. */
export function itemPrompt(item: { text: string; data?: string | null }) {
  try {
    const d = item.data ? (JSON.parse(item.data) as Record<string, string>) : null;
    if (d && Object.keys(d).length > 1) return Object.entries(d).filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join("\n");
  } catch {} // bad JSON: fall back to the text
  return item.text;
}
