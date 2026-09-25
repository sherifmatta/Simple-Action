"use client";

// Setting a Todo's Completion Status, optimistically (AD-6, AD-8, AD-12,
// AD-16; epics.md Story 4.2 AC1-AC7).
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
// What this hook deliberately does not do is report a failure. A refused
// toggle reverts the row and says nothing — no banner, no assertive
// announcement, no `Retry` closure. That is Story 4.4, whose AC1 re-covers the
// restore and adds the rest; splitting the banner across two stories would
// leave one behaviour with two owners.

import {
  useMutation,
  useQueryClient,
  type QueryClient,
  type UseMutationOptions,
} from "@tanstack/react-query";
import { useCallback } from "react";

import { useAnnounce, type Announce } from "@/client/feedback/announcer";
import type { Todo } from "@/shared/contract/todo";

import { upsertTodoById } from "./merge-todo-list";
import { TODOS_QUERY_KEY } from "./query-keys";
import { setCompleted } from "./set-completed";
import { listHasLanded } from "./todo-list-query";

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
 * The mutation, as options a `QueryClient` can run.
 *
 * Exported for the reason `todoListQueryOptions` is: under `environment:
 * "node"` a `MutationObserver` can run these directly, so the optimistic
 * write, the per-entity rollback under two concurrent toggles and the
 * cancelled read are all provable with no DOM, no component and no provider —
 * which is exactly where those three bugs live. The hook below is then a
 * three-line wiring job with nothing left in it to get wrong.
 *
 * `retry: false` and `networkMode: "always"` match the read and the create
 * (`todo-list-query.ts` says why at length): recovery is AD-9's explicit
 * `Retry`, and an update attempted while the browser reports itself offline
 * must fail visibly rather than pause into a state with nothing to press.
 */
export function setCompletedMutationOptions(
  client: QueryClient,
  announce: Announce,
  /**
   * Called when the server refuses, after the row has been put back.
   *
   * Story 4.3 needs it: a toggle that took a row out of the active Filter View
   * starts a departure, and a refusal undoes the very thing the row is leaving
   * over. Nothing else can see this — the rollback is a cache write and the
   * Filter View does not read the cache — and polling for it cannot work,
   * because `onMutate` is async, so there is always a commit where the row is
   * marked departing and the optimistic write has not landed yet.
   *
   * Still no banner and no announcement: Story 4.4 owns both.
   */
  onRefused: (todo: Todo) => void = () => {},
): UseMutationOptions<Todo, Error, SetCompletedVariables> {
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
    // The write itself is one upsert on the one key. The row keeps its id, so
    // `upsertTodoById` replaces it where it already sits and it does not move
    // — AC2 needs no code, because `byIdDescending` sorts on id alone and
    // Completion Status is not a sort key.
    async onMutate({ todo, completed }) {
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
    onSuccess(confirmed) {
      client.setQueryData<Todo[]>(TODOS_QUERY_KEY, (cached) =>
        upsertTodoById(cached, confirmed),
      );
      announce(
        toggledAnnouncement(confirmed.text, confirmed.completed),
        "polite",
      );
    },

    // AC4 and AC5. One row, restored to the `Todo` this mutation was handed —
    // which is the row as it stood before the optimistic write, by id.
    //
    // A whole-list snapshot taken in `onMutate` is the obvious alternative and
    // AD-16 forbids it: with a second toggle in flight, restoring one would
    // undo a change this mutation never made. `upsertTodoById` cannot reach
    // any row but its own, whatever else is in flight.
    //
    // Nothing is announced and no banner is raised — Story 4.4 owns both.
    onError(_failure, { todo }) {
      client.setQueryData<Todo[]>(TODOS_QUERY_KEY, (cached) =>
        upsertTodoById(cached, todo),
      );
      // After the restore, so anybody acting on it sees the row as it is
      // again rather than as the toggle had left it.
      onRefused(todo);
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
export function useSetCompleted(
  onRefused?: (todo: Todo) => void,
): (todo: Todo, completed: boolean) => void {
  const client = useQueryClient();
  const announce = useAnnounce();

  const { mutate } = useMutation(
    setCompletedMutationOptions(client, announce, onRefused),
  );

  return useCallback(
    (todo: Todo, completed: boolean) => mutate({ todo, completed }),
    [mutate],
  );
}
