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
// Story 3.2 filled slot 1, Story 2.6 filled slot 2 and Story 4.3 filled slot
// 3, so the block is complete and holds no placeholder at all — which was
// always the point of Story 1.7's rule for the card itself: a placeholder is a
// thing a later story has to remember to delete. `sticky-top-block.test.ts`
// now asserts the order from the rendered elements and separately requires
// that no slot comment survives, so the stand-in cannot come back.
//
// Slot 1 holds `AddTodo`, not `AddInput`, and the indirection is forced. This
// file is a Server Component — `todo-list.test.ts` asserts it stays one — and
// "passing a function as a prop from a Server Component to a Client Component
// throws" (Next.js, Server and Client boundary guide), so the block cannot
// hand the field its `onSubmit`. Story 3.2 left that seam filled by a no-op
// default; Story 3.3 put a client component on the other side of it instead,
// which is the same arrangement one file over and needs nothing from here.
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
// stacking context regardless — but Story 5.2's swipe puts a transform on a
// row, and a transformed row creates its own stacking context that would
// otherwise paint in source order, which is after this block. Story 4.3's
// departure was expected to need this too and in the end did not: it
// collapses a row's height and fades it rather than moving it, so it creates
// no stacking context. The declaration stays for the swipe.
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
import { AddTodo } from "./add-todo";
import { ErrorBannerRegion } from "./error-banner";
import { FilterTabs } from "./filter-tabs";

export function StickyTopBlock() {
  return (
    <div className="top-block-stack sticky top-0 z-10 -mx-gutter flex flex-col bg-card px-gutter">
      <AddTodo />
      <ErrorBannerRegion />
      <FilterTabs />
    </div>
  );
}
