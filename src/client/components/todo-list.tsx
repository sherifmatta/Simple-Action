"use client";

// The list region (epics.md Story 2.4; Story 2.5 AC5, AC9, AC10 and AC11;
// epic-2-context
// "The list region is a persistent element ... so skeletons have something to
// mount into and the swap costs no layout shift").
//
// Story 2.3 left an empty element here and named the stories that fill it.
// Story 2.4 was the first of them, and it is what finally gave `useTodos()` a
// caller: until then the hook Story 2.2 built had none, so the server's list
// reached the browser and stopped there. Story 2.5 is the second, and it
// takes back the one thing 2.4 got wrong — the guard that returned `null`
// removed the region from the DOM in exactly the two states that most need
// something to render into, which `deferred-work.md` recorded at the time.
// The `<ul>` is unconditional now; only its contents resolve.
//
// The order those contents resolve in is the whole of this component:
//
//   in flight  -> three skeleton rows, in the Active row's geometry
//   resolved   -> one row per Todo, or the empty state when there are none
//   otherwise  -> nothing, and the region is still here
//
// "Otherwise" is a failed read, and rendering nothing is deliberate rather
// than unfinished. A failure leaves the list's contents *unknown* rather than
// known-empty, so it may show neither skeletons nor an empty state
// (epic-2-context: "A load failure is not an empty list").
//
// Note what this component does *not* import to make that true: there is no
// error type here and nothing tests one. A failed read leaves `data`
// undefined, so gating the empty state on `data` being defined excludes the
// failure case with no condition that mentions it — Story 2.6's AC4 and AC15
// hold because no code path exists that could break them. AC14's "no flash of
// the empty state on the way to content" falls out of the same fact: during
// loading `data` is undefined too, so there is no frame it could appear in.
//
// What the region owes a failed read is what it does above: stay in the DOM
// and show nothing. The banner that reports the failure is not here — see the
// note at the `<ul>` below.
//
// The three states above are no longer exclusive, which is Story 3.3's whole
// change here. A Todo added while the list is still loading is on screen
// immediately and the skeletons keep pulsing beneath it (AC6), so the `<ul>`
// renders its rows *and then* its skeletons rather than choosing between
// them. The optimistic row does not pulse, because it is real.
//
// `loading` is keyed on `listLanded` — "a Todo List from the server is what
// the cache holds" — which `use-todos.ts` derives from `fetchStatus` and
// explains at length. What it replaced was a test on `data` being absent, and
// the replacement was forced: writing an optimistic row into the cache makes
// `data` defined, so the old key said the load had finished the instant the
// user pressed Enter. `deferred-work.md` recorded the need for a key not
// derived from cache contents; this is it.
//
// Story 2.6 AC5 falls out of the same pair rather than needing a disjunct of
// its own: `Retry` re-runs a read, so a read is in flight and no list has
// landed, and the region owes that read its skeletons. A failure that is
// *not* being retried shows nothing at all — nothing in flight, so nothing
// pulsing — because a failure leaves the list unknown rather than
// known-empty. And a Todo typed into a list that failed to load shows as a
// row with the banner still above it, which is what EXPERIENCE.md asks for
// and what keying this on the query would have got wrong: an optimistic
// write makes the query look successful.
//
// The client boundary is here rather than on the card or the row. `TodoCard`
// stays a Server Component — it holds no state and reads nothing — and
// `TodoRow`, `SkeletonRow` and the motion module need no directive of their
// own, because a module imported from a Client Component is already in the
// client graph ("You only need to add it to the files whose components you
// want to render directly within Server Components", Next.js `use client`
// reference). One directive, at the one place the tree actually crosses over.
//
// `gap-row-gap` is DESIGN.md's `{spacing.row-gap}`, whose definition is the
// gap between Todo rows. Story 2.3 declined to use it for the gap between the
// card's regions on the grounds that choosing one there would be inventing a
// design value; here it is the value's own job. The `<ul>` needs no list
// reset — Tailwind's preflight already strips the marker, margin and padding.

import { useCallback, useEffect } from "react";

import { useReducedMotion } from "@/client/motion/motion";
import type { Todo } from "@/shared/contract/todo";
import { matchesFilterView } from "@/client/todos/filter-view";
import { useFilterView } from "@/client/todos/filter-view-context";
import { useSetCompleted } from "@/client/todos/use-set-completed";
import { useTodos } from "@/client/todos/use-todos";

import { EmptyState } from "./empty-state";
import { SKELETON_ROW_KEYS, SkeletonRow } from "./skeleton-row";
import { TodoRow } from "./todo-row";

export function TodoList() {
  const { isFetching, data, listLanded } = useTodos();
  const loading = isFetching && !listLanded;
  // One hook instance for the whole list, passed down to every row — the
  // `add-todo.tsx` split applied one level up. `useSetCompleted` needs a
  // `QueryClientProvider` and an `AnnouncerProvider` above it, and calling it
  // inside `TodoRow` would make every test of the row's markup mount two
  // providers to exercise neither. `TodoRow` stays presentational and knows
  // only that something happens when its checkbox is pressed.
  //
  // The Filter View, its departures, and the one call that joins them. The
  // list reads Completion Status through `matchesFilterView` rather than
  // directly — `todo-list.test.ts` keeps this file free of it, and the
  // predicate, the three counts and the departure rule are one rule that
  // belongs in one module.
  const {
    view,
    isDeparting,
    noteToggle,
    releaseDepartures,
    cancelDepartures,
    endDeparture,
  } = useFilterView();

  // A refused toggle undoes the change a departure is leaving over, and this
  // is the only place that learns of it: the rollback is a cache write, and
  // polling the cache for it cannot work because `onMutate` is async — there
  // is always a commit where the row is marked departing and the optimistic
  // write has not landed. Without this the row finishes collapsing, announces
  // a removal that never happened, and pops back at full height.
  const setCompleted = useSetCompleted(
    useCallback((todo: Todo) => cancelDepartures([todo.id]), [cancelDepartures]),
  );
  // One attribute, set from the product's only reader of the preference; the
  // recipes in `app/globals.css` derive the stillness from it (AR-28). No
  // component branches on a duration and no `className` here is computed.
  const still = useReducedMotion();

  // A departing row no longer matches the view — that is what makes it depart
  // — so it is kept by name until its transition reports that it has finished.
  // Without this the row would be filtered out in the same commit that marked
  // it leaving, and there would be nothing on screen to leave.
  const visible = data?.filter(
    (todo) => matchesFilterView(todo, view) || isDeparting(todo.id),
  );

  // A departure is a row that stopped matching the view, so a row that matches
  // again is not departing — whoever made it match. A toggle back is the
  // obvious case and the Filter View handles that itself; the one it cannot
  // see is a *refused* toggle, where Story 4.2's rollback restores the status
  // in the cache and deliberately says nothing to anybody. Without this the
  // row would finish collapsing, announce a removal that never happened, and
  // then pop back at full height.
  //
  // A departing row that has left the cache entirely is released for the same
  // reason: it will never render again, so no `transitionend` is coming for it.
  // Joined into a string so the effect below has a statically checkable
  // dependency: the array's identity changes on every render and its contents
  // almost never do.
  const departing = (data ?? [])
    .filter((todo) => isDeparting(todo.id))
    .map((todo) => todo.id)
    .join(" ");

  useEffect(() => {
    // A preference that flipped to `reduce` mid-departure takes the transition
    // away from rows already leaving, so nothing will ever report them
    // finished. They get the end state now, announcement included — which is
    // what AC16 asks for when the preference was set to begin with.
    if (still && departing !== "") releaseDepartures(departing.split(" "));
  }, [still, releaseDepartures, departing]);

  // The Filter View is told before the cache is written, so the marker and the
  // optimistic status land in one commit: the row holds in its *new* status,
  // which is the whole point of the hold. Both calls take the status the user
  // asked for rather than a toggle instruction (AD-6).
  const toggle = (todo: Todo, completed: boolean) => {
    noteToggle(todo, completed);
    setCompleted(todo, completed);
  };

  return (
    <>
      {/*
        The error banner is deliberately not here: DESIGN.md fixes the order
        as add input → error banner region → filter tabs → list, and
        `sticky-top-block.tsx` holds slot 2 for it. A banner inside a `<ul>`
        would also be invalid content.

        `aria-busy` and the region's name are what make the three states
        distinguishable without sight. Without them a screen-reader user
        cannot tell a list that is still loading from one that resolved to
        nothing — the skeletons are `aria-hidden` and carry no text, so both
        read as an empty list. Story 2.5 deferred this here, as the story that
        owns what the region announces.
      */}
      <ul
        aria-busy={loading ? true : undefined}
        aria-label="Todo List"
        data-still={still ? true : undefined}
        className="flex flex-col gap-row-gap"
      >
        {visible?.map((todo) => (
          <TodoRow
            key={todo.id}
            todo={todo}
            departing={isDeparting(todo.id)}
            onToggle={toggle}
            onDeparted={endDeparture}
          />
        ))}
        {loading
          ? SKELETON_ROW_KEYS.map((key) => <SkeletonRow key={key} />)
          : null}
      </ul>
      {/*
        A sibling of the region rather than a child of it, and a fragment
        rather than a wrapper. The panel is a `<div>`, which is not valid
        inside a `<ul>`; wrapping both in an element instead would put
        something between the card and the region, which `todo-card.test.ts`
        and the mount test both assert is not there.

        Gated on `listLanded` rather than on `data` being defined, for the
        same reason the skeletons are: an optimistic row makes `data` defined
        during the load, and a list that has not arrived is not an empty one.

        The variant is the live Filter View, which is what makes the Active
        and Completed panels reachable for the first time (AC10). Emptiness is
        the *filtered* list's, not the whole list's: a list with four Completed
        Todos and no Active one is empty in the Active view and says so.
      */}
      {listLanded && visible?.length === 0 ? <EmptyState variant={view} /> : null}
    </>
  );
}
