// The two names the sticky offset is built from (epics.md Story 6.2; UX-DR21).
//
// Three things have to agree about the block's measurement, and they live on
// different sides of two boundaries:
//
//   sticky-top-block.tsx   a Server Component — puts the id on the element
//   sticky-block-offset.ts a client hook      — finds it, measures, publishes
//   app/globals.css        a stylesheet       — reads the property back
//
// This module exists because of the first of those. `sticky-top-block.tsx` is
// a Server Component by assertion (`todo-list.test.ts`), and importing the id
// from the hook's module would pull `useLayoutEffect` into the server graph —
// which is a build error, not a style question:
//
//   "You're importing a module that depends on `useLayoutEffect` into a React
//    Server Component module. This API is only available in Client
//    Components."
//
// Marking the hook `"use client"` would not help either: a constant imported
// from a client module into a Server Component arrives as a client reference
// rather than as the string, so the element would get an `id` of the wrong
// shape entirely.
//
// So the shared names sit here, in a module that imports nothing. Both sides
// import it, a rename breaks at the import on both sides, and neither side
// has to know what the other is made of.

/** The id `sticky-top-block.tsx` puts on the block and the hook resolves. */
export const STICKY_TOP_BLOCK_ID = "sticky-top-block";

/**
 * The custom property the hook writes and `app/globals.css` reads.
 *
 * Written onto `document.documentElement` at runtime and deliberately not an
 * `@theme` entry: `app/globals.test.ts:170,180,190` assert the token counts
 * exactly, and this is a measurement rather than a design token.
 */
export const STICKY_BLOCK_HEIGHT_PROPERTY = "--sticky-block-height";
