import { describe, expect, it } from "vitest";

import { drizzleQueryError } from "@/test-support/drizzle-error";
import { logSafeError, requestFailedResponse } from "./route-failure";

// The two helpers every route handler's failure path runs through, tested
// directly rather than only through a handler.
//
// Both were proved via `app/api/todos/route.test.ts` while they lived inside
// that file, and those rows stay: they are what pins the *handlers'* behaviour.
// What a handler cannot reach is the helpers' own edges — a caught value that
// is not an `Error`, a message that is entirely params, a method nobody has
// built an endpoint for. Story 4.1 moved the helpers out because a second route
// file needs them; this file is what stops the move from turning a shared
// redaction rule into an untested one.


// The create path's statement, because it is the one that really binds a Todo's
// text: `insert … values ($1, $2, $3)` binds the id, the owner id and the text.
// The update path binds only `(completed, id, ownerId)` — a fixture listing a
// text the statement never bound would prove nothing about the redaction of the
// values it does.
const INSERT_STATEMENT =
  'insert into "todo" ("id", "owner_id", "text") values ($1, $2, $3) on conflict ("id") do nothing returning "id", "text", "completed", "created_at"';

describe("logSafeError — what survives the cut", () => {
  it("keeps the statement summary and drops everything from \\nparams: onwards", () => {
    const TODO_TEXT = "pick up the dry cleaning";
    const error = drizzleQueryError(INSERT_STATEMENT, [
      "0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b",
      "0199a1b2-c3d4-7000-8000-0123456789ab",
      TODO_TEXT,
    ]);
    // The fixture is the leak, not a stand-in: if this stops holding, every
    // assertion below has quietly stopped testing anything.
    expect(error.message).toContain(TODO_TEXT);

    const logged = logSafeError(error);

    // Something diagnostic survives — the SQL this repository wrote, which
    // carries nothing of the caller's. Both halves matter: a helper that
    // returned the empty string would pass a leak check and help nobody at 3am.
    expect(logged).toBe(`Failed query: ${INSERT_STATEMENT}`);
    expect(logged).not.toContain("params:");
    expect(logged).not.toContain(TODO_TEXT);
  });

  it("cuts at the first \\nparams: when the parameters contain one themselves", () => {
    // A Todo whose own text is `\nparams: …` must not smuggle itself back into
    // the log by making the split ambiguous. `String.split` yields every
    // segment and this reads the first, so the cut is at the earliest marker.
    const error = new Error(
      'Failed query: select 1\nparams: \nparams: still the caller’s text',
    );

    expect(logSafeError(error)).toBe("Failed query: select 1");
  });

  it("falls back to the error's name when the message is entirely params", () => {
    const error = new Error("\nparams: pick up the dry cleaning");
    error.name = "DrizzleQueryError";

    expect(logSafeError(error)).toBe("DrizzleQueryError");
  });

  it("falls back to the error's name for an empty message too", () => {
    const error = new Error("");
    error.name = "NeonDbError";

    expect(logSafeError(error)).toBe("NeonDbError");
  });

  it("never returns a blank line, even when the name is empty as well", () => {
    // A failure logged as nothing is indistinguishable from no failure at all.
    const error = new Error("   \n  ");
    error.name = "";

    expect(logSafeError(error)).toBe("unknown error");
  });

  it.each([
    ["a thrown string", "pick up the dry cleaning"],
    ["a thrown object", { message: "pick up the dry cleaning" }],
    ["undefined", undefined],
    ["null", null],
    ["a number", 42],
  ])(
    "says nothing about %s — only an Error contributes text",
    (_case, thrown) => {
      // `throw "…"` is legal, and a thrown value could be anything at all,
      // including a Todo's text. Nothing that is not an `Error` is read.
      expect(logSafeError(thrown)).toBe("unknown error");
    },
  );

  it("trims the surviving summary", () => {
    expect(logSafeError(new Error("  Failed query: select 1  "))).toBe(
      "Failed query: select 1",
    );
  });

  it("returns a message that never reached a params marker unchanged", () => {
    // Not every failure is a query. A connection error has no parameters and
    // must not be reduced to its name.
    expect(logSafeError(new Error("connection terminated unexpectedly"))).toBe(
      "connection terminated unexpectedly",
    );
  });
});

describe("requestFailedResponse — the envelope a refusal carries", () => {
  it.each([
    ["GET", "load"],
    ["POST", "create"],
    ["PATCH", "update"],
    ["PUT", "update"],
    ["DELETE", "delete"],
  ])("classifies a %s failure as kind %s", async (method, kind) => {
    // The kind follows the method, exactly as `errorKindForMethod` decides it.
    // A hardcoded kind here would report a failed update to the single error
    // slot as a failed read, and the slot would show the wrong copy (AD-10).
    const response = requestFailedResponse(method, 500, "a fixed message");

    await expect(response.json()).resolves.toEqual({
      error: { kind, message: "a fixed message" },
    });
  });

  it("classifies a method nobody designed for as load rather than throwing", () => {
    // `errorKindForMethod`'s default. The single error slot can classify any
    // failure it is handed; an unknown verb must not crash the refusal path.
    const response = requestFailedResponse("BREW", 418, "a fixed message");

    expect(response.status).toBe(418);
    return expect(response.json()).resolves.toEqual({
      error: { kind: "load", message: "a fixed message" },
    });
  });

  it("is case-insensitive about the method, as a raw request line is not", async () => {
    const body = await requestFailedResponse("patch", 404, "m").json();

    expect(body.error.kind).toBe("update");
  });

  it("carries the message it was given verbatim and composes nothing", async () => {
    // The whole point of the parameter: every caller passes its own module's
    // fixed constant, and a driver's text never becomes one.
    const message = "The Todo could not be updated.";

    const serialized = await requestFailedResponse(
      "PATCH",
      404,
      message,
    ).text();

    // Equality, not "some string": a driver error is a string too, so
    // `expect.any(String)` would pass on exactly the leak this guards against.
    expect(JSON.parse(serialized).error.message).toBe(message);
  });

  it("answers with the status it was given and a JSON content type", () => {
    const response = requestFailedResponse("PATCH", 404, "m");

    expect(response.status).toBe(404);
    expect(response.headers.get("content-type")).toMatch(/application\/json/);
  });

  it("puts nothing but the envelope in the body — no id, no status, no method", async () => {
    const serialized = await requestFailedResponse("PATCH", 404, "m").text();

    expect(JSON.parse(serialized)).toEqual({
      error: { kind: "update", message: "m" },
    });
    expect(serialized).not.toContain("PATCH");
    expect(serialized).not.toContain("404");
  });

  it("does not mark the response private — that is the caller's to apply", () => {
    // Deliberate, and asserted so it stays deliberate: `privateToTheCaller`
    // wraps every response a handler returns, refusals included, and it is
    // `append`-based on `Vary`. Marking here as well would be the second wrap
    // its own idempotence guard exists to survive, and would hide from each
    // handler that the rule is theirs to keep.
    const response = requestFailedResponse("PATCH", 404, "m");

    expect(response.headers.get("cache-control")).toBeNull();
    expect(response.headers.get("vary")).toBeNull();
  });
});
