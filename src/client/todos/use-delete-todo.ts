"use client";

// Removing a Todo, optimistically, and putting it back when the server will not
// have it (AD-6, AD-8, AD-9, AD-10, AD-12, AD-16; epics.md Story 5.3 AC1,
// AC4-AC5, AC8-AC13).
//
// Epic 3's shape, reused unchanged for the third time — that is Epic 5's own
// instruction, and `use-set-completed.ts` is the template this follows almost
// line for line:
//
//   - **One `setQueryData` on the one key.** The optimistic write is
//     `removeTodoById` and the rollback is `upsertTodoById`, which are the two
//     narrowest operations `merge-todo-list.ts` has. Neither can reach a row
//     but its own, whatever else is in flight.
//
//   - **No whole-list snapshot.** `onMutate` returns no context. The row this
//     mutation removed rides in the *variables*, which is both the value the
//     rollback needs and the only copy of it anybody holds — AD-8 forbids
//     parking a `Todo` in React state, and `use-todos.test.ts` fails the suite
//     for one tree-wide.
//
//   - **The cancel is the toggle's, not the create's.** A delete acts on a row
//     the server already knows about, so — unlike a create — it *may* cancel
//     in-flight reads (AC4), and with no `pending-creates.ts` protection
//     standing behind it, it must: a refetch landing mid-delete would merge the
//     server's still-present row straight back over the optimistic removal.
//
// Three things here are the delete's own, and each is a decision rather than an
// omission:
//
//   - **`onSuccess` writes nothing to the cache.** The row is already gone, and
//     the `204` has no body to write (`delete-todo.ts`). What it does is
//     announce, politely, and take its own banner down by kind.
//
//   - **The retry closure reads the cache to ask whether the row is still
//     there, and for nothing else.** The toggle's lookup does two jobs — it
//     re-sends the *current* value rather than a stale one, and it notices a
//     row that has gone (`use-set-completed.ts` AC6). A delete carries no value
//     that could go stale, so the cached row and the closure's are the same
//     instruction and only the second job is left. The ordinary retry finds the
//     row, because the rollback put it back; a miss means something else
//     removed it between the refusal and the press — an arriving list, another
//     tab, a second delete — and AC12 asks that `Retry` then do nothing, which
//     it does while the banner comes down regardless (AD-9).
//
//   - **`Retry` does not re-open the dialog and does not re-collapse the row.**
//     The closure lives in the error slot rather than in the list, so it removes
//     the row from the cache directly and the row vanishes without motion.
//     EXPERIENCE.md:122 asks only that it "be removed again optimistically";
//     the user already confirmed, and a second collapse would also mean a
//     second `transitionend` this closure has no way to await (AC11).
//
// Nothing here renders or announces a failure. `error-banner.tsx` announces
// whatever the single slot holds, assertively, from one site for all four kinds
// (AC13) — a second call from here would speak the same sentence twice.

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

import { deleteTodo } from "./delete-todo";
import { removeTodoById, upsertTodoById } from "./merge-todo-list";
import { TODOS_QUERY_KEY } from "./query-keys";
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
 * Nothing registers it with `unconfirmedCreateIds`, and that absence matters
 * more here than anywhere else: an id protected from an arriving list is a row
 * the merge keeps, and a *deleted* row kept that way would be immortal across
 * every refetch for the rest of the mutation's garbage-collection window.
 */
export const DELETE_TODO_MUTATION_KEY = ["delete-todo"] as const;

/**
 * What the live region says when a removal is confirmed (AC5).
 *
 * EXPERIENCE.md:211 — on a delete, "the Todo text, then `deleted`". The comma
 * is the pause a screen reader needs between the user's words and ours;
 * `addedAnnouncement` and `toggledAnnouncement` are the same shape, which is
 * why this is a function rather than a template inlined at the call site.
 */
export function deletedAnnouncement(text: string): string {
  return `${text}, deleted`;
}

/**
 * What one removal is: the row being removed, whole.
 *
 * The `Todo` rather than its id, because the row *is* the rollback value —
 * holding it in the variables is what lets `onError` put exactly one row back
 * without a snapshot of any kind, and what keeps it out of React state (AD-8).
 */
export type DeleteTodoVariables = { todo: Todo };

/**
 * Everything the mutation needs that is not the cache.
 *
 * An object rather than a tail of positional callbacks, for the reason
 * `SetCompletedSeams` gives: these are all functions of similar shape, and a
 * call site passing them in the wrong order is the bug this shape cannot have.
 */
export type DeleteTodoSeams = {
  /** The one live region (AD-12). */
  announce: Announce;
  /** The one error slot (AD-9). A refusal raises exactly one `delete` entry. */
  raiseError: (entry: ErrorSlotEntry) => void;
  /** Takes down this operation's own banner, by kind (EXPERIENCE.md:109). */
  clearError: (kind?: ErrorKind) => void;
  /**
   * Put the same removal back on the wire. What `Retry` invokes (AC11).
   *
   * Supplied by the hook rather than reached for, because `mutate` does not
   * exist until `useMutation` has returned and this object is built to be
   * passed *into* it.
   */
  reattempt: (variables: DeleteTodoVariables) => void;
};

/**
 * The mutation, as options a `QueryClient` can run.
 *
 * Exported for the reason `setCompletedMutationOptions` is: under `environment:
 * "node"` a `MutationObserver` can run these directly, so the optimistic
 * removal, the per-entity restore under a concurrent toggle, the gated cancel
 * and the refusal's banner and its `Retry` are all provable with no DOM, no
 * component and no provider — which is exactly where those bugs live.
 *
 * `retry: false` and `networkMode: "always"` match the read, the create and the
 * update (`todo-list-query.ts` says why at length): recovery is AD-9's explicit
 * `Retry`, and a delete attempted while the browser reports itself offline must
 * fail visibly rather than pause into a state with nothing to press.
 */
export function deleteTodoMutationOptions(
  client: QueryClient,
  seams: DeleteTodoSeams,
): UseMutationOptions<void, Error, DeleteTodoVariables> {
  const { announce, raiseError, clearError, reattempt } = seams;

  return {
    mutationKey: DELETE_TODO_MUTATION_KEY,
    mutationFn: deleteTodo,
    retry: false,
    networkMode: "always",

    // AC1 and AC4. The cancel is awaited, so a read already in flight is
    // aborted before the write lands rather than beside it; TanStack drops a
    // cancelled read's response instead of committing it, which is what stops
    // the pre-delete list from arriving on top of the removal.
    //
    // Gated on a server list having landed, and the gate is the toggle's own
    // reasoning reached from the delete side: a row the server does *not* know
    // about is reachable here, because an optimistic create renders a live
    // delete control while the very first `GET` is still on its way (Story 3.3
    // AC6). Cancelling *that* read leaves the query at `fetchStatus: "idle"`
    // with `data` undefined and nothing to re-issue it, so the list never lands
    // and the region pulses forever. Before the list has landed, the protection
    // `merge-todo-list.ts` gives an unconfirmed create's row is what holds —
    // and a create's row removed here is simply a row the arriving list will
    // not carry either.
    //
    // The write itself is one removal on the one key, and it returns nothing:
    // no context, no snapshot. `onError` restores from the variables instead.
    async onMutate({ todo }) {
      if (listHasLanded(client)) {
        await client.cancelQueries({ queryKey: TODOS_QUERY_KEY });
      }
      client.setQueryData<Todo[]>(TODOS_QUERY_KEY, (cached) =>
        removeTodoById(cached, todo.id),
      );
    },

    // AC5, and nothing else. There is no body to parse and nothing to write
    // back — the row is already out of the cache and the server has now agreed
    // (`delete-todo.ts`). The announcement is the *variables'* text rather than
    // a response's, because the response is empty by design.
    //
    // The banner goes with it, by kind — "the banner clears when the retried
    // operation succeeds or on a later success of the same kind"
    // (EXPERIENCE.md:109). By kind, so a delete succeeding says nothing about a
    // failed add showing beside it. `Retry` has already emptied the slot by the
    // time a retry gets here, so what this covers is the other route: a
    // *different* delete succeeding while the first one's banner is up.
    onSuccess(_confirmed, { todo }) {
      announce(deletedAnnouncement(todo.text), "polite");
      clearError("delete");
    },

    // AC8, AC9 and AC10, and the order is the order the user experiences: the
    // row comes back where it was, and only then does the banner say what
    // happened.
    //
    // One row, restored to the `Todo` this mutation was handed. `upsertTodoById`
    // appends and sorts `byIdDescending` when the id is absent, which it always
    // is here — so "in its original position" is not a behaviour anything
    // implements, it is what happens when a row keyed on an id that never
    // changes is re-inserted into a list ordered by that id (AD-5).
    //
    // A whole-list snapshot taken in `onMutate` is the obvious alternative and
    // AD-16 forbids it: with a second mutation in flight, restoring one would
    // undo a change this mutation never made (AC9).
    onError(failure, { todo }) {
      client.setQueryData<Todo[]>(TODOS_QUERY_KEY, (cached) =>
        upsertTodoById(cached, todo),
      );

      raiseError({
        kind: "delete",
        retry: () => {
          // The same non-retryable failure the read, the create and the update
          // have, reached from a fourth side. `middleware.ts` mints a Client
          // Identity on a document request and never under `app/api/`, so a
          // `401` on the `DELETE` means re-sending it yields `401` for as long
          // as the page is open — a `Retry` that cannot work. A fresh document
          // request is what mints, and the decision is delegated to the module
          // that owns the reason rather than re-derived from a status code read
          // here.
          if (identityExpired(failure)) {
            window.location.reload();
            return;
          }

          // The row is back in the cache — `upsertTodoById` above put it
          // there — so this lookup succeeds on the ordinary retry and the row
          // is removed again optimistically by `onMutate`, without a dialog and
          // without a second collapse (AC11).
          //
          // What it is here for is the case where it *fails*: something else
          // removed the row between the refusal and the press — an arriving
          // list, another tab, a second delete. AC12 asks that `Retry` then do
          // nothing, and doing nothing is right rather than merely tidy: the
          // banner reports one failed operation, and there is no longer a Todo
          // for that operation to be about. `retryCurrentError` has already
          // emptied the slot before calling this, so the banner comes down
          // either way (AD-9).
          //
          // The toggle re-reads for a second reason this one does not have —
          // re-sending the *current* value rather than a stale one. A delete
          // carries no value to go stale, so the cached row and the closure's
          // are the same instruction; the lookup is the existence check alone.
          const current = client
            .getQueryData<Todo[]>(TODOS_QUERY_KEY)
            ?.find((row) => row.id === todo.id);
          if (current === undefined) return;

          reattempt({ todo: current });
        },
      });
    },
  };
}

/**
 * Remove a Todo: off screen immediately, off the server shortly after.
 *
 * Returns the remover rather than the mutation object, because the caller is a
 * list with one thing to do and no use for `isPending` — the whole design of
 * this epic is that the interface does not wait.
 *
 * One hook instance serves every row, exactly as one `useSetCompleted` does.
 * `TodoList` holds it and calls it from the dialog's `onConfirm`, so `TodoRow`
 * stays presentational and needs no provider of its own.
 */
export function useDeleteTodo(): (todo: Todo) => void {
  const client = useQueryClient();
  const announce = useAnnounce();
  const { raiseError, clearError } = useErrorSlot();

  // A refusal's `Retry` puts the same request back on the wire, so the options
  // need `mutate` — which does not exist until the call they are passed to has
  // returned. The closure below closes that loop and is safe to write this way
  // because nothing calls it during this render: `useMutation` stores it, and
  // the earliest it can run is a button press after the request has failed, by
  // which time `mutate` has long been bound. (`use-set-completed.ts` makes the
  // same argument, including why a `useRef` here is the wrong tool.)
  const { mutate } = useMutation(
    deleteTodoMutationOptions(client, {
      announce,
      raiseError,
      clearError,
      reattempt: (variables) => mutate(variables),
    }),
  );

  return useCallback((todo: Todo) => mutate({ todo }), [mutate]);
}
