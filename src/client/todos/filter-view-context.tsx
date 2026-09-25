"use client";

// The one owner of the Filter View, and of the one row that is on its way out
// (epics.md Story 4.3; EXPERIENCE.md:161, 181, 225).
//
// Two components share this state — the tabs, inside `sticky-top-block.tsx`,
// and the list — so it has exactly one owner and they both read it. The
// provider is mounted in `todo-card.tsx`, their nearest common ancestor, and
// not in `providers.tsx`: the shell holds infrastructure (the query cache, the
// error slot, the announcer) and a Filter View is not infrastructure. A context
// provider renders no DOM element, so mounting it there leaves the card's DOM —
// and therefore the sticky block's positioning context — byte-identical.
//
// The selection is React state and never a query key (AD-8). Switching views
// issues no request, has no loading state and cannot fail, which is
// EXPERIENCE.md:181 exactly; `use-todos.test.ts` lists `useState<FilterView>`
// as an allowed holder for precisely this reason.
//
// Nothing is persisted and nothing is read from the URL. A fresh mount is
// always All (AC9) — the view is a way of looking at the list for a moment, not
// a setting, and a product with one screen has nowhere to put a setting.
//
// --- The departure -----------------------------------------------------------
//
// A toggle that makes a Todo stop matching the active view starts a departure:
// the row stays mounted in its *new* Completion Status, holds, then fades and
// collapses, and is removed when its transition reports completion. The hold and
// the collapse are one CSS transition in `@utility row-departing`, whose
// `transition-delay` *is* the hold — no timer is scheduled here or anywhere
// (`motion.test.ts` bans `setTimeout` and `setInterval` across `app/` and
// `src/client/`), and the row is removed because its departure *finished*
// rather than because a duration elapsed somewhere else.
//
// Under reduced motion the row never joins the departing set at all, rather
// than joining it with the animation zeroed. With `animation: none` no
// `transitionend` event fires, so a row parked there would never leave —
// and EXPERIENCE.md:225 asks for the end state immediately, which is the same
// thing as never entering. The announcement still fires, so the information the
// motion carried is not lost.
//
// Story 5.3 adds the second kind of departure and no second mechanism. A
// confirmed delete runs the same fade-and-collapse without the departure's
// hold (EXPERIENCE.md:161), so it joins the same set, sets the same kind of
// marker and is released by the same `transitionend` — it simply carries no
// announcement of its own, because what a delete announces is `${text},
// deleted` and that belongs to the moment the *server* agrees, not to the
// moment the row finishes collapsing.
//
// Several rows may be departing at once, and the set is keyed by id. A single
// slot would be the smaller thing to write and would drop an announcement the
// moment someone toggled twice inside one departure — Tab, Space, Tab, Space does it
// comfortably, and the second toggle would evict the first row mid-animation,
// which makes it vanish abruptly and never say that it left. AC15 is that a
// departure announces; nothing in it says only one departure may be in flight.

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import type { ReactNode } from "react";

import { useAnnounce } from "@/client/feedback/announcer";
import { useReducedMotion } from "@/client/motion/motion";
import type { Todo } from "@/shared/contract/todo";

import {
  departsOnToggle,
  departureAnnouncement,
  type FilterView,
} from "./filter-view";

/**
 * The row on its way out, and why.
 *
 * A `toggle` departure carries the sentence it will say when it gets there. The
 * announcement is built when the departure starts and spoken when it ends,
 * because by then the row is gone from the list and its text is gone with it.
 * Holding the string rather than the `Todo` also keeps this out of the AD-8
 * scan's way — nothing here is server state, and a shape that named `Todo`
 * would look exactly like the thing that rule forbids.
 *
 * A `delete` departure (Story 5.3) carries no sentence at all, and the
 * discriminant is what makes that a stated fact rather than an empty string
 * somebody has to remember not to speak. A confirmed delete *is* announced —
 * politely, as `${text}, deleted` — but from `use-delete-todo.ts`'s `onSuccess`,
 * where the server has actually agreed. Saying it here would announce a removal
 * at the moment the collapse ended, which is before the request has even left.
 */
type Departure =
  | { id: string; kind: "toggle"; announcement: string }
  | { id: string; kind: "delete" };

export type FilterViewControl = {
  /** The view the list is showing. `all` on every fresh mount. */
  view: FilterView;
  /** Show a view. Cancels any departure in flight — it belongs to the old view. */
  select: (view: FilterView) => void;
  /** Show All. What a successful add does, so the new Todo is visible (AC7). */
  showAll: () => void;
  /** Whether this row is on its way out of the view. */
  isDeparting: (id: string) => boolean;
  /** Tell the Filter View that a row was toggled, before the cache is written. */
  noteToggle: (todo: Todo, completed: boolean) => void;
  /**
   * Start a confirmed delete's collapse (Story 5.3 AC1-AC3).
   *
   * The row is not removed here and this module never touches the cache — the
   * row keeps rendering, marked, so it has something to leave with, and
   * `todo-list.tsx` removes it when its transition reports that it has
   * finished. That order is forced: the cache is the only thing the rendered
   * list is derived from, so a row removed on the click would unmount in the
   * same commit and could animate nothing.
   *
   * Returns nothing and records nothing under reduced motion, exactly as
   * `noteToggle` does and for the same reason — with `transition: none` no
   * `transitionend` ever fires, so a row parked in the set would never leave.
   * `isDeleting` then stays `false` and the caller cuts to the end state.
   */
  noteDelete: (id: string) => void;
  /** Whether this row is collapsing on its way to being deleted. */
  isDeleting: (id: string) => boolean;
  /**
   * Let these rows go now, announcing each: the end state, without the motion.
   *
   * What a preference flipping to `reduce` mid-departure needs. The stylesheet
   * takes the transition away the moment the list region's marker changes, so
   * no `transitionend` is coming for a row already in the set and it would sit
   * there, rendered but unmatched, for the rest of the session.
   */
  releaseDepartures: (ids: readonly string[]) => void;
  /**
   * Stop these rows leaving — they belong in the view again, or are gone.
   *
   * A departure is a row that stopped matching the view. Anything that makes it
   * match again ends the departure, and a toggle back is only one such thing:
   * a refused toggle rolls the status back in the cache and no user gesture is
   * involved at all. The list reconciles this against the cache on every
   * commit, because the cache is the only place that knows.
   */
  cancelDepartures: (ids: readonly string[]) => void;
  /** The departing row's animation finished; announce it and let it go. */
  endDeparture: (id: string) => void;
};

const FilterViewContext = createContext<FilterViewControl | null>(null);

/**
 * The Filter View and everything that changes it.
 *
 * Throws outside the provider rather than returning a default, which is
 * `useAnnounce()`'s convention (announcer.tsx:40): a component that silently
 * read `all` forever would render the right thing on the first paint and the
 * wrong thing after every interaction, which is the class of bug no test and no
 * reviewer sees.
 */
export function useFilterView(): FilterViewControl {
  const control = useContext(FilterViewContext);
  if (control === null) {
    throw new Error(
      "useFilterView() was called outside <FilterViewProvider>. The provider is mounted once, on the card — see src/client/components/todo-card.tsx.",
    );
  }
  return control;
}

export function FilterViewProvider({ children }: { children: ReactNode }) {
  const [view, setView] = useState<FilterView>("all");
  const [departures, setDepartures] = useState<readonly Departure[]>([]);

  const announce = useAnnounce();
  // Read through the module, which is the product's only reader of the
  // preference (Story 2.5 AC2). Nothing here branches on a duration: the
  // decision is whether the row leaves now or leaves visibly, and the
  // stylesheet derives the rest from the marker the list already sets.
  const still = useReducedMotion();

  const select = useCallback((next: FilterView) => {
    setView(next);
    // A toggle's departure is a row leaving a particular view. Change the view
    // and the premise is gone: each row either belongs to the new view or it
    // does not, and either way none of them should be mid-animation about the
    // old one.
    //
    // A delete's departure is not that. It is a row leaving the product, and
    // its collapse ends in a cache write that nothing else will make — so
    // cancelling one here would leave a confirmed Todo on screen, undeleted,
    // with no request ever sent. Changing the view while a row is collapsing
    // out is one tab press away, so this is a reachable state rather than a
    // theoretical one.
    setDepartures((current) =>
      current.filter((departure) => departure.kind === "delete"),
    );
  }, []);

  const showAll = useCallback(() => select("all"), [select]);

  const noteToggle = useCallback(
    (todo: Todo, completed: boolean) => {
      if (!departsOnToggle(todo, completed, view)) {
        // Toggled back before it finished leaving: the row matches again, so
        // its departure is cancelled and it stays where it is. Scoped to this
        // row's own id, so a toggle elsewhere cannot cancel someone else's.
        //
        // A *delete's* departure is exempt, exactly as it is in `select` above
        // and for the same reason: it is not a row leaving a view, it is a row
        // leaving the product, and its collapse ends in a cache write nothing
        // else will make. Toggling a row inside its own delete collapse would
        // otherwise leave it on screen at full height, confirmed, undeleted,
        // with no request ever sent.
        setDepartures((current) =>
          current.some(
            (departure) =>
              departure.id === todo.id && departure.kind === "toggle",
          )
            ? current.filter(
                (departure) =>
                  departure.id !== todo.id || departure.kind === "delete",
              )
            : current,
        );
        return;
      }

      const announcement = departureAnnouncement(todo.text, view);
      if (still) {
        // The end state, in this commit: the row is not marked departing, so
        // the cache write that follows simply filters it out. The announcement
        // is what survives, because it is the information rather than the
        // motion (EXPERIENCE.md:225).
        announce(announcement, "polite");
        return;
      }

      // Replace rather than append when the row is already leaving, so a
      // toggle that re-states a departure cannot queue a second announcement
      // for one row.
      setDepartures((current) => [
        ...current.filter((departure) => departure.id !== todo.id),
        { id: todo.id, kind: "toggle", announcement },
      ]);
    },
    [announce, still, view],
  );

  const noteDelete = useCallback(
    (id: string) => {
      // The end state, in this commit: nothing is marked, so `isDeleting` is
      // `false` and the caller removes the row and sends the request at once
      // (AC3). Nothing waits on a `transitionend` that will never fire.
      if (still) return;

      // Replace rather than append, for `noteToggle`'s reason: a row already
      // leaving — because a toggle took it out of the view — is now leaving for
      // good, and the delete's collapse is the one that should run. It is also
      // what stops one id appearing twice in the set.
      setDepartures((current) => [
        ...current.filter((departure) => departure.id !== id),
        { id, kind: "delete" },
      ]);
    },
    [still],
  );

  const cancelDepartures = useCallback((ids: readonly string[]) => {
    if (ids.length === 0) return;
    // Deletes are exempt here too, and this is the third and last writer that
    // has to say so. The one caller is a *refused toggle* (`todo-list.tsx`),
    // which undoes the status a departure was leaving over — it says nothing
    // about a delete confirmed for the same row, and cancelling one would
    // strand that row on screen with no request ever sent.
    setDepartures((current) =>
      current.some(
        (departure) =>
          ids.includes(departure.id) && departure.kind === "toggle",
      )
        ? current.filter(
            (departure) =>
              !ids.includes(departure.id) || departure.kind === "delete",
          )
        : current,
    );
  }, []);

  const releaseDepartures = useCallback(
    (ids: readonly string[]) => {
      if (ids.length === 0) return;
      setDepartures((current) => {
        for (const departure of current) {
          // A delete has nothing to say here — its announcement belongs to the
          // mutation's success, where the server has actually agreed.
          if (ids.includes(departure.id) && departure.kind === "toggle") {
            announce(departure.announcement, "polite");
          }
        }
        return current.filter((departure) => !ids.includes(departure.id));
      });
    },
    [announce],
  );

  const endDeparture = useCallback(
    (id: string) => {
      // Only a row that is actually leaving, and only once. `transitionend`
      // bubbles, so a descendant animating at the wrong moment would otherwise
      // announce a departure that had already been announced — and AC15 is
      // that `announce` is called exactly once.
      const leaving = departures.find((departure) => departure.id === id);
      if (leaving === undefined) return;
      // A delete says nothing here: the row has only finished collapsing, and
      // the request that will actually remove it has not been answered yet.
      // `use-delete-todo.ts`'s `onSuccess` is what announces it (Story 5.3 AC5).
      if (leaving.kind === "toggle") announce(leaving.announcement, "polite");
      // The updater form, and it has to be: two rows finishing in the same
      // tick would otherwise each filter the array they captured, and the
      // second write would put the first row back.
      setDepartures((current) =>
        current.filter((departure) => departure.id !== id),
      );
    },
    [announce, departures],
  );

  const control = useMemo<FilterViewControl>(
    () => ({
      view,
      select,
      showAll,
      isDeparting: (id: string) =>
        departures.some((departure) => departure.id === id),
      noteToggle,
      noteDelete,
      isDeleting: (id: string) =>
        departures.some(
          (departure) => departure.id === id && departure.kind === "delete",
        ),
      releaseDepartures,
      cancelDepartures,
      endDeparture,
    }),
    [
      view,
      select,
      showAll,
      departures,
      noteToggle,
      noteDelete,
      releaseDepartures,
      cancelDepartures,
      endDeparture,
    ],
  );

  // React 19 renders the context itself as the provider; `Context.Provider` is
  // the deprecated spelling (`announcer.tsx` does the same).
  return (
    <FilterViewContext value={control}>{children}</FilterViewContext>
  );
}
