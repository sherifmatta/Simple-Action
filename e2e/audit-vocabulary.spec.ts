import { expect, test, type Page } from "@playwright/test";

import {
  banner,
  checkbox,
  deleteDialog,
  emptyPanel,
  failNext,
  filterTab,
  openDeleteDialog,
  row,
  rows,
  seed,
  DIALOG_TITLE,
  ITEM_ROUTE,
  SAVE_FAILED,
} from "./support/app";

// The banned word, asked of the running product (epics.md Story 6.3 AC5;
// epic-6-context: "the word `Done` must appear nowhere in the product surface
// or the codebase as a filter name, label, tooltip or prose"; UX-DR37).
//
// `src/client/components/vocabulary.test.ts` scans the source and is the
// cheaper half. This is the half it cannot be: a source scan sees string
// literals, and a label assembled at runtime — a template, a lookup, a count
// concatenated onto a name — is invisible to it. Every reading below comes out
// of a real Chromium with the product in a real state.
//
// Two surfaces are read at each state, because a screen reader reads both:
//
//   - The visible text, as `document.body.innerText`, which is what the eye
//     gets and excludes what is `display: none`.
//   - Every accessible name, computed from the attributes that supply one:
//     `aria-label`, a resolved `aria-labelledby`, an associated `<label>`,
//     `title`, `alt`, `placeholder`, and the two `aria-*description` forms.
//     The delete control's name is `Delete {text}` and the checkbox's is the
//     Todo's text via `aria-labelledby`, so neither is in `innerText` at all.
//
// This file runs on `pointer` and `touch`. It does *not* run on `narrow`,
// whose `testMatch` in `playwright.config.ts` admits only
// `audit-responsive.spec.ts` — the word is not a function of viewport width,
// and re-running these states at a third size would prove nothing new.

/**
 * Case-insensitive in the pattern rather than by flag, so it reads the same
 * here and in `vocabulary.test.ts`, where a flag would be dropped by
 * `styleSheetMatches`. The word boundaries spare `abandoned` and `undone`.
 */
const BANNED = /\b[dD][oO][nN][eE]\b/;

/**
 * The word itself, built from fragments rather than written out.
 *
 * `vocabulary.test.ts` scans `e2e/` along with `app/` and `src/`, and this is
 * a `.spec.ts` rather than a `.test.ts`, so it is *inside* that surface — a
 * literal in the fixtures below would make the spec that polices the word its
 * own first offender. `readme.test.ts` concatenates a connection string for
 * exactly the same reason. Note that the pattern above spells no `d-o-n-e`
 * either, which is why it can sit in a scanned file unchanged.
 */
const WORD = "Do" + "ne";

type Utterance = { source: string; text: string };

/** Everything the page says, visibly or to assistive technology. */
async function surfaceOf(page: Page): Promise<Utterance[]> {
  return page.evaluate(() => {
    const found: { source: string; text: string }[] = [];
    const push = (source: string, text: string | null | undefined): void => {
      if (typeof text === "string" && text.trim() !== "") found.push({ source, text });
    };

    /** Enough of an element to find it again from a failure message. */
    const sketch = (element: Element): string => {
      const id = element.id === "" ? "" : `#${element.id}`;
      const classes =
        typeof element.className === "string" && element.className.trim() !== ""
          ? `.${element.className.trim().split(/\s+/).join(".")}`
          : "";
      return `${element.tagName.toLowerCase()}${id}${classes}`;
    };

    push("document.title", document.title);
    push("body.innerText", document.body.innerText);

    for (const element of Array.from(document.querySelectorAll("*"))) {
      for (const attribute of [
        "aria-label",
        "aria-roledescription",
        "aria-description",
        "aria-placeholder",
        "title",
        "alt",
        "placeholder",
      ]) {
        push(`${sketch(element)}[${attribute}]`, element.getAttribute(attribute));
      }

      // `aria-labelledby` holds ids; the name is what they resolve to.
      const labelledBy = element.getAttribute("aria-labelledby");
      if (labelledBy !== null) {
        for (const reference of labelledBy.split(/\s+/).filter(Boolean)) {
          push(
            `${sketch(element)}[aria-labelledby=${reference}]`,
            document.getElementById(reference)?.textContent,
          );
        }
      }

      if (
        element instanceof HTMLInputElement ||
        element instanceof HTMLTextAreaElement ||
        element instanceof HTMLSelectElement
      ) {
        for (const label of Array.from(element.labels ?? [])) {
          push(`${sketch(element)} <label>`, label.textContent);
        }
      }
    }

    return found;
  });
}

/**
 * Nothing on screen and nothing in an accessible name says the word.
 *
 * `what` names the state, because "the word is on the page" is not actionable
 * and "the word is in the Completed view's tab name" is.
 */
async function expectNoBannedWord(page: Page, what: string): Promise<void> {
  const surface = await surfaceOf(page);

  // Anti-vacuity, per state: a reading that came back empty would satisfy the
  // assertion below for the wrong reason, and an empty page is exactly what a
  // navigation that silently failed looks like.
  expect(
    surface.length,
    `nothing was read off the page in the ${what} — the surface scan is not seeing the product`,
  ).toBeGreaterThan(5);

  const offenders = surface
    .filter(({ text }) => BANNED.test(text))
    .map(({ source, text }) => `${source} -> ${text}`);

  expect(offenders, `the banned word is on screen in the ${what}`).toEqual([]);
}

test.describe("AC5 — the banned word is nowhere on the product surface", () => {
  test("the pattern is the one the source scan uses, and it can fail", async () => {
    // A browser is not needed for this one, and that is the point: if this
    // pattern ever stops matching, every assertion in this file passes while
    // measuring nothing.
    for (const form of [WORD, WORD.toLowerCase(), WORD.toUpperCase()]) {
      expect(form).toMatch(BANNED);
    }
    expect(`Mark as ${WORD}`).toMatch(BANNED);
    for (const ordinary of ["abandoned", "undone", `${WORD.toLowerCase()}ness`]) {
      expect(ordinary).not.toMatch(BANNED);
    }
  });

  test("not in the first-run empty state", async ({ page }) => {
    await page.goto("/");
    await expect(emptyPanel(page)).toHaveCount(1);
    await expectNoBannedWord(page, "first-run empty state");
  });

  test("not in any of the three filter views, with a list that has both statuses", async ({
    page,
  }) => {
    await page.goto("/");
    await seed(page, ["renew passport", "water plants"]);
    await checkbox(page, "water plants").click();
    await expect(checkbox(page, "water plants")).toBeChecked();

    // All: one Active row and one Completed row on screen at once, which is
    // where a status label would live if the product had one.
    await expect(rows(page)).toHaveCount(2);
    await expectNoBannedWord(page, "All view with one active and one completed Todo");

    await filterTab(page, "Completed").click();
    await expect(rows(page)).toHaveCount(1);
    await expect(row(page, "water plants")).toBeVisible();
    await expectNoBannedWord(page, "Completed view");

    await filterTab(page, "Active").click();
    await expect(rows(page)).toHaveCount(1);
    await expect(row(page, "renew passport")).toBeVisible();
    await expectNoBannedWord(page, "Active view");

    await filterTab(page, "All").click();
    await expect(rows(page)).toHaveCount(2);
    await expectNoBannedWord(page, "All view, returned to");
  });

  test("not in a filtered empty state", async ({ page }) => {
    // The second empty state: the list is not empty, this view of it is. Its
    // copy is composed per view (`empty-state.tsx`), which is precisely the
    // kind of runtime composition a source scan reads as three separate
    // literals and the screen reads as one sentence.
    await page.goto("/");
    await seed(page, ["renew passport"]);

    await filterTab(page, "Completed").click();
    await expect(emptyPanel(page)).toHaveCount(1);
    await expectNoBannedWord(page, "Completed view with nothing completed");
  });

  test("not with the delete dialog open", async ({ page }) => {
    await page.goto("/");
    await seed(page, ["cancel subscription"]);

    await openDeleteDialog(page, "cancel subscription");
    await expect(deleteDialog(page)).toContainText(DIALOG_TITLE);
    await expectNoBannedWord(page, "open delete dialog");
  });

  test("not with an error banner showing", async ({ page }) => {
    // The banner's copy and the assertive live region's copy are the same
    // sentence arriving twice, and the live region's half is `sr-only` — read
    // aloud, never seen. Both are in the surface this reads.
    await page.goto("/");
    await seed(page, ["file tax return"]);

    await failNext(page, "PATCH", ITEM_ROUTE);
    await checkbox(page, "file tax return").click();

    await expect(banner(page)).toContainText(SAVE_FAILED);
    await expectNoBannedWord(page, "list with an error banner showing");
  });
});
