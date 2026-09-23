// Whether this device has a fine pointer (epics.md Story 3.2 AC6;
// EXPERIENCE.md:103, 245; DESIGN.md `components.input-add.autofocus-pointer`
// and `autofocus-touch`).
//
// One question, asked in one place, for the one decision that cannot be made
// in CSS. Everything else in this product that varies by capability is a
// media query inside a recipe — the `Enter` hint's `(pointer: fine)` gate in
// `app/globals.css` is the neighbour this module sits beside — but autofocus
// is a call to `element.focus()`, and no stylesheet can make it.
//
// It is deliberately *not* in `src/client/motion/motion.ts`, which owns
// durations and the reduced-motion preference. The two modules read media
// queries for unrelated reasons: one decides whether the interface moves, the
// other decides whether the caret starts in the field. Story 3.2 narrowed
// `motion.test.ts`'s scan accordingly — the guarantee that motion is never
// branched in a component is intact; what went is the incidental rule that
// `motion.ts` owns every media query in the product.
//
// "Capability, not width" is EXPERIENCE.md:245, and it is why this is a media
// *feature* rather than a breakpoint: a 1280px tablet is touch and a 700px
// laptop window is not.
//
// No `"use client"` directive, and the same argument `motion.ts` makes: this
// exports a hook, not a component, so there is no boundary to declare, and a
// module imported by a Client Component is already in the client graph.

import { useSyncExternalStore } from "react";

/** `(pointer: fine)` — a mouse, a trackpad or a stylus, rather than a finger. */
const POINTER_FINE = "(pointer: fine)";

/**
 * The pointer capability, including the state of not having asked yet.
 *
 * Three values rather than a boolean, and the third one is load-bearing. The
 * server cannot ask, so its answer is `"unknown"` — distinct from `"coarse"`
 * rather than collapsed into it — which is what lets a consumer tell the
 * server's placeholder apart from the browser's real answer. `add-input.tsx`
 * needs exactly that distinction: it latches autofocus on the first *settled*
 * answer, and a boolean cannot say whether `false` means "touch" or "not yet
 * asked" (see the effect there, and this module's test).
 */
export type PointerCapability = "unknown" | "fine" | "coarse";

function subscribe(onStoreChange: () => void): () => void {
  const query = window.matchMedia(POINTER_FINE);
  query.addEventListener("change", onStoreChange);
  return () => query.removeEventListener("change", onStoreChange);
}

function getSnapshot(): PointerCapability {
  return window.matchMedia(POINTER_FINE).matches ? "fine" : "coarse";
}

/**
 * Not asked yet, before there is a browser to ask.
 *
 * The mirror of the motion module's "fail toward stillness", pointed at the
 * harm this question exists to avoid: server-rendered markup carries no
 * capability, and the cost of guessing wrong in each direction is not
 * symmetric. Guessing "pointer" on a phone raises the software keyboard over
 * the list the user came to read (EXPERIENCE.md:103); guessing "touch" on a
 * laptop costs a click. So the unknown *behaves* the way touch does — nothing
 * autofocuses on it — while still being spelled differently, because a
 * consumer that cannot see the difference cannot tell "the browser says no"
 * from "the browser has not spoken".
 */
function getServerSnapshot(): PointerCapability {
  return "unknown";
}

/**
 * `"fine"` when the device has a fine pointer, `"coarse"` when it does not,
 * and `"unknown"` until the browser has been asked.
 *
 * `useSyncExternalStore` rather than an effect-plus-state pair, exactly as
 * `useReducedMotion` does it: it takes the server snapshot above as a
 * first-class input instead of flashing the client value in after mount, and
 * it subscribes, so a capability that arrives mid-session — a mouse plugged
 * into a tablet — is *seen*. Seen is not the same as acted on: what autofocus
 * does with a late arrival is the consumer's decision, and `add-input.tsx`
 * declines it.
 */
export function usePointerCapability(): PointerCapability {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
