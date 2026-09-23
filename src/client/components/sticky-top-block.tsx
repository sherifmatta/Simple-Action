// The sticky top block (epics.md Story 2.3 AC5/AC6; DESIGN.md:360,
// EXPERIENCE.md:53, UX-DR20).
//
// The add input, the error banner region and the filter tabs detach from the
// card's flow and hold at the top of the viewport while the list runs
// underneath them. This file is the *only* place in the product that declares
// `sticky`, which is the point of AC6: Epic 3's input and Epic 4's tabs join
// by being placed inside this container, in the fixed order below, rather
// than by re-implementing stickiness each time. `todo-card.test.ts` asserts
// that one-declaration-site rule across the whole tree.
//
// Story 2.6 filled slot 2 and Story 3.2 filled slot 1. The last slot stays a
// comment, which follows Story 1.7's rule for the card itself: a placeholder
// is a thing a later story has to remember to delete, so there is nothing
// there to delete.
//
// `AddInput` is given no props. The story's plan had a named placeholder
// declared here and passed as `onSubmit`, and that cannot be built: this file
// is a Server Component — `todo-list.test.ts` asserts it stays one — and
// "passing a function as a prop from a Server Component to a Client Component
// throws" (Next.js, Server and Client boundary guide). The placeholder is the
// prop's default instead, declared in `add-input.tsx` beside the component it
// belongs to, and Story 3.3 still has one named constant to replace.
//
// The region is a component rather than markup written out here, and that is
// forced as well as tidy: `sticky-top-block.test.ts` pins this file's `bg-*`
// classes to exactly `["bg-card"]`, so the banner's `bg-danger-bg` could not
// live in this file without weakening the assertion that the block's surface
// is opaque and unmodified.
//
// `top-0` transcribes "at the top of the viewport" literally, because no
// numeric offset is given anywhere in DESIGN.md or EXPERIENCE.md. The related
// measurement — `scroll-padding-top` sized to this block, so a focused
// control never lands underneath it — is UX-DR21 and is Story 6.2's, measured
// live against a block that by then has all three occupants. Nothing here
// hard-codes a height for it to read.
//
// `bg-card` is DESIGN.md:360's "opaque surface rather than a translucent
// one": `{colors.card}` is six hex digits with no alpha channel, and no
// opacity modifier is applied to it. Rows passing behind the block have to be
// hidden by it, not tinted through it.
//
// `z-10` is not needed against today's siblings — a sticky element is
// positioned and therefore paints above the non-positioned rows in its
// stacking context regardless — but Story 4.3's departure animation and Story
// 5.2's swipe both put transforms on rows, and a transformed row creates its
// own stacking context that would otherwise paint in source order, which is
// after this block.
//
// `-mx-gutter px-gutter` and `top-block-stack` are Story 3.2's, and both are
// `deferred-work.md` entries that became visible the moment the block had a
// real occupant. The negative margin widens the block to the card's border
// box and the padding puts its contents back where they were, so a row's
// shadow passes *behind* the block rather than bleeding into the 18px gutter
// beside it — DESIGN.md:360's "rows scroll behind an opaque surface", which
// a block spanning only the content column could not deliver. The recipe
// carries the block's top inset and the gap between its occupants; both are
// untokenised literals, so both live in `app/globals.css` with the mockup
// line they are transcribed from.
import { AddInput } from "./add-input";
import { ErrorBannerRegion } from "./error-banner";

export function StickyTopBlock() {
  return (
    <div className="top-block-stack sticky top-0 z-10 -mx-gutter flex flex-col bg-card px-gutter">
      <AddInput />
      <ErrorBannerRegion />
      {/* 3. filter tabs — Epic 4, Story 4.3 */}
    </div>
  );
}
