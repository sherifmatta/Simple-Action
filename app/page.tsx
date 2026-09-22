// The one screen (epics.md Story 1.7 AC5, Story 2.3 AC1/AC5/AC7).
//
// `p-margin-phone` is what keeps ground visible on all sides below 640px, "so
// the card reads as an object on a field rather than as the page"
// (DESIGN.md:352). The ground itself is on `<body>` in app/layout.tsx, along
// with `overflow-x-hidden` — DESIGN.md:356's "no horizontal scrolling on the
// page body, ever".
//
// Everything inside the card is `TodoCard`'s. Story 2.3 moved the card recipe
// out of this file to `src/client/components/`, the home AR-20 gives card,
// input, tabs, row and banner components; what stays here is the page's own
// margin and the fact that the card is the only thing on the screen. There is
// still no wordmark, no title bar and no greeting above it — the product name
// appears in the browser tab title only, which `app/layout.tsx`'s `metadata`
// owns (AC7).
import { TodoCard } from "@/client/components/todo-card";

export default function Page() {
  return (
    <main className="p-margin-phone">
      <TodoCard />
    </main>
  );
}
