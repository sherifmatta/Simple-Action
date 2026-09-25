"use client";

// Setting a Todo's Completion Status, optimistically, and saying so when the
// server will not have it (AD-6, AD-8, AD-9, AD-12, AD-16; epics.md Story 4.2
// AC1-AC7 and Story 4.4 AC1-AC7).
//
// Epic 3's shape, reused unchanged rather than re-invented — that is the
// epic's own instruction, and the three seams `use-create-todo.ts` set for
// three epics are all load-bearing here:
//
//   - **One `setQueryData` on the one key**, through `upsertTodoById`. The
//     optimistic write and the rollback are the same narrow operation, applied
//     to two different values of the same row.
//
//   - **No whole-list snapshot.** `onMutate` records the row's previous value
//     by holding the `Todo` it was handed, and nothing else. Restoring a
//     snapshot would undo whatever a *concurrent* toggle had done since, which
//     is a change this mutation has no business reversing (AD-16) — and with
//     one hook serving every row, concurrent is the normal case rather than
//     the exotic one.
//
//   - **The value is set, never toggled, on the wire** (AD-6). The caller
//     passes the status it wants; `set-completed.ts` sends it. A retry
//     therefore produces the same value rather than flipping a second time.
//
// The one deliberate departure from the create is the first line of
// `onMutate`. `use-create-todo.ts` must not cancel in-flight reads — the read
// it would cancel is the one fetching the list the user came to see — and
// `merge-todo-list.ts` protects an unconfirmed create's row from an arriving
// list instead. A toggle gets neither: `pending-creates.ts:10-12` is explicit
// that a toggle's id must not join that set, because it acts on a row the
// server already knows about. So a refetch landing mid-toggle would overwrite
// the optimistic value with the pre-toggle row and the change would visibly
// un-happen. AC3 says a toggle *may* cancel; with no merge protecting it, it
// must.
//
// Story 4.4 finished the failure path Story 4.2 left open. A refusal now puts
// the row back *and* says so: one `update` entry in the single error slot,
// which is the whole of AC2 and AC7 — `ERROR_COPY.update` is already
// `Couldn't save that change.` and `error-banner.tsx` already announces
// whatever the slot holds, assertively, from one site for all four kinds.
// Nothing here renders or announces anything itself.
//
// The entry's closure is the story's other half. AD-9 puts the retry in the
// slot precisely so each operation can describe its own recovery, and this one
// re-attempts *the status the user asked for* rather than toggling whatever
// the row now holds (AC4) — which costs nothing to get right, because a set is
// what goes on the wire in the first place (AD-6).
//
// That is also why `onRequested` is called here, at the top of `onMutate`,
// rather than by the caller before it calls this hook. Story 4.3's departure
// starts from that call; a retry driven from the banner has no caller to make
// it, so a departure would never restart and AC5 would quietly not hold. One
// request path, used by the checkbox and by `Retry` alike — and because the
// seam is read from the options on every render, the retry consults the Filter
// View that is showing when it is pressed rather than the one that was showing
// when the failure landed.

import {
  useMutation,
  useQueryClient,
  type QueryClient,
  type UseMutationOptions,
} from "@tanstack/react-query";
import { useCallback } from "react";

import { useAnnounce, type Announce } from "@/client/feedback/announcer";
import type { ErrorSlotEntry } from "@/client/feedback/error-slot-state";
import { useErrorSlot } from "@/client/feedback/error-slot";
import type { ErrorKind } from "@/shared/contract/errors";
import type { Todo } from "@/shared/contract/todo";

import { upsertTodoById } from "./merge-todo-list";
import { TODOS_QUERY_KEY } from "./query-keys";
import { setCompleted } from "./set-completed";
import { identityExpired, listHasLanded } from "./todo-list-query";

/**
 * The mutation's key.
 *
 * Not a query key — AD-8's "exactly one query key" is about the query cache,
 * and this never reaches it. Spelled without the word `todos` leading a
 * composite array for `pending-creates.ts`'s reason: `providers.test.ts` reads
 * an array literal beginning `["todos", …]` anywhere in the tree as a second
 * query key.
 *
 * Nothing registers it with `unconfirmedCreateIds`, and that absence is the
 * point rather than an omission — a toggle's id must not protect a row from an
 * arriving list, because the server already knows about that row.
 */
export const SET_COMPLETED_MUTATION_KEY = ["set-completed"] as const;

/**
 * What the live region says when a toggle is confirmed (AC6).
 *
 * `use-create-todo.ts`'s `addedAnnouncement` names this as its sibling: the
 * comma is the pause a screen reader needs between the user's words and ours,
 * and `book dentist, Completed` is the literal form epic-4-context gives.
 *
 * `Completed` and `Active` are the vocabulary's own words, capitalised as the
 * vocabulary capitalises them. The word `Done` is banned everywhere, copy and
 * identifiers alike.
 */
export function toggledAnnouncement(text: string, completed: boolean): string {
  return `${text}, ${completed ? "Completed" : "Active"}`;
}

/**
 * What one toggle is: the row as it stands, and the status to set on it.
 *
 * The whole `Todo` rather than its id, because the row the mutation started
 * from *is* the rollback value — holding it in the variables is what lets
 * `onError` restore exactly one row without a snapshot of any kind.
 */
export type SetCompletedVariables = { todo: Todo; completed: boolean };

/**
 * Everything the mutation needs that is not the cache: the live region, the
 * error slot, and the two moments the Filter View cares about.
 *
 * An object rather than a growing tail of positional callbacks. Four of these
 * arrived over three stories, they are all functions of similar shape, and a
 * fifth call site passing them in the wrong order is the bug this shape cannot
 * have. It also keeps the node tests honest: a test that forgets the banner has
 * to say so at the call site rather than silently get a default no-op.
 */
/**
 * The two seams a caller supplies. Both optional; both are Story 4.3's.
 *
 * Named rather than positional for the reason {@link SetCompletedSeams} is, and
 * it is not a style preference: these are `(todo, completed) => void` and
 * `(todo) => void`, and a function of one parameter is assignable to a position
 * expecting two. So `useSetCompleted(onRefused)` — the shape this hook had
 * before Story 4.4 gave it a second callback — type-checks silently into the
 * *first* slot and the refusal seam is simply never called. There is no
 * arrangement of these two that a compiler could catch.
 */
export type SetCompletedCallbacks = {
  onRequested?: (todo: Todo, completed: boolean) => void;
  onRefused?: (todo: Todo) => void;
};

export type SetCompletedSeams = {
  /** The one live region (AD-12). */
  announce: Announce;
  /** The one error slot (AD-9). A refusal raises exactly one `update` entry. */
  raiseError: (entry: ErrorSlotEntry) => void;
  /** Takes down this operation's own banner, by kind (EXPERIENCE.md:109). */
  clearError: (kind?: ErrorKind) => void;
  /**
   * The status the user asked for, before the optimistic write lands.
   *
   * Story 4.3's departure starts here: a toggle that takes a row out of the
   * active Filter View marks it leaving, and it must be marked in the commit
   * that carries the new status rather than after it, or the row would be
   * filtered out before it had anything to leave from.
   *
   * Called on a retry too, which is the whole reason it moved into the
   * mutation (AC5).
   */
  onRequested?: (todo: Todo, completed: boolean) => void;
  /**
   * Called when the server refuses, after the row has been put back.
   *
   * Story 4.3 needs it: a refusal undoes the very thing a departing row is
   * leaving over. Nothing else can see this — the rollback is a cache write and
   * the Filter View does not read the cache — and polling for it cannot work,
   * because `onMutate` is async, so there is always a commit where the row is
   * marked departing and the optimistic write has not landed yet.
   */
  onRefused?: (todo: Todo) => void;
  /**
   * Put the same request back on the wire. What `Retry` invokes (AC4).
   *
   * Supplied by the hook rather than reached for, because `mutate` does not
   * exist until `useMutation` has returned and this object is built to be
   * passed *into* it.
   */
  reattempt: (variables: SetCompletedVariables) => void;
};

/**
 * The mutation, as options a `QueryClient` can run.
 *
 * Exported for the reason `todoListQueryOptions` is: under `environment:
 * "node"` a `MutationObserver` can run these directly, so the optimistic
 * write, the per-entity rollback under two concurrent toggles, the cancelled
 * read and now the refusal's banner and its `Retry` are all provable with no
 * DOM, no component and no provider — which is exactly where those bugs live.
 * The hook below is then a wiring job with nothing left in it to get wrong.
 *
 * `retry: false` and `networkMode: "always"` match the read and the create
 * (`todo-list-query.ts` says why at length): recovery is AD-9's explicit
 * `Retry`, and an update attempted while the browser reports itself offline
 * must fail visibly rather than pause into a state with nothing to press.
 */
export function setCompletedMutationOptions(
  client: QueryClient,
  seams: SetCompletedSeams,
): UseMutationOptions<Todo, Error, SetCompletedVariables> {
  const {
    announce,
    raiseError,
    clearError,
    reattempt,
    onRequested = () => {},
    onRefused = () => {},
  } = seams;

  return {
    mutationKey: SET_COMPLETED_MUTATION_KEY,
    mutationFn: setCompleted,
    retry: false,
    networkMode: "always",

    // AC1 and AC3. The cancel is awaited, so a read already in flight is
    // aborted before the write lands rather than beside it; TanStack drops a
    // cancelled read's response instead of committing it, which is what stops
    // the pre-toggle list from arriving on top of the optimistic row.
    //
    // Gated on a server list having landed, and the gate is AC3's own
    // reasoning rather than a caveat on it: "a toggle *may* cancel in-flight
    // reads, because it acts on a row the server already knows about — unlike
    // create". A row the server does not know about is reachable here, because
    // an optimistic create renders a live checkbox while the very first `GET`
    // is still on its way (Story 3.3 AC6). Cancelling *that* read leaves the
    // query at `fetchStatus: "idle"` with `data` undefined and nothing to
    // re-issue it, so the list never lands and the region pulses forever —
    // `use-create-todo.ts`'s "cancel it and the list never lands", reached
    // from the toggle side. Before the list has landed the protection
    // `merge-todo-list.ts` gives an unconfirmed create's row is what keeps the
    // optimistic status, which is the same mechanism and the right one.
    //
    // `onRequested` runs first, and before the `await` rather than after it:
    // it is synchronous, so the Filter View learns what was asked for in the
    // same tick the user pressed the checkbox in, whatever the cancel does.
    //
    // The write itself is one upsert on the one key. The row keeps its id, so
    // `upsertTodoById` replaces it where it already sits and it does not move
    // — AC2 needs no code, because `byIdDescending` sorts on id alone and
    // Completion Status is not a sort key.
    async onMutate({ todo, completed }) {
      onRequested(todo, completed);
      if (listHasLanded(client)) {
        await client.cancelQueries({ queryKey: TODOS_QUERY_KEY });
      }
      client.setQueryData<Todo[]>(TODOS_QUERY_KEY, (cached) =>
        upsertTodoById(cached, { ...todo, completed }),
      );
    },

    // AC6 and AC7. The same upsert, now with the server's record: same id, so
    // the row is replaced where it already sits and nothing moves — and what
    // the cache ends up holding is what the server stored, not what the
    // browser guessed, which is the difference a reload would otherwise
    // expose.
    //
    // The announcement reads the *confirmed* row's status rather than the
    // requested one, for the same reason: what is announced is what is true.
    //
    // The banner goes with it, by kind — "the banner clears when the retried
    // operation succeeds or on a later success of the same kind"
    // (EXPERIENCE.md:109). By kind, so a toggle succeeding says nothing about
    // a failed add showing beside it. `Retry` has already emptied the slot by
    // the time a retry gets here, so what this covers is the other route: a
    // *different* toggle succeeding while the first one's banner is up.
    onSuccess(confirmed) {
      client.setQueryData<Todo[]>(TODOS_QUERY_KEY, (cached) =>
        upsertTodoById(cached, confirmed),
      );
      announce(
        toggledAnnouncement(confirmed.text, confirmed.completed),
        "polite",
      );
      clearError("update");
    },

    // Story 4.2 AC4/AC5 and Story 4.4 AC1-AC4, and the order is the order the
    // user experiences: the row goes back to what is actually true, the row
    // stops leaving a view it belongs in again, and only then does the banner
    // say what happened.
    //
    // One row, restored to the `Todo` this mutation was handed — which is the
    // row as it stood before the optimistic write, by id. A whole-list snapshot
    // taken in `onMutate` is the obvious alternative and AD-16 forbids it: with
    // a second toggle in flight, restoring one would undo a change this
    // mutation never made. `upsertTodoById` cannot reach any row but its own,
    // whatever else is in flight.
    //
    // AC3 falls out of those two lines and needs nothing of its own. A row that
    // had already departed the view is back in the cache with its old status,
    // so it matches the view again and renders in its original position —
    // position being id order, which the restore does not touch.
    onError(failure, { todo, completed }) {
      client.setQueryData<Todo[]>(TODOS_QUERY_KEY, (cached) =>
        upsertTodoById(cached, todo),
      );
      // After the restore, so anybody acting on it sees the row as it is
      // again rather than as the toggle had left it.
      onRefused(todo);

      raiseError({
        kind: "update",
        retry: () => {
          // The same non-retryable failure the read and the create have,
          // reached from a third side. `middleware.ts` mints a Client Identity
          // on a document request and never under `app/api/`, so a `401` on
          // the `PATCH` means re-sending it yields `401` for as long as the
          // page is open — a `Retry` that cannot work. A fresh document
          // request is what mints, and the decision is delegated to the module
          // that owns the reason rather than re-derived from a status code
          // read here.
          if (identityExpired(failure)) {
            window.location.reload();
            return;
          }

          // AC6. The row may be gone — deleted since, or dropped by a list
          // that arrived without it — and a retry then re-attempts nothing.
          // The banner still clears, because `retryCurrentError` empties the
          // slot before it invokes this and does not care what it does.
          //
          // The row is read back from the cache rather than reused from the
          // closure so the retry starts from what is true *now*: that value is
          // this attempt's own rollback if it fails again, and it is what the
          // Filter View is asked about. `completed` is the one thing taken
          // from the closure, because AC4 is explicit that `Retry` re-attempts
          // the status the user asked for rather than a fresh toggle of
          // whatever the row currently holds.
          const current = client
            .getQueryData<Todo[]>(TODOS_QUERY_KEY)
            ?.find((row) => row.id === todo.id);
          if (current === undefined) return;

          reattempt({ todo: current, completed });
        },
      });
    },
  };
}

/**
 * Set a Todo's Completion Status: on screen immediately, on the server shortly
 * after.
 *
 * Returns the setter rather than the mutation object, because the caller is a
 * list of rows with one thing to do and no use for `isPending` — the whole
 * design of this epic is that the interface does not wait.
 *
 * One hook instance serves every row, exactly as one `useCreateTodo` serves
 * every submit. `TodoList` holds it and passes the setter down, so `TodoRow`
 * stays presentational and needs no provider of its own.
 */
export function useSetCompleted({
  onRequested,
  onRefused,
}: SetCompletedCallbacks = {}): (todo: Todo, completed: boolean) => void {
  const client = useQueryClient();
  const announce = useAnnounce();
  const { raiseError, clearError } = useErrorSlot();

  // A refusal's `Retry` puts the same request back on the wire, so the options
  // need `mutate` — which does not exist until the call they are passed to has
  // returned. The closure below closes that loop and is safe to write this way
  // because nothing calls it during this render: `useMutation` stores it, and
  // the earliest it can run is a button press after the request has failed, by
  // which time `mutate` has long been bound.
  //
  // A `useRef` written on every render is the reflex here and is the wrong
  // tool — there is nothing to carry *between* renders, only a name to use
  // later within one — and `react-hooks/refs` rejects it on exactly that
  // ground.
  const { mutate } = useMutation(
    setCompletedMutationOptions(client, {
      announce,
      raiseError,
      clearError,
      onRequested,
      onRefused,
      reattempt: (variables) => mutate(variables),
    }),
  );

  return useCallback(
    (todo: Todo, completed: boolean) => mutate({ todo, completed }),
    [mutate],
  );
}
