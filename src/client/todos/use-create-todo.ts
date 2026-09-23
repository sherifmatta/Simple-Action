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
// Story 3.4 filled the fourth seam, and it is the one the other three were
// shaped for: `onError` removes the single row this mutation inserted, hands
// the submitted text back to the field, and raises a `create` entry whose
// closure re-sends the *same id*. The id minted in `onMutate` is what makes
// that retry idempotent at the server (Story 3.1) and what keeps the row in
// the same position when it reappears.

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback, useRef } from "react";

import { useAnnounce } from "@/client/feedback/announcer";
import { useErrorSlot } from "@/client/feedback/error-slot";
import type { Todo } from "@/shared/contract/todo";
import { isValidTodoText } from "@/shared/contract/validation";

import { createTodo } from "./create-todo";
import { removeTodoById, upsertTodoById } from "./merge-todo-list";
import { identityExpired } from "./todo-list-query";
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
 * The three things this mutation does to the field it was submitted from.
 *
 * Passed in rather than reached for, so a hook under `src/client/todos/` needs
 * no component type and the field keeps its own text (`add-input.tsx` says
 * why). Each one is a criterion: read for AC4's retry, write for AC2's return,
 * empty for AC5's confirmed retry.
 */
export type AddField = {
  currentText: () => string;
  restoreText: (text: string) => void;
  clearAndFocus: () => void;
};

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
export function useCreateTodo(field: AddField): (text: string) => void {
  const client = useQueryClient();
  const announce = useAnnounce();
  const { raiseError, clearError } = useErrorSlot();

  // The most recent create whose text was put back into the field by a
  // failure. AC2 keeps it there "until the add succeeds", so this is what
  // tells a confirmation whether there is anything to clear — a plain success
  // has already cleared the field on Enter, and clearing it again would eat a
  // Todo the user had started typing since.
  //
  // One slot, deliberately, because the field is one string: a second failure
  // displaces the first exactly as it displaces its banner (AD-9). The cost
  // is that a first create confirmed after a second has failed leaves the
  // field uncleared, which is the right answer anyway — what is in the field
  // by then belongs to the second.
  const returned = useRef<string | null>(null);

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

      // AC5. A first-time submit cleared the field on Enter; a retry did not,
      // because AC2 holds the text until the add succeeds. This is that
      // moment, and focus comes back to the field with the clear because the
      // user pressed `Retry` in the banner and the banner is now gone —
      // leaving focus on a button that no longer exists.
      if (returned.current === confirmed.id) {
        returned.current = null;
        field.clearAndFocus();
      }

      // "The banner clears when the retried operation succeeds or on a later
      // success of the same kind" (EXPERIENCE.md:109). By kind, so a create
      // succeeding says nothing about a load failure showing beside it.
      clearError("create");
    },

    // AC1-AC4, and the order is the order the user experiences: the row that
    // was never created goes, the words they typed come back, and only then
    // does the banner say what happened.
    //
    // The removal is by id and nothing else (AC1). A whole-list snapshot
    // taken in `onMutate` would be the obvious alternative and AD-16 forbids
    // it: restoring one would undo whatever a concurrent mutation had done
    // since, which is a change this mutation has no business reversing.
    //
    // The closure captures `todo` — the id, above all. Story 3.1's endpoint
    // answers a create for an id that already exists with the existing row
    // and `200`, so a retry after an *uncertain* failure produces one Todo
    // rather than two. The text is read from the field instead, at the moment
    // `Retry` is pressed, because AC4 says so and because the user has had
    // the text in front of them and may have corrected it.
    //
    // A field that no longer holds a Todo worth sending — emptied, or typed
    // over with whitespace — retries nothing and lets the banner go. That is
    // EXPERIENCE.md:115's standing rule for a `Retry` with nothing left to
    // re-attempt, and `retryCurrentError` has already cleared the slot by the
    // time this runs. `returned` is released with it: the text that id was
    // holding the field for is gone, so nothing is waiting to be cleared if
    // the create is somehow confirmed later.
    onError(failure, todo) {
      client.setQueryData<Todo[]>(TODOS_QUERY_KEY, (cached) =>
        removeTodoById(cached, todo.id),
      );

      // Only into a field the user is not already using for something else.
      // AC2 puts the submitted text back so that a failure costs nothing
      // typed — and writing over a Todo that is half-typed costs exactly
      // that, since this epic's rhythm is that the next Todo can be started
      // before the last one has answered. So the text goes back when there is
      // room for it, and otherwise stays in the closure below, which re-sends
      // it without it ever needing to be on screen. Either way nothing the
      // user typed is lost, which is what the criterion is for.
      //
      // A field already holding this Todo's text counts as room: that is a
      // retry failing again, and the words in front of the user are the ones
      // coming back. Restoring puts the caret at the end of them, which is
      // where the criterion wants it every time the add fails and not only
      // the first.
      const current = field.currentText();
      const textReturned = current === "" || current.trim() === todo.text;
      if (textReturned) {
        returned.current = todo.id;
        field.restoreText(todo.text);
      }

      raiseError({
        kind: "create",
        retry: () => {
          // The same non-retryable failure the read has, reached from the
          // other side. `middleware.ts` mints a Client Identity on a document
          // request and never under `app/api/`, so a `401` on the `POST`
          // means re-sending it yields `401` for as long as the page is open
          // — a `Retry` that cannot work, on the one operation where working
          // is the whole point. A fresh document request is what mints, and
          // the decision is delegated to the module that owns the reason
          // rather than re-derived from a status code read here.
          if (identityExpired(failure)) {
            window.location.reload();
            return;
          }
          // AC4's "the text now sitting in the input" — but only where that
          // is this Todo's text. Where the field was busy and holds someone
          // else's sentence, the submitted text is what is re-sent.
          const text = textReturned ? field.currentText().trim() : todo.text;
          if (!isValidTodoText(text)) {
            if (returned.current === todo.id) returned.current = null;
            return;
          }
          mutate({ ...todo, text });
        },
      });
    },
  });

  // Enter on text a failure put back is the same operation `Retry` is, and it
  // is the key the user's hands are already on. So it re-sends under the id
  // that failure minted rather than a fresh one: Story 3.1's endpoint answers
  // a create for an existing id with the existing row, so an *uncertain*
  // failure — the request arrived, the response did not — produces one Todo
  // either way. Minting again would produce two, and only from the route the
  // interface actually invites.
  //
  // `returned` is null for every other submit, which is every submit where
  // the field's contents are not a failed create's, so an ordinary Enter
  // mints as it always has.
  return useCallback(
    (text: string) => {
      const held = returned.current;
      const todo = optimisticTodo(text);
      mutate(held === null ? todo : { ...todo, id: held });
    },
    [mutate],
  );
}
