import { describe, expect, it } from "vitest";

import { config } from "./middleware";

// The matcher is the one non-trivial invariant in Story 1.1 that nothing else
// pins: a regex whose four branches each encode a decision, checked by no
// compiler and no other test. Story 1.6 mints the Client Identity cookie in
// this middleware, so a path that reaches it wrongly issues a credential on a
// request AD-17 says must never carry one.
//
// This pins the lookahead itself, not Next.js's path-to-regexp conversion of
// the whole matcher string — the lookahead is where every one of those
// decisions lives, and it is what a future edit would get wrong.
//
// The conversion is checked by `next build`, which rejects the matcher
// outright if it holds a capturing group; the case below therefore also
// asserts that every group here stays non-capturing, so that failure surfaces
// in this suite rather than only at build time.

const [matcher] = config.matcher;

const lookahead = new RegExp(`^${matcher}$`);

const runsMiddleware = (pathname: string) => lookahead.test(pathname);

describe("middleware matcher", () => {
  it("adds no capturing group beyond the outer one — `next build` rejects the rest", () => {
    // Next.js wraps the matcher and hands it to path-to-regexp, which allows
    // the single outer capture that every Next matcher uses and rejects any
    // other with "Capturing groups are not allowed". Spelling the alternations
    // inside the lookahead as `(/|$)` rather than `(?:/|$)` fails the build,
    // not this suite — so the count is asserted here.
    const capturingGroups = new RegExp(`${matcher}|`).exec("")!.length - 1;
    expect(capturingGroups).toBe(1);
  });

  it.each([
    ["/", "the root document"],
    ["/todos", "a document route"],
    ["/api-docs", "a sibling route that merely starts with `api`"],
    ["/_nextdoor", "a sibling route that merely starts with `_next`"],
  ])("runs on %s — %s", (pathname) => {
    expect(runsMiddleware(pathname)).toBe(true);
  });

  it.each([
    ["/api/todos", "a nested API route"],
    // Regression, 2026-09-21 code review: the original lookahead spelled these
    // `api/` and `_next/`, so the extensionless forms below fell through to
    // the middleware.
    ["/api", "the extensionless API root"],
    ["/_next", "the extensionless Next.js root"],
    ["/_next/static/chunk.js", "a build asset"],
    ["/robots.txt", "a file with an extension"],
    ["/favicon.ico", "a file with an extension"],
    ["/_next/data/build/todos.json", "a data route"],
  ])("does not run on %s — %s", (pathname) => {
    expect(runsMiddleware(pathname)).toBe(false);
  });
});
