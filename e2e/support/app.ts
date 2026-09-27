import { AxeBuilder } from "@axe-core/playwright";
import { expect, test, type Locator, type Page, type Request } from "@playwright/test";

// The vocabulary every end-to-end spec speaks. One module, for two reasons.
//
// The first is ordinary: a locator derived once from the product's own markup
// is a locator that cannot drift per file. There is no `data-testid` anywhere
// in this repository and Epic 6 adds none — a test hook exists only to be
// tested against, so every locator below is a role, an accessible name, or a
// class the design system already names.
//
// Story 6.2 is the one story in this epic permitted to touch product source,
// and the `#sticky-top-block` id `stickyBlock()` reaches for is the single
// place that shows up here. It is not a test hook: the product's own
// measurement hook resolves the block by that id at runtime
// (`src/client/device/sticky-block-offset.ts`), where it is a constant in
// `src/client/device/sticky-block-contract.ts`.
//
// It is spelled out as a literal here, and that is a deliberate trade rather
// than an oversight. This module imports nothing from `src/` — see the
// paragraph below, which is why — so it cannot import that constant, and a
// rename would be caught by these specs failing rather than by the compiler.
// The same applies to `--sticky-block-height` in `audit-focus.spec.ts`. Both
// are the product's own names, read from the running page; neither exists
// only for the tests.
//
// The second is a taboo. `announcer.test.ts` walks the whole tree and fails
// any file that *declares* a live region, and `e2e/` is not among the
// directories it skips. `liveRegion()` below reads the regions by attribute
// presence and asks each one what it is, so the declaration form appears in
// this repository exactly where it belongs: `src/client/feedback/announcer.tsx`.
// Keeping that in one file is what keeps it out of four spec files.
//
// Note also what this file is NOT exempt from. `middleware.test.ts` excuses
// `.spec.ts` from its minting scan; this module is not a spec file and is
// excused by nothing. It declares no shape the contract already owns, names no
// query key, and imports nothing from `src/`.

// One later addition breaks the "imports nothing" rule above, and does so
// knowingly. The conformance scan at the foot of this file imports
// `@axe-core/playwright`, because the rules it applies are the standard's and
// not this repository's — the one thing in the whole suite that is better
// borrowed than written. It still imports nothing from `src/`, declares no
// shape the contract owns, and names no query key.

/** The product's own strings, asserted by equality and never paraphrased. */
export const LOAD_FAILED = "Couldn't load your Todos.";
export const ADD_FAILED = "Couldn't add that Todo.";
/** An update and a delete share one sentence, because they share a shape. */
export const SAVE_FAILED = "Couldn't save that change.";
export const RETRY = "Retry";

export const FIRST_RUN_LINE = "Nothing here yet.";
export const FIRST_RUN_SUB = "Type above to add your first Todo.";
export const NOTHING_ACTIVE = "Nothing active.";
export const NOTHING_COMPLETED = "Nothing completed yet.";

export const DIALOG_TITLE = "Delete this Todo?";
export const ADD_INPUT_LABEL = "what needs doing?";

/** Everything under `/api/todos` exactly — the list endpoint, GET and POST. */
export const LIST_ROUTE = "**/api/todos";
/** One Todo — PATCH and DELETE. */
export const ITEM_ROUTE = "**/api/todos/*";

// --- Locators ---------------------------------------------------------------

export function addInput(page: Page): Locator {
  return page.getByRole("textbox", { name: ADD_INPUT_LABEL });
}

export function todoList(page: Page): Locator {
  return page.getByRole("list", { name: "Todo List" });
}

/**
 * The rows the user can see.
 *
 * The skeletons are `aria-hidden`, so the listitem role never sees them; that
 * is the whole reason `skeletons()` below reaches for a class instead.
 */
export function rows(page: Page): Locator {
  return todoList(page).getByRole("listitem");
}

export function row(page: Page, text: string): Locator {
  return rows(page).filter({ hasText: text });
}

/** Every `<li>` in the region, skeletons included and in document order. */
export function listChildren(page: Page): Locator {
  return todoList(page).locator("li");
}

/** The row's checkbox. Its accessible name is the Todo's text (`aria-labelledby`). */
export function checkbox(page: Page, text: string): Locator {
  return page.getByRole("checkbox", { name: text });
}

/**
 * The row's delete control.
 *
 * Never `getByRole('button', { name: 'Delete' })` — that collides with the
 * dialog's confirm button. Each row's control is named `Delete {text}`.
 */
export function deleteControl(page: Page, text: string): Locator {
  return page.getByRole("button", { name: `Delete ${text}` });
}

export function skeletons(page: Page): Locator {
  return page.locator("li.skeleton-row");
}

export function emptyPanel(page: Page): Locator {
  return page.locator(".empty-panel");
}

/**
 * The banner region.
 *
 * Assertions are scoped to it rather than made on the page, because the
 * assertive live region carries the same sentence and a page-wide text match
 * would resolve to two elements.
 */
export function banner(page: Page): Locator {
  return page.locator(".banner-region");
}

export function retryControl(page: Page): Locator {
  return page.getByRole("button", { name: RETRY });
}

export function filterTabs(page: Page): Locator {
  return page.getByRole("tablist", { name: "Filter View" });
}

/**
 * One filter tab.
 *
 * The accessible name carries the count (`All 4`), so the name is matched as a
 * pattern and the count is asserted separately where it is the point.
 */
export function filterTab(page: Page, label: "All" | "Active" | "Completed"): Locator {
  return filterTabs(page).getByRole("tab", { name: new RegExp(`^${label} \\d+$`) });
}

export function deleteDialog(page: Page): Locator {
  return page.getByRole("dialog");
}

export function confirmDelete(page: Page): Locator {
  return deleteDialog(page).getByRole("button", { name: "Delete", exact: true });
}

export function cancelDelete(page: Page): Locator {
  return deleteDialog(page).getByRole("button", { name: "Cancel" });
}

// --- The live regions -------------------------------------------------------

/**
 * One of the announcer's two regions, chosen by urgency.
 *
 * Located by attribute *presence* and then asked what it is, which is the
 * shape `announcer.test.ts`'s scan permits: the declaration form it forbids
 * needs an `=` or a `:` after the name, and neither appears here. The
 * `sr-only` qualifier matters too — Next.js mounts a route announcer of its
 * own, so the unqualified selector resolves to three elements, not two.
 *
 * Assert with `toContainText`, never `toHaveText`: `liveRegionText` appends a
 * trailing space on every even-numbered announcement, so the region's text is
 * the message *or* the message plus a space.
 */
export async function liveRegion(
  page: Page,
  urgency: "polite" | "assertive",
): Promise<Locator> {
  const regions = page.locator(".sr-only[aria-live]");
  await expect(regions).toHaveCount(2);
  for (let index = 0; index < 2; index += 1) {
    const region = regions.nth(index);
    if ((await region.getAttribute("aria-live")) === urgency) return region;
  }
  throw new Error(`No ${urgency} live region is mounted.`);
}

// --- Driving the product ----------------------------------------------------

/**
 * Add a Todo the way a person does: focus the field, type, press Enter.
 *
 * The click is not decoration. The field autofocuses only where
 * `matchMedia("(pointer: fine)")` settles `"fine"`, so in the touch project
 * nothing is focused on arrival and a bare `press` would go to the document.
 *
 * Returns the row, and only once the *server* has it. Stopping at the
 * optimistic row would make every fixture a race: the context could be closed
 * or the page reloaded with the `POST` still in flight, and — the subtler one
 * — a create confirming later snaps the Filter View back to All underneath a
 * test that had deliberately moved off it. Both were real failures before this
 * waited.
 */
export async function addTodo(page: Page, text: string): Promise<Locator> {
  const field = addInput(page);
  await field.click();
  await field.fill(text);
  const confirmed = apiResponse(page, "POST", "/api/todos");
  await field.press("Enter");
  const created = row(page, text);
  await expect(created).toHaveCount(1);
  await confirmed;
  // `onSuccess` is what sets the Filter View to All, and it runs a tick after
  // the response lands. Waiting for it here is what makes the snap-back
  // finished rather than pending when this function returns.
  await expect(filterTab(page, "All")).toHaveAttribute("aria-selected", "true");
  return created;
}

/**
 * Several Todos, oldest first.
 *
 * Ids are minted client-side as uuidv7 and the list is ordered `id DESC`, so
 * the display order is the reverse of the order given here.
 */
export async function seed(page: Page, texts: readonly string[]): Promise<void> {
  for (const text of texts) {
    await addTodo(page, text);
  }
}

/**
 * The text of every visible row, top to bottom, read once.
 *
 * A bare read, so it answers `[]` for a list that has not landed yet as
 * readily as for one that is empty. Use it only where the list is known to be
 * on screen already; everywhere else — and after every reload — use
 * `expectRowTexts`, which polls.
 */
export async function rowTexts(page: Page): Promise<string[]> {
  return rows(page).evaluateAll((items) =>
    items.map((item) => item.textContent?.trim() ?? ""),
  );
}

/** The list reads exactly this, top to bottom — waited for, not snapshotted. */
export async function expectRowTexts(
  page: Page,
  expected: readonly string[],
): Promise<void> {
  await expect.poll(() => rowTexts(page)).toEqual([...expected]);
}

/**
 * Reveal a row's delete control by the route this project's device offers.
 *
 * Touch: a leftward swipe, dispatched as real `touchstart`/`touchmove`/
 * `touchend`. `todo-row.tsx` handles React touch events and not pointer
 * events, so neither `touchscreen.tap()` nor the mouse drives it; the latch
 * needs the horizontal delta to exceed the vertical one and to pass 32px.
 *
 * Pointer: hover the row. The reveal is `@media (pointer: fine) .group:hover
 * &`, so it is the *row* that must be hovered, and the control cannot be
 * clicked before it is — at rest it carries `pointer-events: none` and the row
 * surface underneath it takes the hit.
 */
export async function revealDeleteControl(page: Page, text: string): Promise<void> {
  const target = row(page, text);
  if (test.info().project.name !== "touch") {
    await target.hover();
    return;
  }

  const box = await target.boundingBox();
  if (box === null) throw new Error(`The row "${text}" has no box to swipe.`);
  const handle = await target.elementHandle();
  const y = box.y + box.height / 2;
  const from = box.x + box.width - 10;
  const touch = (x: number) => ({
    identifier: 0,
    clientX: x,
    clientY: y,
    target: handle,
  });

  await target.dispatchEvent("touchstart", {
    touches: [touch(from)],
    changedTouches: [touch(from)],
    targetTouches: [touch(from)],
  });
  await target.dispatchEvent("touchmove", {
    touches: [touch(from - 80)],
    changedTouches: [touch(from - 80)],
    targetTouches: [touch(from - 80)],
  });
  await target.dispatchEvent("touchend", {
    touches: [],
    changedTouches: [],
    targetTouches: [],
  });

  await expect(target).toHaveAttribute("data-revealed", "true");
}

/** Reveal the control and press it, leaving the confirmation dialog open. */
export async function openDeleteDialog(page: Page, text: string): Promise<void> {
  await revealDeleteControl(page, text);
  await deleteControl(page, text).click();
  await expect(deleteDialog(page)).toBeVisible();
}

/**
 * Nothing that teaches, anywhere on screen.
 *
 * SM-1 is "without instruction", and UJ-4's step 2 spells out what that means:
 * "no tour, no tooltip, no welcome modal, and nothing to dismiss". This is
 * that sentence made executable. The deferred first-run swipe nudge is checked
 * separately, by `expectNoFirstRunNudge`.
 */
export async function expectNothingInstructional(page: Page): Promise<void> {
  const teaching = [
    '[role="tooltip"]',
    "[popover]",
    "[data-tour]",
    "[data-onboarding]",
    "[data-nudge]",
    '[class*="tour"]',
    '[class*="tooltip"]',
    '[class*="coach"]',
    '[class*="onboarding"]',
    '[class*="walkthrough"]',
    '[class*="nudge"]',
  ].join(", ");
  await expect(page.locator(teaching)).toHaveCount(0);
  await expect(
    page.getByRole("button", {
      name: /got it|dismiss|skip|take a tour|show me|learn more|next tip/i,
    }),
  ).toHaveCount(0);
}

/**
 * The first-run swipe nudge is absent, and asserted so rather than expected.
 *
 * EXPERIENCE.md UJ-4 step 7 has the topmost row sliding ~24px and settling
 * back to expose a sliver of the delete lane. Story 5.D1 is deferred and that
 * beat is not in the shipped product, so this asserts the row is at rest: not
 * revealed, and its delete control still fully transparent. `toBeVisible()`
 * would be true even at rest — the control is hidden by `opacity`, not by
 * `display` — so the opacity is what is asserted.
 */
export async function expectNoFirstRunNudge(page: Page, text: string): Promise<void> {
  await expect(row(page, text)).not.toHaveAttribute("data-revealed", "true");
  await expect(deleteControl(page, text)).toHaveCSS("opacity", "0");
}

// --- Route interception -----------------------------------------------------

/**
 * The next answer the server gives to this method and path.
 *
 * Start it *before* the action that causes the request, then await it after —
 * that ordering is what makes it a barrier rather than a guess. Optimistic
 * assertions say what the page did; this says what the server did, and a
 * reload asserts the second, never the first.
 */
export function apiResponse(
  page: Page,
  method: string,
  path: string,
): ReturnType<Page["waitForResponse"]> {
  return page.waitForResponse(
    (response) =>
      response.request().method() === method &&
      new URL(response.url()).pathname.startsWith(path),
  );
}

export type HeldRequest = {
  /** Resolves once the request has been intercepted and is being held. */
  reached: Promise<void>;
  /** Let it through to the server. */
  release: () => void;
  /** Fail it the way a dropped connection does — no status, no body. */
  drop: () => void;
};

/**
 * Hold the next request matching `method` and `pattern` open indefinitely.
 *
 * One request only: everything else, and everything after it, falls through to
 * the network. That is what makes `Retry` observable — the retry's request is
 * the real one, answered by the real server.
 *
 * Holding rather than delaying is deliberate. A test that needs a failure to
 * arrive *after* an animation has finished can assert the animation finished
 * and only then `drop()`, which is a web-first assertion doing the waiting
 * instead of a timer guessing at it.
 */
export async function holdOpen(
  page: Page,
  method: string,
  pattern: string,
): Promise<HeldRequest> {
  let markReached = (): void => {};
  const reached = new Promise<void>((resolve) => {
    markReached = resolve;
  });
  let settle: (outcome: "release" | "drop") => void = () => {};
  const decision = new Promise<"release" | "drop">((resolve) => {
    settle = resolve;
  });

  let taken = false;
  await page.route(pattern, async (route) => {
    if (taken || route.request().method() !== method) {
      await route.fallback();
      return;
    }
    taken = true;
    markReached();
    const outcome = await decision;
    if (outcome === "drop") await route.abort();
    else await route.fallback();
  });

  return {
    reached,
    release: () => settle("release"),
    drop: () => settle("drop"),
  };
}

/**
 * Fail the next matching request, and only that one.
 *
 * `route.abort()` and not a 500: the client gives up on a 500 and on a dropped
 * connection by the same path, and a transport failure is the one an
 * end-to-end test can produce without a server that has to be taught to
 * misbehave.
 */
export async function failNext(
  page: Page,
  method: string,
  pattern: string,
): Promise<HeldRequest> {
  const held = await holdOpen(page, method, pattern);
  held.drop();
  return held;
}

/**
 * The uncertain failure: the server commits, the page never hears.
 *
 * `route.fetch()` forwards the request and waits for the real answer — so the
 * row is written — and `route.abort()` then hands the page a transport error.
 * A server error would be a *certain* failure and a bare `abort()` never
 * reaches the server at all; this is the only shape that produces the state
 * AC12 is about.
 */
export async function commitThenDrop(
  page: Page,
  method: string,
  pattern: string,
): Promise<void> {
  let taken = false;
  await page.route(pattern, async (route) => {
    if (taken || route.request().method() !== method) {
      await route.fallback();
      return;
    }
    taken = true;
    await route.fetch();
    await route.abort();
  });
}

export type RequestLog = {
  /** Every matching request, in the order the page issued it. */
  all: () => Request[];
  count: () => number;
  /** The parsed JSON body of the request at `index`. */
  body: (index: number) => unknown;
};

/** Record every request the page makes with this method against this path. */
export function recordRequests(page: Page, method: string, path: string): RequestLog {
  const seen: Request[] = [];
  page.on("request", (request) => {
    if (request.method() === method && new URL(request.url()).pathname.startsWith(path)) {
      seen.push(request);
    }
  });
  return {
    all: () => [...seen],
    count: () => seen.length,
    body: (index: number) => {
      const raw = seen[index]?.postData();
      return raw === undefined || raw === null ? undefined : JSON.parse(raw);
    },
  };
}

/**
 * Ask the browser to re-evaluate focus, which makes the list query refetch.
 *
 * TanStack Query's focus manager listens for `visibilitychange` on `window`;
 * this is that event and nothing else. It is the only way to make a *second*
 * list read happen without reloading the document, and a reload would empty
 * the error slot — which is precisely what the test using this needs to keep.
 */
export async function refetchOnFocus(page: Page): Promise<void> {
  await page.evaluate(() => {
    window.dispatchEvent(new Event("visibilitychange"));
  });
}


// --- The audit's vocabulary (Story 6.2) --------------------------------------

/**
 * Exactly the ceiling, as one Todo (AC8).
 *
 * `TODO_TEXT_MAX_LENGTH` is 500 and this is 500 characters, built rather than
 * pasted so the count cannot drift by a space in an editor. Real words with
 * real spaces, because the question AC8 asks is about *wrapping*, and a
 * single 500-character token would wrap by `overflow-wrap: anywhere` alone and
 * would prove nothing about ordinary text.
 *
 * It ends in a full stop rather than the space the repetition lands on. HTML
 * collapses trailing whitespace, so a fixture ending in a space goes in at 500
 * characters and comes back out of `textContent` at 499 — which reads exactly
 * like the truncation this constant exists to disprove.
 */
export const LONG_TODO_TEXT = `${"the quick brown fox jumps over the lazy dog "
  .repeat(12)
  .slice(0, 499)}.`;

/** The block the whole audit is about. */
export function stickyBlock(page: Page): Locator {
  return page.locator("#sticky-top-block");
}

/**
 * The card, by the recipe that gives it its ceiling.
 *
 * `max-w-card-max-width` is the class DESIGN.md's `card-max-width` token
 * becomes, so this locator names the very property AC9 measures rather than a
 * position in the tree.
 */
export function card(page: Page): Locator {
  return page.locator(".max-w-card-max-width");
}

/**
 * A locator's bounding box, or a failure that says which locator had none.
 *
 * `boundingBox()` returns `null` for an element that is not rendered, and an
 * unchecked `null` propagates into the arithmetic below as `NaN`, which
 * compares false against everything and reports a clearance failure that is
 * really an absent element.
 */
export async function boxOf(
  locator: Locator,
  what: string,
): Promise<{ x: number; y: number; width: number; height: number }> {
  const box = await locator.boundingBox();
  expect(box, `${what} has no bounding box — it is not rendered`).not.toBeNull();
  return box!;
}

/**
 * The control is not even partially covered by the sticky block (AC3).
 *
 * Both rectangles, compared — not a screenshot and not `toBeInViewport()`,
 * which answers a different question and would pass for a control the block
 * is sitting on top of. The failure message carries both boxes because the
 * useful information is by how much and in which direction, and a boolean
 * throws that away.
 */
export async function assertClearOfStickyBlock(
  page: Page,
  control: Locator,
  what: string,
): Promise<void> {
  const block = await boxOf(stickyBlock(page), "the sticky block");
  const target = await boxOf(control, what);
  const blockBottom = block.y + block.height;

  expect(
    target.y,
    `${what} is covered by the sticky block: the block ends at y=${blockBottom.toFixed(1)} ` +
      `and the control starts at y=${target.y.toFixed(1)} ` +
      `(overlap ${(blockBottom - target.y).toFixed(1)}px)`,
  ).toBeGreaterThanOrEqual(blockBottom);
}

/**
 * Drive `Tab` and report what took focus, in order.
 *
 * Accessible names where there is one, otherwise a tag-and-id sketch, because
 * the assertion AC16 makes is about *reading* order and a name is what a
 * screen reader reads. Returns rather than asserts: the expected order is the
 * spec's, not this module's.
 */
export async function tabSequence(page: Page, steps: number): Promise<string[]> {
  const seen: string[] = [];
  for (let index = 0; index < steps; index += 1) {
    await page.keyboard.press("Tab");
    seen.push(
      await page.evaluate(() => {
        const element = document.activeElement;
        if (element === null || element === document.body) return "(body)";

        // The accessible name, in the order the platform computes it.
        // `aria-labelledby` has to be *resolved* — the attribute holds an id,
        // and reporting the id would make this read like a name while being
        // an implementation detail.
        const labelledBy = element.getAttribute("aria-labelledby");
        const referenced =
          labelledBy === null
            ? null
            : (document.getElementById(labelledBy)?.textContent?.trim() ?? null);

        const label =
          element.getAttribute("aria-label") ??
          referenced ??
          element.textContent?.trim() ??
          "";

        return `${element.tagName.toLowerCase()}${label === "" ? "" : `:${label}`}`;
      }),
    );
  }
  return seen;
}

/**
 * Every element on the page a user can operate (AC18).
 *
 * Resolved in the browser rather than assembled from named locators, because
 * the criterion is about the surface as a whole — a control nobody thought to
 * name is exactly the one whose hit area was never checked.
 */
export function interactiveElements(page: Page): Locator {
  return page.locator(
    "button, a[href], input, select, textarea, [tabindex]:not([tabindex='-1'])",
  );
}

// --- The conformance scan (WCAG AA) -----------------------------------------

/**
 * The tag set the scan asserts against.
 *
 * All four WCAG tags the engine offers below `wcag22`, and the set is not
 * abbreviated: conformance at AA requires every level-A criterion too, so
 * dropping `wcag21a` would leave the scan claiming 2.1 AA while skipping
 * 2.1's only level-A rule. That rule is `label-content-name-mismatch` (SC
 * 2.5.3 Label in Name), and it is live here rather than theoretical — a row's
 * checkbox takes its name from the Todo's text by `aria-labelledby` and the
 * delete control is named `Delete {text}`, which is exactly the shape the
 * criterion is about.
 *
 * Deliberately not `best-practice`: those rules are axe's own house style
 * rather than the standard, and a suite that fails on them stops being
 * evidence of conformance and starts being evidence of taste.
 */
export const WCAG_AA_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] as const;

/** Whatever `analyze()` reports, without importing axe-core's types directly. */
type AxeOutcome = Awaited<ReturnType<AxeBuilder["analyze"]>>;
type Violations = AxeOutcome["violations"];

/**
 * A scan's two answers: what failed, and what the engine could not decide.
 *
 * `incomplete` is carried rather than dropped because `color-contrast` is the
 * rule that lands there most often — against a background the engine cannot
 * resolve, or an element caught mid-transition, both of which this product
 * has. A suite that reports only `violations` would call a page conformant on
 * the strength of questions nobody answered.
 */
export type ScanOutcome = {
  violations: Violations;
  incomplete: Violations;
};

/**
 * Run axe over the whole page as it currently stands.
 *
 * The whole page, not a subtree: several of the rules that matter here are
 * about relationships between elements — a label and its control, a role and
 * its required parent, an id referenced from somewhere else — and a scan
 * scoped to one region reports those as failures of the region rather than of
 * the page.
 *
 * `disabled` exists for the one case the spec permits: a violation whose only
 * resolution is a design-token change (AD-13), recorded in `deferred-work.md`
 * and excluded here by id with a comment naming that entry. Never reach for
 * it to quiet a rule that has a real fix.
 */
export async function scanPage(
  page: Page,
  disabled: readonly string[] = [],
): Promise<ScanOutcome> {
  const builder = new AxeBuilder({ page }).withTags([...WCAG_AA_TAGS]);
  if (disabled.length > 0) builder.disableRules([...disabled]);
  const results = await builder.analyze();
  return { violations: results.violations, incomplete: results.incomplete };
}

/**
 * One line per offending node, rather than per rule.
 *
 * A rule that fails on four rows is four things to look at, and a message
 * that says "color-contrast (4 nodes)" makes the reader go and find them.
 * `failureSummary` is axe's own "fix any of the following" text and `helpUrl`
 * is the rule's explanation, so the failure is actionable without opening the
 * HTML report or looking the rule up.
 *
 * The selector is flattened rather than joined: in a frame-nested result an
 * entry is itself an array, and `join` on the outer list alone would splice a
 * stray comma into the middle of a selector. No frames today; this is the
 * shared vocabulary module, and the next reader should not have to notice.
 */
export function describeViolations(where: string, violations: Violations): string[] {
  return violations.flatMap((violation) =>
    violation.nodes.map((node) => {
      const target = [node.target].flat(2).join(" >>> ");
      const summary = node.failureSummary?.replace(/\s*\n\s*/g, " ") ?? "";
      return (
        `${where}: ${violation.id} [${violation.impact ?? "unrated"}] ` +
        `at ${target} — ${violation.help}` +
        `${summary === "" ? "" : ` (${summary})`} — ${violation.helpUrl}`
      );
    }),
  );
}

/**
 * The page conforms, and the failure says where and why.
 *
 * Compared as an array of strings rather than asserted on a count: an empty
 * expectation printed against a populated actual is the diff that tells the
 * reader everything, and a count tells them a number.
 *
 * What the engine could not decide is attached to the test as an annotation
 * rather than asserted on. An `incomplete` result is not a failure and must
 * not turn the suite red on a background axe happened not to resolve, but it
 * is also not nothing: it is the list of questions this run did not answer,
 * and it belongs in the report where a reader of a green run can still see it.
 */
export async function expectNoViolations(
  page: Page,
  where: string,
  disabled: readonly string[] = [],
): Promise<void> {
  const { violations, incomplete } = await scanPage(page, disabled);

  if (incomplete.length > 0) {
    test.info().annotations.push({
      type: "axe-incomplete",
      description: describeViolations(where, incomplete).join("; "),
    });
  }

  expect(
    describeViolations(where, violations),
    `WCAG AA violations ${where}`,
  ).toEqual([]);
}
