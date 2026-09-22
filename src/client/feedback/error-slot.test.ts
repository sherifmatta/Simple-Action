import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

import {
  EMPTY_ERROR_SLOT,
  errorSlotReducer,
  type ErrorSlot,
  type ErrorSlotEntry,
} from "./error-slot-state";

// Covers epics.md Story 1.7 AC4: the slot holds `{ kind, retry } | null`, and
// setting a new error replaces any existing one **without retrying the
// replaced operation**.
//
// The second half is the one that matters and the one that is easy to break —
// a provider that "helpfully" drains the old entry before replacing it would
// re-run a mutation the user never asked to repeat, against a row that may no
// longer exist. It is asserted here against the real transition function, in
// `environment: "node"`, with no DOM.

function entry(
  kind: ErrorSlotEntry["kind"],
  retry: () => void,
): ErrorSlotEntry {
  return { kind, retry };
}

describe("the error slot holds `{ kind, retry } | null` (AC4)", () => {
  it("starts empty", () => {
    expect(EMPTY_ERROR_SLOT).toBeNull();
  });

  it("holds exactly the two fields, and the kind comes from the shared contract", () => {
    const raised = errorSlotReducer(EMPTY_ERROR_SLOT, {
      type: "raise",
      error: entry("load", () => {}),
    });
    expect(raised).not.toBeNull();
    expect(Object.keys(raised!).sort()).toEqual(["kind", "retry"]);
    expect(raised!.kind).toBe("load");
    expect(typeof raised!.retry).toBe("function");
  });

  it("accepts each of the four contract kinds", () => {
    for (const kind of ["load", "create", "update", "delete"] as const) {
      const raised = errorSlotReducer(EMPTY_ERROR_SLOT, {
        type: "raise",
        error: entry(kind, () => {}),
      });
      expect(raised?.kind).toBe(kind);
    }
  });

  it("empties back to null", () => {
    const raised = errorSlotReducer(EMPTY_ERROR_SLOT, {
      type: "raise",
      error: entry("create", () => {}),
    });
    expect(errorSlotReducer(raised, { type: "clear" })).toBeNull();
  });
});

describe("a newer error replaces an older one, and the replaced operation is not retried (AC4)", () => {
  it("keeps only the newer entry", () => {
    const older = entry("load", vi.fn());
    const newer = entry("delete", vi.fn());

    const afterFirst = errorSlotReducer(EMPTY_ERROR_SLOT, {
      type: "raise",
      error: older,
    });
    const afterSecond = errorSlotReducer(afterFirst, {
      type: "raise",
      error: newer,
    });

    expect(afterSecond).toBe(newer);
    expect(afterSecond?.kind).toBe("delete");
  });

  it("never invokes the displaced closure", () => {
    const olderRetry = vi.fn();
    const newerRetry = vi.fn();

    let slot: ErrorSlot = EMPTY_ERROR_SLOT;
    slot = errorSlotReducer(slot, {
      type: "raise",
      error: entry("update", olderRetry),
    });
    slot = errorSlotReducer(slot, {
      type: "raise",
      error: entry("create", newerRetry),
    });

    expect(slot?.retry).toBe(newerRetry);
    expect(olderRetry).not.toHaveBeenCalled();
    expect(newerRetry).not.toHaveBeenCalled();
  });

  it("never invokes any closure, however many errors arrive", () => {
    const retries = [vi.fn(), vi.fn(), vi.fn(), vi.fn()];
    const kinds = ["load", "create", "update", "delete"] as const;

    let slot: ErrorSlot = EMPTY_ERROR_SLOT;
    retries.forEach((retry, index) => {
      slot = errorSlotReducer(slot, {
        type: "raise",
        error: entry(kinds[index]!, retry),
      });
    });
    slot = errorSlotReducer(slot, { type: "clear" });

    for (const retry of retries) {
      expect(retry).not.toHaveBeenCalled();
    }
    expect(slot).toBeNull();
  });

  it("is a pure transition — the same inputs give the same result, so React may call it twice", () => {
    const older = entry("load", vi.fn());
    const newer = entry("create", vi.fn());
    const action = { type: "raise", error: newer } as const;

    expect(errorSlotReducer(older, action)).toBe(
      errorSlotReducer(older, action),
    );
    expect(older.retry).not.toHaveBeenCalled();
  });
});

describe("the provider keeps the side effect out of the reducer", () => {
  const source = readFileSync(
    path.join(process.cwd(), "src", "client", "feedback", "error-slot.tsx"),
    "utf8",
  );
  const reducerSource = readFileSync(
    path.join(
      process.cwd(),
      "src",
      "client",
      "feedback",
      "error-slot-state.ts",
    ),
    "utf8",
  );

  it("invokes the retry closure in the provider, not in the reducer", () => {
    // React double-invokes reducers under Strict Mode in development; a
    // `retry` case in the reducer would re-attempt the failed operation twice
    // per click. The strippable comments in the reducer module explain this,
    // so the assertion is on code, not prose.
    const withoutComments = reducerSource
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    expect(withoutComments).not.toMatch(/\.retry\s*\(/);
    expect(source).toMatch(/entry\?\.retry\(\)/);
  });

  it("is a Client Component", () => {
    expect(source.trimStart().startsWith('"use client"')).toBe(true);
  });

  it("clears the slot BEFORE invoking the closure, so a throwing or re-raising retry cannot strand it", () => {
    // Order is load-bearing in both directions:
    //  - a closure that throws would otherwise leave the banner up forever,
    //    because the `clear` after it never runs;
    //  - a closure that synchronously raises a *new* error — a retry that
    //    fails again, the ordinary case — would otherwise have that new error
    //    wiped by the `clear` queued behind it.
    const body = source.slice(
      source.indexOf("retryCurrentError = useCallback"),
    );
    const clearAt = body.indexOf('type: "clear"');
    const retryAt = body.indexOf("?.retry()");
    expect(clearAt).toBeGreaterThan(-1);
    expect(retryAt).toBeGreaterThan(-1);
    expect(
      clearAt,
      "dispatch({ type: 'clear' }) must precede the retry() call",
    ).toBeLessThan(retryAt);
  });

  it("reads the entry before clearing, so the closure is not lost to the dispatch", () => {
    const body = source.slice(
      source.indexOf("retryCurrentError = useCallback"),
    );
    expect(body).toMatch(/const entry = error;/);
  });
});
