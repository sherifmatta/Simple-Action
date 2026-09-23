"use client";

// The empty state, in all three variants (epics.md Story 2.6 AC10-AC14, AC17;
// DESIGN.md:217-233, 438; EXPERIENCE.md:72-75, 134-136, 213).
//
// All three are built now and only `all` is reachable: `active` and
// `completed` need a Filter View to select them, and Epic 4 ships those. That
// is the epic's stated doctrine rather than an accident — `epic-2-context.md`
// names the empty-state component alongside the error slot and the motion
// module as the three shared modules built to completion before most of their
// consumers exist, "because grown a piece at a time, they become a second
// definition on the first day of parallel work".
//
// The copy lives here rather than in a shared strings module. There is no
// other consumer: EXPERIENCE.md:85 is explicit that the two lines are
// "separate strings in separate roles, not one sentence that happens to
// wrap", and the only other place either string appears is the announcement
// this component makes of its own text. A second home for them would be a
// second thing to keep in step with EXPERIENCE.md.
//
// Variant marker discipline (AR-28), as `todo-row.tsx` does it: the glyph is
// chosen by which path is rendered rather than by a computed class, and every
// `className` below stays a static string literal so the whole-tree scans
// Story 2.3 built keep seeing this file.
//
// No button and no control (AC13), which is also why there is no `useState`
// and no handler here. EXPERIENCE.md:135 gives the reason for the two
// silent variants: "the user has nothing outstanding and needs nothing from
// the interface". The `all` variant's second line points at the input, which
// is already directly above it — it is a pointer, not a call to action.

import { useEffect } from "react";

import { useAnnounce } from "@/client/feedback/announcer";

/** Which Filter View resolved to nothing. Only `all` is reachable until Epic 4. */
export type EmptyStateVariant = "all" | "active" | "completed";

/**
 * The exact strings, transcribed from EXPERIENCE.md:72-75.
 *
 * `sub` exists on `all` alone. AC12 makes that a property of the data rather
 * than of the rendering: a variant either has a second line or it does not,
 * and the component renders whatever is there.
 */
const EMPTY_COPY: Record<EmptyStateVariant, { line: string; sub?: string }> = {
  all: {
    line: "Nothing here yet.",
    sub: "Type above to add your first Todo.",
  },
  active: { line: "Nothing active." },
  completed: { line: "Nothing completed yet." },
};

/**
 * What a screen reader hears when a view resolves to empty (AC17).
 *
 * EXPERIENCE.md:213 — "both lines on the All view, `Nothing here yet. Type
 * above to add your first Todo.`, and the single line on the other two". One
 * utterance, not two announcements: the second would replace the first in the
 * same live region before it had been read.
 */
export function emptyAnnouncement(variant: EmptyStateVariant): string {
  const { line, sub } = EMPTY_COPY[variant];
  return sub === undefined ? line : `${line} ${sub}`;
}

export function EmptyState({ variant }: { variant: EmptyStateVariant }) {
  const { line, sub } = EMPTY_COPY[variant];
  const announce = useAnnounce();

  // In an effect, never during render: `announce` is `setState` behind a
  // stable identity (announcer.tsx:68), and calling it while another
  // component renders is a cross-component update React rejects outright.
  //
  // Keyed on the variant rather than on mount, so Epic 4 switching between
  // two empty Filter Views announces the new one. Polite, because an empty
  // list is a resolution the user asked for — only a failure they did not
  // cause is assertive (AD-12).
  useEffect(() => {
    announce(emptyAnnouncement(variant), "polite");
  }, [announce, variant]);

  return (
    <div className="flex flex-col items-center rounded-md border-hairline px-6 py-8 text-center empty-panel">
      <span
        aria-hidden="true"
        className="mb-4 flex items-center justify-center rounded-full bg-row-complete text-text-completed empty-ring"
      >
        {/*
          Plus on All, check on the other two (DESIGN.md:438). Geometry and
          stroke are `ring-glyph-size: 18px` and `ring-glyph-stroke: 1.7px`
          from DESIGN.md:226-227, carried as SVG attributes rather than
          classes — the same treatment `todo-row.tsx` gives its checkmark, so
          AD-13's arbitrary-value ban has nothing to catch and no token has to
          be invented for a path. The two paths are the mockup's
          (mockups/key-states.html:448, 477).
        */}
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {variant === "all" ? (
            <path d="M12 5v14M5 12h14" />
          ) : (
            <path d="M5 12.5l4.5 4.5L19 7" />
          )}
        </svg>
      </span>
      <span className="text-empty-message text-text-primary">{line}</span>
      {sub === undefined ? null : (
        <span className="mt-1 text-empty-sub text-text-muted">{sub}</span>
      )}
    </div>
  );
}
