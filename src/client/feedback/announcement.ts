// The announcer's state, as pure values (AD-12, epics.md Story 1.7 AC2/AC3).
//
// `announcer.tsx` owns the two live regions and the React wiring; everything
// that can be decided without a DOM lives here, because the test environment
// is `environment: "node"` (vitest.config.mts:30) and a rendering test would
// fail on a missing `document` rather than be skipped.

/**
 * Errors announce assertively; every other announcement is polite (AD-12).
 * There is no third urgency, and `aria-live="off"` is not one — a region that
 * announces nothing is the absence of an announcement, not a kind of one.
 */
export type Urgency = "polite" | "assertive";

/**
 * What one live region currently holds. `nonce` is not rendered — see
 * {@link liveRegionText}.
 */
export type Announcement = {
  readonly message: string;
  readonly nonce: number;
};

/**
 * A live region that has never been announced to.
 *
 * `as const` for the same reason `TODOS_QUERY_KEY` has it: this value is the
 * initial state of *both* regions, so one stray mutation would desynchronise
 * every region initialised from it.
 */
export const SILENCE: Announcement = { message: "", nonce: 0 } as const;

/**
 * Records a new announcement against a region's previous state.
 *
 * The nonce increments on every call, including a repeat of the same message,
 * which is what {@link liveRegionText} needs to make a screen reader re-read
 * identical copy.
 */
export function nextAnnouncement(
  previous: Announcement,
  message: string,
): Announcement {
  return { message, nonce: previous.nonce + 1 };
}

/**
 * The text a live region actually renders.
 *
 * A screen reader announces a live region when its text content *changes*.
 * Announcing the same string twice — "Todo added" for two Todos in a row, one
 * of EXPERIENCE.md's real cases — would leave the DOM untouched and be
 * silently dropped. Alternating a trailing no-break space by nonce parity
 * changes the text content on every announcement while changing nothing that
 * is spoken: U+00A0 carries no pronunciation and is not a word separator a
 * screen reader voices.
 *
 * The parity is chosen so the *first* announcement — nonce 1, and the common
 * case — renders the message untouched; only a repeat pays the space.
 *
 * `SILENCE` renders as the empty string, so an unused region announces
 * nothing on mount.
 */
export function liveRegionText(announcement: Announcement): string {
  if (announcement.message === "") return "";
  return announcement.nonce % 2 === 1
    ? announcement.message
    : `${announcement.message} `;
}
