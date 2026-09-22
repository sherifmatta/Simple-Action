"use client";

// The application's only two live regions, and the only way to announce
// (AD-12, epics.md Story 1.7 AC2/AC3).
//
// This is the one file in the repository permitted to declare `aria-live`.
// `eslint.config.mjs` denies the attribute everywhere else and
// `announcer.test.ts` proves both halves: exactly one polite and one assertive
// region here, and none anywhere else. A component that wants to say something
// calls `useAnnounce()`.
//
// React context is not available in Server Components, so this file carries
// the `"use client"` boundary (Next.js `Server and Client Components` guide,
// §Context providers). The regions render as the provider's own last children
// rather than being handed to the caller, so mounting the provider is the
// whole of mounting them — there is no second step to forget.

import { createContext, useCallback, useContext, useState } from "react";
import type { ReactNode } from "react";
import {
  liveRegionText,
  nextAnnouncement,
  SILENCE,
  type Announcement,
  type Urgency,
} from "./announcement";

/** The single announcing function AD-12 names. */
export type Announce = (message: string, urgency: Urgency) => void;

const AnnounceContext = createContext<Announce | null>(null);

/**
 * The single `announce(message, urgency)` function (AD-12).
 *
 * Throws outside the provider rather than returning a no-op: an announcement
 * that silently goes nowhere is an accessibility regression no test and no
 * reviewer would see.
 */
export function useAnnounce(): Announce {
  const announce = useContext(AnnounceContext);
  if (announce === null) {
    throw new Error(
      "useAnnounce() was called outside <AnnouncerProvider>. The provider is mounted once, at the root — see src/client/providers.tsx.",
    );
  }
  return announce;
}

export function AnnouncerProvider({ children }: { children: ReactNode }) {
  // "Exactly one polite and one assertive live region" (AC2) is a claim about
  // the running DOM, and a lint rule that forbids `aria-live` elsewhere does
  // not make it true: mounting this provider twice yields four regions, with
  // the inner pair silently shadowing the root pair for everything beneath
  // it. Refusing the second mount is what makes "exactly one" structural.
  if (useContext(AnnounceContext) !== null) {
    throw new Error(
      "<AnnouncerProvider> is already mounted above this one. It is mounted once, at the root — see src/client/providers.tsx. A second one would put four live regions in the DOM (AD-12).",
    );
  }

  const [polite, setPolite] = useState<Announcement>(SILENCE);
  const [assertive, setAssertive] = useState<Announcement>(SILENCE);

  // Stable across renders: `announce` ends up in the dependency array of every
  // effect and callback that announces, and an identity that changed each
  // render would re-run all of them.
  const announce = useCallback<Announce>((message, urgency) => {
    const record = (previous: Announcement) =>
      nextAnnouncement(previous, message);
    if (urgency === "assertive") {
      setAssertive(record);
      return;
    }
    setPolite(record);
  }, []);

  return (
    // React 19 renders the context itself as the provider; `Context.Provider`
    // is the deprecated spelling.
    <AnnounceContext value={announce}>
      {children}
      {/*
        Both regions are in the DOM from first paint and stay there. A live
        region that is inserted at the same moment its text arrives is not
        announced by most screen readers — the region has to already exist for
        the change to be a change.

        `aria-atomic` makes the region read as a whole, so the no-break space
        `liveRegionText` alternates never surfaces as its own fragment.
        `sr-only` is Tailwind's own visually-hidden utility: no new token, no
        arbitrary value (AD-13).
      */}
      <div aria-live="polite" aria-atomic="true" className="sr-only">
        {liveRegionText(polite)}
      </div>
      <div aria-live="assertive" aria-atomic="true" className="sr-only">
        {liveRegionText(assertive)}
      </div>
    </AnnounceContext>
  );
}
