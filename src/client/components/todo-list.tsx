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

import { useCallback, useEffect, useState } from "react";

import { useReducedMotion } from "@/client/motion/motion";
import type { Todo } from "@/shared/contract/todo";
import { matchesFilterView } from "@/client/todos/filter-view";
import { useFilterView } from "@/client/todos/filter-view-context";
import { focusTargetAfterDelete } from "@/client/todos/focus-after-delete";
import { useDeleteTodo } from "@/client/todos/use-delete-todo";
import { useSetCompleted } from "@/client/todos/use-set-completed";
import { useTodos } from "@/client/todos/use-todos";

import { ADD_INPUT_ID } from "./add-input";
import { DeleteDialog } from "./delete-dialog";
import { EmptyState } from "./empty-state";
import { SKELETON_ROW_KEYS, SkeletonRow } from "./skeleton-row";
import { rowCheckboxId, TodoRow } from "./todo-row";

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
    noteDelete,
    isDeleting,
    releaseDepartures,
    cancelDepartures,
    endDeparture,
  } = useFilterView();

  // The two moments the Filter View cares about, handed to the mutation rather
  // than wrapped around it.
  //
  // `noteToggle` goes in as the request seam so that a `Retry` pressed in the
  // banner starts a departure too (Story 4.4 AC5) — a wrapper here would only
  // ever run for the checkbox, and the banner has no wrapper to go through.
  //
  // A refused toggle undoes the change a departure is leaving over, and this
  // is the only place that learns of it: the rollback is a cache write, and
  // polling the cache for it cannot work because `onMutate` is async — there
  // is always a commit where the row is marked departing and the optimistic
  // write has not landed. Without this the row finishes collapsing, announces
  // a removal that never happened, and pops back at full height.
  const toggle = useSetCompleted({
    onRequested: noteToggle,
    onRefused: useCallback(
      (todo: Todo) => cancelDepartures([todo.id]),
      [cancelDepartures],
    ),
  });

  // The second mutation this component holds, and the one Story 5.2 stopped
  // short of. One instance for the whole list, exactly as the toggle is — the
  // dialog is one element for every row, so the hook behind it is too.
  //
  // It takes no seams. A refused toggle has to call a departure off, because
  // the rollback is a cache write the Filter View cannot see; a refused delete
  // has nothing to call off, because by the time a refusal can arrive the
  // collapse has already ended and the row has already left the cache. That is
  // the whole of why the order below is collapse, then remove, then send.
  const remove = useDeleteTodo();

  // One attribute, set from the product's only reader of the preference; the
  // recipes in `app/globals.css` derive the stillness from it (AR-28). No
  // component branches on a duration and no `className` here is computed.
  const still = useReducedMotion();

  // Which Todo the confirmation is asking about, and the only state this
  // component holds. One dialog for the whole list rather than one per row —
  // "one dialog, one level deep, nothing stacks on top of it" is a property of
  // where the element lives, not of what it renders, and a `<dialog>` per row
  // would be a hundred modals in a hundred-row list.
  //
  // An **id**, and never the Todo. AD-8 keeps server state in the one cache
  // entry, and a `Todo` parked in React state is a copy of a row that can go
  // stale under it: toggle the Todo while the dialog is open and the object
  // held here still describes the row as it was. The id is the client's own
  // (AD-4) and never changes, so the row is looked up again on every render and
  // the dialog is asking about whatever the cache currently holds.
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  // A departing row no longer matches the view — that is what makes it depart
  // — so it is kept by name until its transition reports that it has finished.
  // Without this the row would be filtered out in the same commit that marked
  // it leaving, and there would be nothing on screen to leave.
  const visible = data?.filter(
    (todo) => matchesFilterView(todo, view) || isDeparting(todo.id),
  );

  // The row the dialog is asking about, derived rather than stored — see the
  // note on the state above. `null` closes the dialog, which is also the right
  // answer when the row leaves the view underneath it: there is nothing left to
  // confirm, so the question goes away.
  const pendingDelete =
    visible?.find((todo) => todo.id === pendingDeleteId) ?? null;

  // ...and the id has to go with it, or the dialog and this component disagree
  // about whether anything is pending. Two bugs follow from the one stale
  // value, and both were shipped by the attempt this story replaces: pressing
  // the same row's control again calls `setPendingDeleteId` with the value it
  // already holds, React bails out of the re-render, and the dialog never
  // reopens; and when the row comes back into view — a toggle back, a Filter
  // View change — the dialog reopens unasked.
  //
  // Guarded on `visible` being defined, because while the list is loading or
  // after a failed read every id looks stale and clearing then would throw away
  // a pending delete the user is looking at.
  //
  // Adjusted during render rather than in an effect, which is React's own
  // "adjusting state when a prop changes" pattern and the one the lint rule
  // `react-hooks/set-state-in-effect` exists to push work towards: React
  // discards this render and re-runs the component before committing, so the
  // dialog is never painted holding a row the list no longer shows, and there
  // is no second commit for anything to flash in.
  if (
    pendingDeleteId !== null &&
    visible !== undefined &&
    pendingDelete === null
  ) {
    setPendingDeleteId(null);
  }

  // Where focus goes when the dialog closes on `Delete`, and the one thing this
  // component does that reaches into the document.
  //
  // Which control it is belongs to `focusTargetAfterDelete`, which is pure and
  // is tested against every arrangement the list can be in; what is here is
  // only turning that answer into an element.
  //
  // It is called against the list as it stands *before* the removal, which is
  // what the pure function documents itself as taking: "the row that took its
  // place" is the row after the deleted one, resolved against the arrangement
  // the user was looking at when they confirmed.
  //
  // The confirm handler therefore places focus first and starts the removal
  // second. Be honest about what that buys today: nothing observable. Neither
  // route out of the confirm has removed the row by the time this would run —
  // `noteDelete` is a `setState`, and `mutate`'s `onMutate` is async — so
  // `visible` reads the same either way and swapping the two lines changes no
  // behaviour. The order states the intent, and `todo-list.test.ts` pins it as
  // source text, so that it stays true if either of those ever becomes
  // synchronous.
  //
  // The two ids are built by the components that own the elements rather than
  // spelled here, so a renamed control breaks at the import instead of silently
  // focusing nothing. Cancel and Escape need none of this: `showModal()`
  // restores focus to the control that opened the dialog by itself.
  //
  // Not wrapped in `useCallback`: `visible` is a fresh array on every render, so
  // the memo would be recomputed every time and buy a dependency list rather
  // than a stable identity.
  function placeFocusAfterDelete(deletedId: string): void {
    // Departing rows are excluded. A row on its way out of the Filter View is
    // kept in `visible` so it has something to leave with, but it is about to
    // unmount — focus parked on it is focus dropped to `document.body` the
    // moment its transition ends.
    const onScreen = (visible ?? []).filter((todo) => !isDeparting(todo.id));
    const target = focusTargetAfterDelete(onScreen, deletedId);
    const row =
      target.kind === "row"
        ? document.getElementById(rowCheckboxId(target.id))
        : null;

    // The fallback is explicit rather than an optional call that swallows a
    // miss: `document.getElementById(id)?.focus()` on an element that is not
    // there leaves focus on `document.body`, which is the one outcome
    // EXPERIENCE.md:202 forbids. The add input is the answer the empty-list case
    // already resolves to, and the one control this screen always has.
    (row ?? document.getElementById(ADD_INPUT_ID))?.focus();
  }

  // A row has finished collapsing. Which collapse it was decides what that
  // means (Story 5.3 AC1).
  //
  // A toggle's departure ends by letting the row go, and the Filter View
  // announces it. A *delete's* departure ends by also removing the Todo: this
  // is the moment the cache write happens and the request goes out, at the end
  // of the collapse rather than at the click. That order is forced rather
  // than chosen — `visible` is derived from the cache and nothing else, so a
  // row removed in `onMutate` unmounts on the click and can animate nothing,
  // and the alternative of parking the departing `Todo` outside the cache so it
  // can keep rendering is exactly what AD-8 forbids. AC1 asks that the removal
  // precede the *server's answer*, not the next frame, and it does.
  //
  // The row is looked up again rather than carried from the confirm handler:
  // that handler had the whole `Todo`, this one has an id and a `data` that
  // still holds the row, because nothing has removed it yet. Re-deriving it is
  // what lets this story add no state to this component at all.
  function endCollapse(id: string): void {
    const deleted = isDeleting(id)
      ? data?.find((todo) => todo.id === id)
      : undefined;
    endDeparture(id);
    if (deleted !== undefined) remove(deleted);
  }

  // The rows currently leaving, as ids. Joined into a string so the effect
  // below has a statically checkable dependency: the array's identity changes
  // on every render and its contents almost never do.
  //
  // This is the reduced-motion release and nothing else — a departure cancelled
  // by a refusal is handled at the seam above, and a departure cancelled by a
  // toggle back is the Filter View's own business.
  const departing = (data ?? [])
    .filter((todo) => isDeparting(todo.id))
    .map((todo) => todo.id)
    .join(" ");

  useEffect(() => {
    // A preference that flipped to `reduce` mid-departure takes the transition
    // away from rows already leaving, so nothing will ever report them
    // finished. They get the end state now, announcement included — which is
    // what AC16 asks for when the preference was set to begin with.
    if (!still || departing === "") return;
    const ids = departing.split(" ");

    // And a *delete* released this way still has to be delivered. Its collapse
    // is the only thing that would ever have removed the Todo, so a row let go
    // without this sits on screen confirmed, undeleted, with no request ever
    // sent — the one failure in this story that is silent in both directions.
    for (const todo of data ?? []) {
      if (ids.includes(todo.id) && isDeleting(todo.id)) remove(todo);
    }

    releaseDepartures(ids);
  }, [still, releaseDepartures, departing, data, isDeleting, remove]);

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
            // Never both. A row confirmed for deletion is leaving for good, so
            // the collapse without the hold is the one that should run —
            // `row-departing` and `row-deleting` would otherwise both match at
            // equal specificity and the winner would be whichever the minifier
            // emitted last.
            departing={isDeparting(todo.id) && !isDeleting(todo.id)}
            deleting={isDeleting(todo.id)}
            onToggle={toggle}
            onDeparted={endCollapse}
            onRequestDelete={(pending) => setPendingDeleteId(pending.id)}
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
      {/*
        One dialog for the whole list, a sibling of the region rather than a
        child of it — a `<dialog>` is not valid inside a `<ul>`, and it must
        outlive any one row besides. `showModal()` puts it in the top layer, so
        where it sits in the markup decides nothing about where it is drawn.

        Rendered unconditionally and closed by its `todo` being `null`, so the
        element is the same element across every open: the platform's focus
        restore remembers the control that opened it, and an element remounted
        per Todo would have nothing to restore to.

        `onConfirm` closes the dialog, places focus, and starts the removal, in
        that order. The order documents the intent rather than carrying any
        behaviour of its own — nothing below has removed the row by the time
        focus is placed, whichever branch runs, and `placeFocusAfterDelete`
        says why at length.

        What *is* load-bearing is the second half: the removal starts as a
        **collapse** rather than a cache write, because a row taken out of the
        cache here would unmount in this same commit with nothing left to
        animate (EXPERIENCE.md:161 — "the same collapse runs on a confirmed
        delete, without the [DEPARTURE_HOLD_MS] hold", the literal elided
        because `motion.test.ts` bans a millisecond literal in every source but
        the motion module's).

        Under reduced motion there is no collapse to start, so it cuts to the
        end state: the Todo leaves the cache and the request goes out in this
        tick. `noteDelete` would record nothing in that case anyway — nothing
        may wait on a `transitionend` that will never fire — so the branch is
        here rather than hidden inside it, where a reader would have to follow
        a `false` back to find out why nothing happened.
      */}
      <DeleteDialog
        todo={pendingDelete}
        onCancel={() => setPendingDeleteId(null)}
        onConfirm={(confirmed) => {
          setPendingDeleteId(null);
          placeFocusAfterDelete(confirmed.id);
          if (still) remove(confirmed);
          else noteDelete(confirmed.id);
        }}
      />
    </>
  );
}
