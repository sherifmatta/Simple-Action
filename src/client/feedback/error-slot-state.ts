// The single error slot, as pure values (AD-9, epics.md Story 1.7 AC4).
//
// `error-slot.tsx` owns the React wiring; the transition itself lives here so
// it can be proved under `environment: "node"` (vitest.config.mts:30) without
// a DOM.

import type { ErrorKind } from "@/shared/contract/errors";

/**
 * One failure the user can see and act on.
 *
 * `kind` comes from the shared contract — the same four kinds the error
 * envelope carries (AD-10), so a response body classifies itself into this
 * slot with no translation table in between.
 *
 * `retry` is supplied by the failing operation and captures exactly that
 * operation and its arguments. That closure is the whole mechanism behind
 * EXPERIENCE.md's four distinct Retry behaviours: "if the row was since
 * deleted, Retry does nothing and the banner clears" is a property of what the
 * closure does, not a special case anyone writes here.
 */
export type ErrorSlotEntry = {
  kind: ErrorKind;
  retry: () => void;
};

/** The slot holds one entry or nothing. There is never a second slot (AD-9). */
export type ErrorSlot = ErrorSlotEntry | null;

/** No error showing. */
export const EMPTY_ERROR_SLOT: ErrorSlot = null;

export type ErrorSlotAction =
  { type: "raise"; error: ErrorSlotEntry } | { type: "clear" };

/**
 * The slot's only transitions.
 *
 * `raise` returns the new entry and does nothing whatsoever with the one it
 * displaces. That is AC4's "setting a new error replaces any existing one
 * without retrying the replaced operation" — true by construction rather than
 * by a rule someone has to remember, because this function never reads
 * `slot.retry` and has no way to invoke it.
 *
 * Retrying is deliberately *not* an action here. Invoking a caller-supplied
 * closure is a side effect, and React invokes reducers twice under Strict Mode
 * in development; a `retry` case would re-attempt the failed operation twice
 * per click. `error-slot.tsx` calls the closure outside the reducer and then
 * dispatches `clear`.
 */
export function errorSlotReducer(
  slot: ErrorSlot,
  action: ErrorSlotAction,
): ErrorSlot {
  switch (action.type) {
    case "raise":
      return action.error;
    case "clear":
      return EMPTY_ERROR_SLOT;
  }
}
