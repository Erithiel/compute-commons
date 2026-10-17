// Login throttle (D28): 5 attempts per email per fixed 15-minute window, counted BEFORE the password check.
// API-key calls skip Appwrite's rate limits, so we count here. No next/* imports, so scripts/race-test.ts can call it.
// Atomic like the claim locks: an attempt takes the first free slot row (ids attemptKey(email, window, 1..5));
// createRow on an existing id fails with 409, so a parallel burst gets exactly 5 slots.
// (incrementRowColumn with max=5 was tried first: on 1.8.1 it caps the stored value but can report success
// for a 6th parallel call, so it does not tell the caller whether it may proceed.)
import { adminTables, DB_ID, isCode, T } from "./appwrite";
import { attemptKey, LOGIN_MAX_FAILS, LOGIN_WINDOW_MS, loginWindow } from "./team-rules";

const slots = Array.from({ length: LOGIN_MAX_FAILS }, (_, i) => i + 1);

// ponytail: slot rows of failed windows stay until that email signs in again in the same window;
// add a sweep of rows with windowStart older than 15 minutes if the table grows.
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

/** Forgets this email's attempts in the current window (after a successful login). */
export async function clearAttempts(email: string, now = new Date()) {
  await Promise.all(slots.map((slot) => adminTables().deleteRow(DB_ID, T.loginAttempts, attemptKey(email, now, slot)).catch((e) => {
    if (!isCode(e, 404)) throw e;
  })));
}
