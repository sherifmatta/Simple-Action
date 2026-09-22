"use client";

// The application shell's three singletons, composed once (epics.md Story 1.7
// AC1/AC2/AC4; AD-8, AD-9, AD-12).
//
// `app/layout.tsx` is a Server Component and stays one — it mounts this single
// client boundary instead of carrying `"use client"` itself, which would pull
// the whole root layout (and `next/font`'s work) into the client bundle.
// Everything below `<AppProviders>` is still free to be a Server Component:
// `children` arrives as already-rendered output and is never imported into
// this module's graph (Next.js `Server and Client Components` guide,
// §Interleaving Server and Client Components).

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import type { ReactNode } from "react";
import { AnnouncerProvider } from "./feedback/announcer";
import { ErrorSlotProvider } from "./feedback/error-slot";

/**
 * One `QueryClient` per mount of the shell.
 *
 * Built inside `useState`'s initialiser, not at module scope. A module-scope
 * client is created once per *server process*, so under SSR every visitor
 * would share one cache — and this product's cache is one person's Todo List,
 * scoped to their Client Identity (AD-7). The initialiser runs once per mount
 * and is not re-run on re-render.
 *
 * "Per mount" is the honest scope, not "per browser session": remounting
 * `AppProviders` — a root error boundary reset, a fast refresh of this
 * boundary in development — discards the cache. TanStack's App Router
 * guidance for keeping a cache across remounts is a `getQueryClient()` that
 * returns a fresh client on the server and a module-level singleton in the
 * browser. That is not used here because nothing remounts this boundary: the
 * shell has one child, `app/page.tsx`, and no error boundary above it. The
 * story that adds one should revisit this.
 *
 * `defaultOptions` is left unset, which means `staleTime: 0` and therefore a
 * refetch on every mount of every query. That is a real default, chosen by
 * omission rather than absent — Epic 2's query hooks are where it is tuned,
 * against endpoints that exist.
 */
function createQueryClient(): QueryClient {
  return new QueryClient();
}

export function AppProviders({ children }: { children: ReactNode }) {
  const [queryClient] = useState(createQueryClient);

  // Nesting order is deliberate, and it constrains Epic 2. Anything beneath
  // all three can use all three, so the order buys nothing there. What it
  // decides is what the *query client itself* can reach: with it outermost, a
  // global `QueryCache.onError` cannot read the error slot's context, so
  // wiring AD-10's error kinds into AD-9's slot has to happen in each hook's
  // `onError` rather than in one cache-level handler. That is the trade being
  // made — the alternative nests the query client innermost and coscopes its
  // lifetime to the slot, which is worse.
  return (
    <QueryClientProvider client={queryClient}>
      <ErrorSlotProvider>
        <AnnouncerProvider>{children}</AnnouncerProvider>
      </ErrorSlotProvider>
    </QueryClientProvider>
  );
}
