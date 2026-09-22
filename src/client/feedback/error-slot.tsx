"use client";

// The application's one error slot (AD-9, epics.md Story 1.7 AC4).
//
// The transition lives in `error-slot-state.ts`; this file is the React
// wiring and the `"use client"` boundary context needs (Next.js `Server and
// Client Components` guide, §Context providers).
//
// Nothing here renders a banner. The banner is Epic 2's component; this story
// mounts the slot the banner will read, so that when it arrives there is
// somewhere for it to read from rather than a reason to invent per-mutation
// error state.

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useReducer,
} from "react";
import type { ReactNode } from "react";
import {
  EMPTY_ERROR_SLOT,
  errorSlotReducer,
  type ErrorSlot,
  type ErrorSlotEntry,
} from "./error-slot-state";

export type ErrorSlotContextValue = {
  /** The error currently showing, or `null` (AD-9). */
  error: ErrorSlot;
  /** Replaces whatever the slot held. The displaced operation is not retried. */
  raiseError: (error: ErrorSlotEntry) => void;
  /** Empties the slot without retrying. */
  clearError: () => void;
  /**
   * Invokes the current entry's closure and empties the slot.
   *
   * The slot is cleared whether or not the closure does anything, which is
   * what makes EXPERIENCE.md's "the row was since deleted, so Retry does
   * nothing and the banner clears" fall out of the closure rather than out of
   * a special case here.
   */
  retryCurrentError: () => void;
};

const ErrorSlotContext = createContext<ErrorSlotContextValue | null>(null);

export function useErrorSlot(): ErrorSlotContextValue {
  const value = useContext(ErrorSlotContext);
  if (value === null) {
    throw new Error(
      "useErrorSlot() was called outside <ErrorSlotProvider>. The provider is mounted once, at the root — see src/client/providers.tsx.",
    );
  }
  return value;
}

export function ErrorSlotProvider({ children }: { children: ReactNode }) {
  // AD-9 says "a single slot". A nested provider would give the subtree
  // beneath it a second, shadowing slot — two banners at once, which is the
  // exact failure the single slot exists to prevent.
  if (useContext(ErrorSlotContext) !== null) {
    throw new Error(
      "<ErrorSlotProvider> is already mounted above this one. It is mounted once, at the root — see src/client/providers.tsx. A second one would give this subtree its own error slot (AD-9).",
    );
  }

  const [error, dispatch] = useReducer(errorSlotReducer, EMPTY_ERROR_SLOT);

  const raiseError = useCallback((next: ErrorSlotEntry) => {
    dispatch({ type: "raise", error: next });
  }, []);

  const clearError = useCallback(() => {
    dispatch({ type: "clear" });
  }, []);

  // The closure is invoked here rather than inside the reducer: React
  // double-invokes reducers under Strict Mode in development, which would
  // re-attempt the failed operation twice per click.
  //
  // `clear` is dispatched *before* the closure runs, and the order is
  // load-bearing in both directions. If the closure throws, the slot is
  // already empty, so a failed retry cannot strand the banner on screen with
  // the exception escaping into the event handler. And if the closure
  // synchronously raises a *new* error — the ordinary case for a retry that
  // fails again — that `raise` lands after this `clear` rather than being
  // wiped by it, so the new error survives. AD-9's "invoking it is a no-op
  // that clears the slot" then holds unconditionally, not just on the happy
  // path.
  const retryCurrentError = useCallback(() => {
    const entry = error;
    dispatch({ type: "clear" });
    entry?.retry();
  }, [error]);

  const value = useMemo<ErrorSlotContextValue>(
    () => ({ error, raiseError, clearError, retryCurrentError }),
    [error, raiseError, clearError, retryCurrentError],
  );

  return <ErrorSlotContext value={value}>{children}</ErrorSlotContext>;
}
