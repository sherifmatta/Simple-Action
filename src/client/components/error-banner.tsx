"use client";

// The one error banner, and the region that reserves its space (epics.md
// Story 2.6 AC2-AC9, AC18; AD-9, AD-10, AD-12; DESIGN.md:173-184, 424-428;
// EXPERIENCE.md:109, 117-124).
//
// The slot this reads was built by Story 1.7 and has been wired to nothing
// since: `error-slot-state.ts` already models all four kinds, already
// replaces without retrying what it displaces (AC7), and already clears
// whether or not the closure does anything (AC8). Nothing here re-models any
// of that. What this file adds is the two ends the slot was missing — a
// producer for the one failure Epic 2 can reach, and the only consumer the
// product will ever have.
//
// That is why it is one component rather than a banner plus a separate
// reporter. Epics 3 through 5 each raise their own entry from their own
// mutation, and every one of them arrives here already classified; the render,
// the `Retry` wiring and the announcement are written once against
// `{ kind, retry }` and never again per kind. The reporting effect below is
// the exception that proves it: it exists because a *query* has no `onError`
// to raise from, which a mutation does.
//
// The banner announces by calling `announce(message, "assertive")` and not by
// being a live region. `eslint.config.mjs:152-174` bans `role="alert"`,
// `role="status"`, `role="log"` and any declared `aria-live` everywhere but
// `announcer.tsx`, and names this banner as the reason the rule exists — the
// mockup (mockups/key-states.html:525) is `role="alert" aria-live="polite"`,
// which both duplicates the app's live regions and downgrades the urgency
// EXPERIENCE.md:212 requires.
//
// The region is `banner-region` whether or not it holds anything (AC2). What
// that reserves, and the one case where the reservation is not enough, is
// written where the value is, in `app/globals.css`.
//
// No entrance animation. EXPERIENCE.md bans "any animation on open", and
// `motion.test.ts:221-227` scans the markup surface for a `transition-`,
// `duration-`, `delay-` or `animate-` class to make sure nobody adds one.

import { useEffect } from "react";

import { useAnnounce } from "@/client/feedback/announcer";
import { ERROR_COPY, RETRY_LABEL } from "@/client/feedback/error-copy";
import { useErrorSlot } from "@/client/feedback/error-slot";
import { identityExpired } from "@/client/todos/todo-list-query";
import { useTodos } from "@/client/todos/use-todos";

export function ErrorBannerRegion() {
  const {
    error: slot,
    raiseError,
    clearError,
    retryCurrentError,
  } = useErrorSlot();
  // `readFailure`, not `error`. An optimistic write nulls `query.error`
  // (`use-todos.ts` says why), so a banner keyed on it would tear itself and
  // its `Retry` down the moment the user typed a Todo into a list that failed
  // to load — EXPERIENCE.md requires the opposite there.
  const { readFailure, isFetching, refetch } = useTodos();
  const announce = useAnnounce();

  // Keep the slot in step with the read (Story 2.6 AC3, AC5, AC6; Story 3.4
  // AC7).
  //
  // An effect rather than a handler because a query has nowhere else to
  // report from: TanStack v5 removed `onError` from `useQuery`, and
  // `providers.tsx:50-57` records why a cache-level `QueryCache.onError`
  // cannot do it either — the query client is mounted outside the slot, so a
  // global handler cannot reach this context.
  //
  // The closure captures the failure it was built for rather than reading
  // `readFailure` when it runs, so a `Retry` pressed after the query has
  // moved on still decides against the error the banner is actually
  // reporting. That is AD-9's "captures exactly the operation that failed and
  // its arguments", applied to a read whose only argument is which failure it
  // was.
  //
  // `slot` is a dependency, which Story 2.6 could not allow, and the two
  // guards below are what make that safe. An empty slot is the only state
  // this raises into, so the raise that fills it is also what stops the pass
  // it triggers — no ref recording what was last raised, which is what Story
  // 2.6 needed and what `deferred-work.md` recorded twice against this file.
  // Both entries are discharged by the pair:
  //
  //  - A failed add raises `create` over a load failure (AD-9), and the read
  //    is still failing. Nothing used to re-run when that add's banner was
  //    later cleared, so the user was left with no banner, no `Retry` and a
  //    list region whose contents are unknown. Emptying the slot now re-runs
  //    this effect, and the load failure — still true, and no longer being
  //    reported by anything — is raised again.
  //  - A background refetch succeeding used to clear the slot outright. It
  //    clears only a `load` entry now, so a failed add's banner survives a
  //    read that has nothing to say about it (EXPERIENCE.md:109, "of the
  //    same kind").
  //
  // `isFetching` is the second guard and it separates the two ways the slot
  // empties. `retryCurrentError` clears before it calls the closure, so a
  // `Retry` on *this* banner leaves exactly the state the paragraph above
  // raises into — an empty slot over a failing read — and without this the
  // banner the user just dismissed would be back in the same commit. The
  // difference is that a re-request is in flight: it is about to answer, and
  // the answer is what decides. A `create` retry starts no read, so that
  // path is untouched.
  useEffect(() => {
    if (readFailure !== null) {
      if (slot !== null || isFetching) return;
      raiseError({
        kind: readFailure.kind,
        retry: () => {
          // The one non-retryable failure (AC6). `middleware.ts` mints a
          // Client Identity on a document request and never under `app/api/`,
          // so a `401` means re-requesting yields `401` forever and `Retry`
          // is a dead button. A fresh document request is what mints.
          if (identityExpired(readFailure)) {
            window.location.reload();
            return;
          }
          void refetch();
        },
      });
      return;
    }

    // The read succeeded, so the banner reporting that it failed has to go —
    // "the banner clears when the retried operation succeeds"
    // (EXPERIENCE.md:109). `Retry` already clears the slot before it
    // refetches, so the path this covers is the one nothing else does: a
    // background refetch. `refetchOnWindowFocus` is left at its default of
    // true (todo-list-query.ts:180), so returning to the tab after a failure
    // resolves the list underneath a banner still saying it could not be
    // loaded — the empty state and "Couldn't load your Todos." on screen at
    // once.
    //
    // By kind, so a read that has nothing to say about a failed add does not
    // take the add's banner down with its own.
    clearError("load");
  }, [readFailure, slot, isFetching, raiseError, clearError, refetch]);

  // Announce whatever the slot currently holds, assertively (AC18).
  //
  // Keyed on the slot rather than on this story's read, so all four kinds
  // announce through one site — Epics 3 through 5 raise an entry and are
  // heard without writing an announcement of their own, for the same reason
  // AD-9 put the retry closure in the slot instead of in four call sites.
  //
  // Assertive because it "reports a failure the user did not cause and would
  // otherwise not know about" (EXPERIENCE.md:212). Everything else in this
  // product is polite.
  useEffect(() => {
    if (slot === null) return;
    announce(ERROR_COPY[slot.kind], "assertive");
  }, [slot, announce]);

  return (
    <div className="banner-region">
      {slot === null ? null : (
        <div className="flex items-center gap-4 rounded-md border border-danger-border bg-danger-bg p-4 text-danger-text">
          {/*
            The leading line icon. DESIGN.md:180 fixes its colour and nothing
            else, so the geometry and both paths are the mockup's, copied
            exactly (mockups/key-states.html:526) — SVG attributes rather than
            classes, the treatment `todo-row.tsx` and `empty-state.tsx` both
            use for a value that has no token to be added under.
          */}
          <svg
            aria-hidden="true"
            className="flex-none"
            width="17"
            height="17"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7.5v5" />
            <path d="M12 16.2h.01" />
          </svg>
          <span className="wrap-anywhere text-banner-message">
            {ERROR_COPY[slot.kind]}
          </span>
          {/*
            The only control in the region, and the only thing in it that is
            in the tab order (AC9). `retryCurrentError` clears the slot before
            invoking the closure, so a retry that fails again keeps its new
            entry rather than being wiped by its own predecessor's clear —
            that ordering is `error-slot.tsx:79-96`'s and is load-bearing in
            both directions.
          */}
          <button
            type="button"
            onClick={retryCurrentError}
            className="ml-auto flex min-h-touch-target-min flex-none items-center justify-center rounded-full border-danger-text px-4 text-button-label text-danger-text retry-pill"
          >
            {RETRY_LABEL}
          </button>
        </div>
      )}
    </div>
  );
}
