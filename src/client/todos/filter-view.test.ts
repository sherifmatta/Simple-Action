// The Filter View's rules, with no React and no DOM (Story 4.3).
//
// The predicate, the three counts and the departure rule are one rule read
// three ways, and all three are pure, so all three are checkable here — which
// is the reason they live in a module rather than at the call site.

import { describe, expect, it } from "vitest";

import type { Todo } from "@/shared/contract/todo";
import {
  countsByFilterView,
  departsOnToggle,
  departureAnnouncement,
  FILTER_VIEW_LABELS,
  FILTER_VIEWS,
  matchesFilterView,
  type FilterView,
} from "./filter-view";

const todo = (id: string, text: string, completed: boolean): Todo => ({
  id,
  text,
  completed,
  createdAt: "2026-09-23T09:00:00.000Z",
});

const active = todo("0199a5c5-0000-7000-8000-000000000001", "book dentist", false);
const completed = todo("0199a5c5-0000-7000-8000-000000000002", "send invoice", true);

describe("the three views, and the words for them", () => {
  it("renders and tabs in the order EXPERIENCE.md fixes", () => {
    // EXPERIENCE.md:194 — "input → Retry → All → Active → Completed". The tabs
    // get that order by mapping this array, so the array is the order.
    expect([...FILTER_VIEWS]).toEqual(["all", "active", "completed"]);
  });

  it("uses the vocabulary's own words, and never the banned one", () => {
    // DESIGN.md:420 gives the three labels literally. `Done` is banned
    // everywhere in this product — copy and identifiers alike — and the check
    // is worth making here because this is the only file that spells the
    // user-facing words for a Completion Status.
    expect(FILTER_VIEW_LABELS).toEqual({
      all: "All",
      active: "Active",
      completed: "Completed",
    });
    expect(JSON.stringify(FILTER_VIEW_LABELS)).not.toMatch(/done/i);
  });
});

describe("which Todos a view holds", () => {
  it("holds everything in All", () => {
    expect(matchesFilterView(active, "all")).toBe(true);
    expect(matchesFilterView(completed, "all")).toBe(true);
  });

  it("splits Active from Completed on Completion Status alone", () => {
    expect(matchesFilterView(active, "active")).toBe(true);
    expect(matchesFilterView(active, "completed")).toBe(false);
    expect(matchesFilterView(completed, "completed")).toBe(true);
    expect(matchesFilterView(completed, "active")).toBe(false);
  });
});

describe("the counts each segment carries (AC4, AC5, AC8)", () => {
  it("counts a mixed list once per view", () => {
    // DESIGN.md:420's own example: `All 4`, `Active 2`, `Completed 2`.
    const list = [
      active,
      completed,
      todo("0199a5c5-0000-7000-8000-000000000003", "pay rent", false),
      todo("0199a5c5-0000-7000-8000-000000000004", "call mum", true),
    ];
    expect(countsByFilterView(list)).toEqual({ all: 4, active: 2, completed: 2 });
  });

  it("renders a zero rather than hiding it", () => {
    // AC4: "a count of zero renders as `0` and never hides". The rendering is
    // the tabs'; what this pins is that the number exists to be rendered —
    // an absent key would make the segment show nothing at all.
    expect(countsByFilterView([completed])).toEqual({
      all: 1,
      active: 0,
      completed: 1,
    });
  });

  it("counts an absent list as three zeros (AC8)", () => {
    // The list has not landed. Not an error and not a special case: there is
    // nothing to count, so every view holds none of it.
    expect(countsByFilterView(undefined)).toEqual({
      all: 0,
      active: 0,
      completed: 0,
    });
    expect(countsByFilterView([])).toEqual({ all: 0, active: 0, completed: 0 });
  });

  it("agrees with the predicate, on every view, for any list", () => {
    // One predicate behind both, so a second implementation cannot drift from
    // the first. Asserted as the relationship rather than as a number, so it
    // survives the fixture changing.
    //
    // Note what this does *not* claim: that the counts always match the rows on
    // screen. During a departure they deliberately do not — the row is held
    // visible for ~580ms after the cache already says it left, so the Active
    // count reads one lower than the Active rows rendered. The count follows
    // the list; the row is the one lagging, on purpose.
    const list = [active, completed, todo("0199a5c5-0000-7000-8000-000000000005", "x", false)];
    const counts = countsByFilterView(list);
    for (const view of FILTER_VIEWS) {
      expect(counts[view]).toBe(
        list.filter((entry) => matchesFilterView(entry, view)).length,
      );
    }
  });
});

describe("whether a toggle takes a row out of the view (AC13, AC17)", () => {
  it("departs the view the row no longer matches", () => {
    expect(departsOnToggle(active, true, "active")).toBe(true);
    expect(departsOnToggle(completed, false, "completed")).toBe(true);
  });

  it("stays when the new status still matches", () => {
    // Re-stating the status a row already holds is not a departure: `setting`
    // rather than `toggling` is the whole shape of this endpoint (AD-6), so a
    // repeat is a no-op here too.
    expect(departsOnToggle(active, false, "active")).toBe(false);
    expect(departsOnToggle(completed, true, "completed")).toBe(false);
  });

  it("never departs All, whatever the toggle does (AC17)", () => {
    // Not a case in the implementation and not one here either — it falls out
    // of the predicate, because nothing stops matching All.
    expect(departsOnToggle(active, true, "all")).toBe(false);
    expect(departsOnToggle(completed, false, "all")).toBe(false);
  });

  it("answers from the status requested, not the one the row holds", () => {
    // Two rows in opposite statuses, both asked to become Completed, both in
    // the Active view: the answer is the same for each, because the only thing
    // that decides it is the status being set. An implementation that read
    // `!todo.completed` — a toggle rather than a set — would split them.
    expect(departsOnToggle(active, true, "active")).toBe(true);
    expect(departsOnToggle(completed, true, "active")).toBe(true);
  });
});

describe("what a departure announces (AC15)", () => {
  it("names the Todo and the view it left", () => {
    // EXPERIENCE.md:210 — "the Todo text, then `removed from Active` or
    // `removed from Completed`". The comma is the pause `addedAnnouncement`
    // and `toggledAnnouncement` already use between the user's words and ours.
    expect(departureAnnouncement("book dentist", "active")).toBe(
      "book dentist, removed from Active",
    );
    expect(departureAnnouncement("send invoice", "completed")).toBe(
      "send invoice, removed from Completed",
    );
  });

  it("builds every view's sentence from the one label table", () => {
    // So the announcement and the tab can never call the same view two things.
    for (const view of FILTER_VIEWS satisfies readonly FilterView[]) {
      expect(departureAnnouncement("x", view)).toBe(
        `x, removed from ${FILTER_VIEW_LABELS[view]}`,
      );
    }
  });
});
