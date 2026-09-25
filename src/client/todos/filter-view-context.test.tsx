// @vitest-environment jsdom

// The Filter View's state machine: selection, and the departure a toggle starts
// (Story 4.3 AC7, AC9, AC13, AC15, AC16, AC17).
//
// Driven through a real mount rather than through the module's internals,
// because every rule here is a rule about what happens *between* two renders —
// a row marked leaving and then released, an announcement made once, a
// selection that clears the departure that belonged to the old view. A test
// that called the reducer directly would pass while the component it exists for
// never re-rendered.

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Todo } from "@/shared/contract/todo";
import { FilterViewProvider, useFilterView, type FilterViewControl } from "./filter-view-context";

const { mockAnnounce } = vi.hoisted(() => ({ mockAnnounce: vi.fn() }));
vi.mock("@/client/feedback/announcer", () => ({
  useAnnounce: () => mockAnnounce,
}));

// The preference is read through the motion module, which is the product's one
// reader of it (Story 2.5 AC2). Stubbed here rather than through `matchMedia`,
// so a case can say "still" in one line and mean it.
const { mockReducedMotion } = vi.hoisted(() => ({
  mockReducedMotion: vi.fn(() => false),
}));
vi.mock("@/client/motion/motion", () => ({
  useReducedMotion: () => mockReducedMotion(),
}));

const todo = (id: string, text: string, completed: boolean): Todo => ({
  id,
  text,
  completed,
  createdAt: "2026-09-23T09:00:00.000Z",
});

const active = todo("0199a5c5-0000-7000-8000-000000000001", "book dentist", false);
const other = todo("0199a5c5-0000-7000-8000-000000000002", "send invoice", false);

let container: HTMLElement;
let root: Root;

beforeEach(() => {
  mockAnnounce.mockClear();
  mockReducedMotion.mockReturnValue(false);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = false;
});

/** Mount the provider and hand back a live handle on the control it provides. */
async function mount() {
  const seen: { current: FilterViewControl | null } = { current: null };

  function Probe() {
    seen.current = useFilterView();
    return null;
  }

  await act(async () => {
    root.render(
      <FilterViewProvider>
        <Probe />
      </FilterViewProvider>,
    );
  });

  return {
    /** The control as of the last commit. Read it fresh on every assertion. */
    get control() {
      if (seen.current === null) throw new Error("the provider did not render");
      return seen.current;
    },
    act: (run: (control: FilterViewControl) => void) =>
      act(async () => {
        if (seen.current === null) throw new Error("the provider did not render");
        run(seen.current);
      }),
  };
}

describe("the selection", () => {
  it("is All on a fresh mount, with nothing read from anywhere (AC9)", async () => {
    const view = await mount();
    expect(view.control.view).toBe("all");
  });

  it("shows the view that was selected", async () => {
    const view = await mount();
    await view.act((control) => control.select("completed"));
    expect(view.control.view).toBe("completed");
  });

  it("shows All when an add confirms (AC7)", async () => {
    const view = await mount();
    await view.act((control) => control.select("completed"));
    await view.act((control) => control.showAll());
    expect(view.control.view).toBe("all");
  });

  it("refuses to be read outside its provider", async () => {
    // The `useAnnounce()` convention: a component that silently read `all`
    // forever would paint correctly once and wrongly after every interaction,
    // which is the class of bug no test and no reviewer sees.
    function Orphan() {
      useFilterView();
      return null;
    }
    const noise = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => {
      act(() => {
        root.render(<Orphan />);
      });
    }).toThrow(/outside <FilterViewProvider>/);
    noise.mockRestore();
  });
});

describe("a row leaving the view (AC13, AC15, AC17)", () => {
  it("marks the row leaving, and announces only when it has left", async () => {
    const view = await mount();
    await view.act((control) => control.select("active"));
    await view.act((control) => control.noteToggle(active, true));

    // Still on screen, still Active-view business, and silent: the hold has
    // not finished, and AC15 ties the announcement to the departure, not to
    // the toggle that started it.
    expect(view.control.isDeparting(active.id)).toBe(true);
    expect(mockAnnounce).not.toHaveBeenCalled();

    await view.act((control) => control.endDeparture(active.id));

    expect(view.control.isDeparting(active.id)).toBe(false);
    expect(mockAnnounce).toHaveBeenCalledExactlyOnceWith(
      "book dentist, removed from Active",
      "polite",
    );
  });

  it("starts no departure in the All view (AC17)", async () => {
    const view = await mount();
    await view.act((control) => control.noteToggle(active, true));
    expect(view.control.isDeparting(active.id)).toBe(false);
    expect(mockAnnounce).not.toHaveBeenCalled();
  });

  it("announces a row that has already left exactly once", async () => {
    // `transitionend` bubbles and a row can be told twice. The second call has
    // nothing to release, so it says nothing.
    const view = await mount();
    await view.act((control) => control.select("active"));
    await view.act((control) => control.noteToggle(active, true));
    await view.act((control) => control.endDeparture(active.id));
    await view.act((control) => control.endDeparture(active.id));
    expect(mockAnnounce).toHaveBeenCalledTimes(1);
  });

  it("ignores a departure report from a row that was not leaving", async () => {
    const view = await mount();
    await view.act((control) => control.select("active"));
    await view.act((control) => control.endDeparture(active.id));
    expect(mockAnnounce).not.toHaveBeenCalled();
  });

  it("cancels the departure when the row matches again", async () => {
    // Toggled back inside the hold. The row belongs in the view again, so it
    // stays — and nothing is announced, because nothing left.
    const view = await mount();
    await view.act((control) => control.select("active"));
    await view.act((control) => control.noteToggle(active, true));
    await view.act((control) => control.noteToggle(active, false));

    expect(view.control.isDeparting(active.id)).toBe(false);
    expect(mockAnnounce).not.toHaveBeenCalled();
  });

  it("lets two rows leave at once, each announcing itself", async () => {
    // Tab, Space, Tab, Space is comfortably inside one departure. A single
    // departing slot would evict the first row mid-animation — it would vanish
    // abruptly and never say that it left.
    const view = await mount();
    await view.act((control) => control.select("active"));
    await view.act((control) => control.noteToggle(active, true));
    await view.act((control) => control.noteToggle(other, true));

    expect(view.control.isDeparting(active.id)).toBe(true);
    expect(view.control.isDeparting(other.id)).toBe(true);

    await view.act((control) => control.endDeparture(other.id));
    await view.act((control) => control.endDeparture(active.id));

    expect(mockAnnounce.mock.calls).toEqual([
      ["send invoice, removed from Active", "polite"],
      ["book dentist, removed from Active", "polite"],
    ]);
  });

  it("drops departures that belonged to the view being left", async () => {
    // A departure is a row leaving a *particular* view. Change the view and
    // the premise is gone: the row either belongs to the new view or it does
    // not, and either way it should not be mid-animation about the old one.
    const view = await mount();
    await view.act((control) => control.select("active"));
    await view.act((control) => control.noteToggle(active, true));
    await view.act((control) => control.select("all"));

    expect(view.control.isDeparting(active.id)).toBe(false);
  });
});

describe("reduced motion (AC16)", () => {
  it("cuts to the end state and still announces", async () => {
    // No hold, no fade, no collapse — and therefore no `transitionend`, which
    // is why the row never joins the departing set rather than joining it with
    // the animation zeroed. A row parked there would never leave.
    mockReducedMotion.mockReturnValue(true);
    const view = await mount();
    await view.act((control) => control.select("active"));
    await view.act((control) => control.noteToggle(active, true));

    expect(view.control.isDeparting(active.id)).toBe(false);
    expect(mockAnnounce).toHaveBeenCalledExactlyOnceWith(
      "book dentist, removed from Active",
      "polite",
    );
  });

  it("says nothing when the row was not leaving anyway", async () => {
    mockReducedMotion.mockReturnValue(true);
    const view = await mount();
    await view.act((control) => control.noteToggle(active, true));
    expect(mockAnnounce).not.toHaveBeenCalled();
  });
});

describe("a row leaving for good (Story 5.3 AC1, AC3)", () => {
  it("marks the row deleting, silently, and lets it go on its own report", async () => {
    const view = await mount();
    await view.act((control) => control.noteDelete(active.id));

    // Still on screen, so there is something to collapse — and it is *this*
    // kind of departure, which is what decides which recipe runs.
    expect(view.control.isDeleting(active.id)).toBe(true);
    expect(view.control.isDeparting(active.id)).toBe(true);

    await view.act((control) => control.endDeparture(active.id));

    expect(view.control.isDeleting(active.id)).toBe(false);
    // Silent at both ends. `${text}, deleted` belongs to the mutation's
    // success, where the server has actually agreed — announcing it here would
    // announce a removal the server may still refuse.
    expect(mockAnnounce).not.toHaveBeenCalled();
  });

  it("starts a delete in every view, unlike a toggle", async () => {
    // A toggle departs only when the row stops matching the view (AC17); a
    // delete always departs, because the row is leaving the product.
    const view = await mount();
    await view.act((control) => control.noteToggle(active, true));
    expect(view.control.isDeparting(active.id)).toBe(false);

    await view.act((control) => control.noteDelete(active.id));
    expect(view.control.isDeleting(active.id)).toBe(true);
  });

  it("tells a delete apart from a toggle, and never confuses the two", async () => {
    const view = await mount();
    await view.act((control) => control.select("active"));
    await view.act((control) => control.noteToggle(active, true));
    await view.act((control) => control.noteDelete(other.id));

    expect(view.control.isDeleting(active.id)).toBe(false);
    expect(view.control.isDeleting(other.id)).toBe(true);
    expect(view.control.isDeparting(active.id)).toBe(true);

    await view.act((control) => control.endDeparture(other.id));
    await view.act((control) => control.endDeparture(active.id));

    // One announcement, the toggle's. The delete's is the mutation's.
    expect(mockAnnounce.mock.calls).toEqual([
      ["book dentist, removed from Active", "polite"],
    ]);
  });

  it("replaces a departure already in flight for the same row", async () => {
    // Toggled out of the view, then deleted inside the hold. The row is leaving
    // for good now, so the delete's collapse is the one that should run — and
    // the toggle's announcement goes with it, because the row is not "removed
    // from Active", it is gone.
    const view = await mount();
    await view.act((control) => control.select("active"));
    await view.act((control) => control.noteToggle(active, true));
    await view.act((control) => control.noteDelete(active.id));

    expect(view.control.isDeleting(active.id)).toBe(true);

    await view.act((control) => control.endDeparture(active.id));
    expect(mockAnnounce).not.toHaveBeenCalled();
  });

  it("survives a change of Filter View, which a toggle's departure does not", async () => {
    // The asymmetry is the point, and it is a correctness rule rather than a
    // nicety. A toggle's departure belongs to the view it was leaving, so
    // changing view discards it. A delete's departure is what will remove the
    // Todo — discard it and a confirmed row sits there undeleted with no
    // request ever sent, which is one tab press away from happening.
    const view = await mount();
    await view.act((control) => control.select("active"));
    await view.act((control) => control.noteToggle(other, true));
    await view.act((control) => control.noteDelete(active.id));

    await view.act((control) => control.select("all"));

    expect(view.control.isDeparting(other.id)).toBe(false);
    expect(view.control.isDeleting(active.id)).toBe(true);
  });

  it("survives the row being toggled inside its own collapse", async () => {
    // The same rule as the view change, reached from the other writer. A
    // toggled-back row cancels its *toggle* departure — it matches the view
    // again — but a delete's collapse ends in a cache write nothing else will
    // make, so cancelling it would leave the row on screen at full height,
    // confirmed, undeleted, with no request ever sent.
    const view = await mount();
    await view.act((control) => control.select("active"));
    await view.act((control) => control.noteToggle(other, true));
    await view.act((control) => control.noteDelete(active.id));

    // `active` is Active and the view is Active, so this is the toggled-back
    // branch: it cancels by id, and the delete has to be exempt from it.
    await view.act((control) => control.noteToggle(active, false));
    expect(view.control.isDeleting(active.id)).toBe(true);

    // And the toggle's own departure for a *different* row is still cancelled
    // by that branch when its row matches again.
    await view.act((control) => control.noteToggle(other, false));
    expect(view.control.isDeparting(other.id)).toBe(false);
  });

  it("survives a refused toggle cancelling departures for the same row", async () => {
    // `todo-list.tsx` hands `cancelDepartures([todo.id])` to the toggle's
    // refusal seam, so a `PATCH` refused while a row is collapsing out on a
    // confirmed delete lands here naming that very row. It must take the
    // toggle's departure and leave the delete's.
    const view = await mount();
    await view.act((control) => control.select("active"));
    await view.act((control) => control.noteToggle(other, true));
    await view.act((control) => control.noteDelete(active.id));

    await view.act((control) => control.cancelDepartures([active.id, other.id]));

    expect(view.control.isDeleting(active.id)).toBe(true);
    expect(view.control.isDeparting(other.id)).toBe(false);
  });

  it("records nothing at all under reduced motion (AC3)", async () => {
    // With `transition: none` no `transitionend` ever fires, so a row parked in
    // the set would never leave. `todo-list.tsx` reads the same preference and
    // removes the Todo in the same tick instead.
    mockReducedMotion.mockReturnValue(true);
    const view = await mount();
    await view.act((control) => control.noteDelete(active.id));

    expect(view.control.isDeleting(active.id)).toBe(false);
    expect(view.control.isDeparting(active.id)).toBe(false);
    expect(mockAnnounce).not.toHaveBeenCalled();
  });

  it("says nothing when a delete is released rather than reported", async () => {
    // The preference flipping to `reduce` mid-collapse. The row is let go with
    // no sentence of its own; `todo-list.tsx` is what still delivers the
    // removal, which `todo-list.render.test.tsx` drives.
    const view = await mount();
    await view.act((control) => control.noteDelete(active.id));
    await view.act((control) => control.releaseDepartures([active.id]));

    expect(view.control.isDeleting(active.id)).toBe(false);
    expect(mockAnnounce).not.toHaveBeenCalled();
  });
});
