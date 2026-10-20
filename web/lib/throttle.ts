// Login throttle (D28): 5 attempts per email per fixed 15-minute window, counted BEFORE the password check.
// API-key calls skip Appwrite's rate limits, so we count here. No next/* imports, so scripts/race-test.ts can call it.
// Atomic like the claim locks: an attempt takes the first free slot row (ids attemptKey(email, window, 1..5));
// createRow on an existing id fails with 409, so a parallel burst gets exactly 5 slots.
// (incrementRowColumn with max=5 was tried first: on 1.8.1 it caps the stored value but can report success
// for a 6th parallel call, so it does not tell the caller whether it may proceed.)
import { Query } from "node-appwrite";
import { adminTables, DB_ID, isCode, T } from "./appwrite";
import { attemptKey, LOGIN_MAX_FAILS, LOGIN_WINDOW_MS, loginWindow } from "./team-rules";

const slots = Array.from({ length: LOGIN_MAX_FAILS }, (_, i) => i + 1);

/** Counts one attempt. True if it may proceed, false once this email used its 5 attempts in this window. */
export async function registerAttempt(email: string, now = new Date()): Promise<boolean> {
  const windowStart = new Date(loginWindow(now) * LOGIN_WINDOW_MS).toISOString();
  for (const slot of slots) {
    try {
      await adminTables().createRow(DB_ID, T.loginAttempts, attemptKey(email, now, slot), { fails: slot, windowStart });
      return true;
    } catch (e) {
      if (!isCode(e, 409)) throw e;
    }
  }
  return false;
}

/** Forgets this email's attempts in the current window (after a successful login), and up to 100 rows of ended windows. */
export async function clearAttempts(email: string, now = new Date()) {
  const windowStart = new Date(loginWindow(now) * LOGIN_WINDOW_MS).toISOString();
  const { rows } = await adminTables().listRows(DB_ID, T.loginAttempts, [Query.lessThan("windowStart", windowStart), Query.limit(100)]);
  const ids = [...slots.map((slot) => attemptKey(email, now, slot)), ...rows.map((r) => r.$id)];
  await Promise.all(ids.map((id) => adminTables().deleteRow(DB_ID, T.loginAttempts, id).catch((e) => {
    if (!isCode(e, 404)) throw e;
  })));
}
