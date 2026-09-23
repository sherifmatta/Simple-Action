"use client";

// Creating a Todo, optimistically (AD-4, AD-5, AD-12, AD-16; epics.md Story
// 3.3 AC1, AC3, AC4, AC8, AC9).
//
// The shape here is the one Epics 4 and 5 reuse unchanged, so its seams are
// being set for three epics rather than one. Three of them matter:
//
//   - **No `cancelQueries`.** The documented optimistic-update recipe opens
//     by cancelling in-flight queries so a stale response cannot overwrite
//     the optimistic write. AD-16 forbids it here and `merge-todo-list.ts` is
//     why: EXPERIENCE.md has the input live *before* the list arrives, so the
//     query this recipe would cancel is the one fetching the list the user
//     came to read. Cancel it and the list never lands. The overwrite the
//     cancel exists to prevent is prevented by merging instead.
//
//   - **The id is minted before the request, not returned by it** (AD-4). It
//     is the row's identity, its sort position (AD-5) and the idempotency key
//     a retry reuses, all decided at the moment the user presses Enter.
//
//   - **Per-entity writes only.** `onMutate` records no whole-list snapshot,
//     because restoring one would undo a concurrent mutation's change as well
//     as this one's (AD-16). Story 3.4's rollback removes a single row for
//     the same reason.
//
// A failed create is deliberately not handled here. Story 3.4 owns the whole
// of it — removing the row, returning the text to the input, raising the
// banner, and retrying with the same id — and each of those is half-wrong on
// its own.

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";

import { useAnnounce } from "@/client/feedback/announcer";
import type { Todo } from "@/shared/contract/todo";

import { createTodo } from "./create-todo";
import { upsertTodoById } from "./merge-todo-list";
import { CREATE_TODO_MUTATION_KEY } from "./pending-creates";
import { TODOS_QUERY_KEY } from "./query-keys";
import { mintTodoId } from "./todo-id";

/**
 * What the live region says when an add succeeds (AC9).
 *
 * EXPERIENCE.md:208 — "the Todo text, then `added`" — and :277 spells the
 * literal form, `send invoice, added`. The comma is the pause a screen reader
 * needs between the user's words and ours; Epic 4's `book dentist, Completed`
 * is the same shape, which is why it is a function here rather than a
 * template inlined at the call site.
 */
export function addedAnnouncement(text: string): string {
  return `${text}, added`;
}

/**
 * Build the row that goes into the cache the instant Enter is pressed.
 *
 * `completed` is `false` because Story 3.1's endpoint creates Active Todos
 * and nothing about a create can produce another value. `createdAt` is a
 * guess, and it is a safe one: AD-5 makes it display metadata and never a
 * sort key, so the only thing it could disagree with the server about is a
 * value nothing reads and which the confirmation replaces.
 */
function optimisticTodo(text: string): Todo {
  return {
    id: mintTodoId(),
    text,
    completed: false,
    createdAt: new Date().toISOString(),
  };
}

/**
 * Submit a Todo: on screen immediately, on the server shortly after.
 *
 * Returns the submit function rather than the mutation object, because the
 * caller is a text field with one thing to do and no use for `isPending` —
 * the whole design of this epic is that the interface does not wait.
 *
 * `retry: false` and `networkMode: "always"` match the read
 * (`todo-list-query.ts` says why at length): recovery is AD-9's explicit
 * `Retry`, and a create attempted while the browser reports itself offline
 * must fail visibly rather than pause into a state with nothing to press.
 */
export function useCreateTodo(): (text: string) => void {
  const client = useQueryClient();
  const announce = useAnnounce();

  const { mutate } = useMutation<Todo, Error, Todo>({
    mutationKey: CREATE_TODO_MUTATION_KEY,
    mutationFn: createTodo,
    retry: false,
    networkMode: "always",

    // AC3 and AC4. The write is a single-row upsert on the one key, and the
    // absence above it is as much of this story as the line itself.
    onMutate(todo) {
      client.setQueryData<Todo[]>(TODOS_QUERY_KEY, (cached) =>
        upsertTodoById(cached, todo),
      );
    },

    // AC8 and AC9. The same upsert, now with the server's record: same id, so
    // the row is replaced where it already sits and nothing moves.
    //
    // The announcement is here rather than in `onMutate` because AC9 says
    // when: "given a *successful* add, when it completes". The cost is real
    // and is not the one a comment here used to claim — `add-input.tsx`
    // trims before it calls this, so the optimistic text and the stored text
    // are the same string, and reading out the submitted one would disagree
    // with nothing. What it costs is time: on a slow connection the row is on
    // screen seconds before the live region says so, and a create that fails
    // is never announced at all. EXPERIENCE.md's UJ-2 ties the announcement
    // to the immediate appearance, which is the other reading; the criterion
    // is what this follows, and `deferred-work.md` records the tension.
    onSuccess(confirmed) {
      client.setQueryData<Todo[]>(TODOS_QUERY_KEY, (cached) =>
        upsertTodoById(cached, confirmed),
      );
      announce(addedAnnouncement(confirmed.text), "polite");
    },
  });

  return useCallback((text: string) => mutate(optimisticTodo(text)), [mutate]);
}
