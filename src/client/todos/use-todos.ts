"use client";

// The one query hook that owns the Todo List (AD-8, epics.md Story 2.2).
//
// Every component that reads Todos calls this. None calls `fetch`, and none
// holds a Todo in `useState` — server state lives in the query cache and
// nowhere else (AD-8), which is what leaves exactly one cache entry to reason
// about when Epics 3 through 5 start mutating it.
//
// An inline loading state, not `useSuspenseQuery` (Next.js `Client-side data
// fetching` guide, §Choose a client fetching pattern). EXPERIENCE.md keeps the
// card, the input and the filter tabs real and interactive while only the list
// region is skeletal, so the loading state belongs to that one region rather
// than to a boundary that would withhold its siblings too.

import { useQuery } from "@tanstack/react-query";

import { todoListQueryOptions } from "./todo-list-query";

// Re-exported so the single entry point for reading Todos is also the single
// entry point for classifying a failed read: Story 2.7's banner imports the
// hook and the error class from one module rather than reaching past the hook
// into the request it wraps.
export { TodoRequestError } from "./todo-list-query";

/**
 * The caller's Todo List, newest first, with its loading and failure states.
 *
 * `data` arrives in the server's `id DESC` order and is cached as received
 * (AD-5); nothing here re-sorts, because a UUIDv7 is time-ordered and an
 * optimistic row minted in the browser is already in its final position.
 *
 * `error` is a `TodoRequestError` of kind `load` for every way the read can
 * fail. Story 2.7 maps that kind to the banner string and supplies `refetch`
 * as the slot's retry closure (AD-9).
 *
 * Takes no arguments, deliberately. The Filter View is client state, derives
 * its view locally and fires no request (AD-8), so a `filter` parameter here
 * would turn one cache entry into three.
 */
export function useTodos() {
  return useQuery(todoListQueryOptions);
}
