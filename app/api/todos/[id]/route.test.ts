import { readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { IDENTITY_COOKIE_NAME } from "@/server/identity/identity-cookie";
import {
  hashIdentityToken,
  mintIdentityToken,
} from "@/server/identity/identity-token";
import { drizzleQueryError } from "@/test-support/drizzle-error";
import * as routeModule from "./route";
import {
  DELETE,
  DELETE_FAILED_MESSAGE,
  PATCH,
  UPDATE_FAILED_MESSAGE,
} from "./route";

// Story 4.1 AC1 (the Completion Status is *set* to the value asked for and the
// updated Todo comes back bare), AC2 (no toggle anywhere in the API surface),
// AC3 (a repeat stores the same value), AC4 (a foreign owner is answered
// exactly as a missing row is), AC5 (`ownerId` first, and no query built here)
// and AC6 (`update` is the kind of every failure this endpoint reports).
//
// Story 5.1 AC1-AC6 join them for `DELETE`: that an owned row, a row already
// gone and a row another identity owns are one answer (`204`, no body, AC1-AC3),
// that a Todo in either Completion Status deletes (AC5), that `deleteTodo` is
// passed `ownerId` first (AC4), and that `delete` is the kind of every failure
// this endpoint reports (AC6) — including the `400` a malformed path segment
// gets before any query runs. That the `DELETE` statement itself scopes by owner and
// actually removes the row is SQL, and is proved live in
// `src/server/repository/todos.test.ts`.
//
// Both repositories are mocked, following the pattern `app/api/todos/route.ts`
// established: what is under test is which repository call the handler makes
// and with what, and what it does with each answer. That the `UPDATE` itself
// scopes by owner and stores the value given is SQL, and is proved live in
// `src/server/repository/todos.test.ts`.
const identityRepository = vi.hoisted(() => ({
  findClientIdentityByTokenHash: vi.fn(),
  createClientIdentity: vi.fn(),
}));
const todosRepository = vi.hoisted(() => ({
  listTodos: vi.fn(),
  createTodo: vi.fn(),
  setTodoCompleted: vi.fn(),
  deleteTodo: vi.fn(),
}));

vi.mock("@/server/repository/client-identity", () => identityRepository);
vi.mock("@/server/repository/todos", () => todosRepository);

const OWNER_ID = "0199a1b2-c3d4-7000-8000-0123456789ab";

/** A valid lowercase-canonical UUIDv7, the shape a client mints (AD-4). */
const TODO_ID = "0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b";

/** A second well-formed id, for the row that is not there. */
const MISSING_ID = "0199ffff-eeee-7ddd-8ccc-bbbbaaaa9999";

/** A third, for the row that exists but belongs to somebody else. */
const FOREIGN_ID = "0199c0c0-b1b1-7a2a-9b3b-c4c4d5d5e6e6";

const todoOf = (completed: boolean) => ({
  id: TODO_ID,
  text: "Buy milk",
  completed,
  createdAt: "2026-09-22T10:00:00.000Z",
});

const UPDATE_ENVELOPE = {
  error: { kind: "update", message: UPDATE_FAILED_MESSAGE },
};

const DELETE_ENVELOPE = {
  error: { kind: "delete", message: DELETE_FAILED_MESSAGE },
};

// `body` is serialized unless it is already a string, so a test can submit
// something that is not JSON at all.
function patchRequest(body: unknown, cookie?: string, id = TODO_ID) {
  return new NextRequest(`https://simple-action.test/api/todos/${id}`, {
    method: "PATCH",
    headers: {
      "content-type": "application/json",
      ...(cookie === undefined ? {} : { cookie }),
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

function identifyTheCaller(): void {
  identityRepository.findClientIdentityByTokenHash.mockResolvedValue({
    id: OWNER_ID,
    tokenHash: "irrelevant — the hash is computed from the cookie",
    createdAt: new Date("2026-09-21T00:00:00.000Z"),
  });
}

/** A `PATCH` whose cookie resolves to `OWNER_ID`. */
function identifiedPatch(body: unknown, id = TODO_ID): NextRequest {
  identifyTheCaller();

  return patchRequest(
    body,
    `${IDENTITY_COOKIE_NAME}=${mintIdentityToken()}`,
    id,
  );
}

// The `DELETE` equivalents of the two helpers above. A `DELETE` carries no
// body, so there is nothing to serialize and nothing to smuggle — which is the
// whole difference between this endpoint's gate order and `PATCH`'s.
function deleteRequest(cookie?: string, id = TODO_ID) {
  return new NextRequest(`https://simple-action.test/api/todos/${id}`, {
    method: "DELETE",
    headers: cookie === undefined ? {} : { cookie },
  });
}

/** A `DELETE` whose cookie resolves to `OWNER_ID`. */
function identifiedDelete(id = TODO_ID): NextRequest {
  identifyTheCaller();

  return deleteRequest(`${IDENTITY_COOKIE_NAME}=${mintIdentityToken()}`, id);
}

/**
 * The route context Next 16 hands a dynamic segment's handler.
 *
 * `params` is a `Promise` in Next 16 and the handler awaits it, so the fixture
 * is a promise too — a plain object would pass against a handler that forgot
 * the `await` and then read `id` off a `Promise` as `undefined`.
 *
 * Typed inline, like the handler's own parameter: `RouteContext<'/api/todos/[id]'>`
 * comes from `.next/types`, which `npm run build` regenerates only after `lint`
 * and `typecheck` have already run.
 */
const contextFor = (id: string): { params: Promise<{ id: string }> } => ({
  params: Promise.resolve({ id }),
});

beforeEach(() => {
  vi.resetAllMocks();
  vi.restoreAllMocks();
});

describe("PATCH /api/todos/:id — the Completion Status is set (AC1, AC5)", () => {
  it("answers 200 with the updated Todo bare — no envelope around it", async () => {
    const updated = todoOf(true);
    todosRepository.setTodoCompleted.mockResolvedValue(updated);

    const response = await PATCH(
      identifiedPatch({ completed: true }),
      contextFor(TODO_ID),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toMatch(/application\/json/);

    const body = await response.json();
    expect(body).toEqual(updated);
    // The keys, exactly — an extra one would mean `owner_id` reached the wire,
    // and an `error` key would mean a success had grown an envelope.
    expect(Object.keys(body).sort()).toEqual([
      "completed",
      "createdAt",
      "id",
      "text",
    ]);
  });

  it("passes the resolved identity first, then the path id, then the value asked for (AC5)", async () => {
    todosRepository.setTodoCompleted.mockResolvedValue(todoOf(true));

    await PATCH(identifiedPatch({ completed: true }), contextFor(TODO_ID));

    expect(todosRepository.setTodoCompleted).toHaveBeenCalledTimes(1);
    expect(todosRepository.setTodoCompleted).toHaveBeenCalledWith(
      OWNER_ID,
      TODO_ID,
      true,
    );
  });

  it("sets false on a completed row just as readily (AC1)", async () => {
    const updated = todoOf(false);
    todosRepository.setTodoCompleted.mockResolvedValue(updated);

    const response = await PATCH(
      identifiedPatch({ completed: false }),
      contextFor(TODO_ID),
    );

    expect(response.status).toBe(200);
    expect(todosRepository.setTodoCompleted).toHaveBeenCalledWith(
      OWNER_ID,
      TODO_ID,
      false,
    );
    await expect(response.json()).resolves.toEqual(updated);
  });

  it("returns the text and timestamp the repository reports, untouched by this path", async () => {
    // Neither is writable here: the handler passes one boolean and no other
    // column reaches the repository at all.
    const updated = todoOf(true);
    todosRepository.setTodoCompleted.mockResolvedValue(updated);

    const body = await (
      await PATCH(identifiedPatch({ completed: true }), contextFor(TODO_ID))
    ).json();

    expect(body.text).toBe("Buy milk");
    expect(body.createdAt).toBe("2026-09-22T10:00:00.000Z");
  });

  it("writes nothing but completed, however much the body smuggles (AC1)", async () => {
    // Extra keys are structurally inert rather than policed: the predicate
    // reads one field and `setTodoCompleted` takes one boolean, so a body
    // carrying `text` has nowhere for that text to go.
    todosRepository.setTodoCompleted.mockResolvedValue(todoOf(true));

    await PATCH(
      identifiedPatch({
        completed: true,
        text: "a text the caller may not set",
        createdAt: "1999-01-01T00:00:00.000Z",
        ownerId: "11111111-2222-7000-8000-333333333333",
        id: "22222222-3333-7000-8000-444444444444",
      }),
      contextFor(TODO_ID),
    );

    // Three arguments, and the id is the path's rather than the body's.
    expect(todosRepository.setTodoCompleted).toHaveBeenCalledWith(
      OWNER_ID,
      TODO_ID,
      true,
    );
  });

  it("ignores request-supplied ownership — the cookie is the only thing that names the owner (AD-7)", async () => {
    todosRepository.setTodoCompleted.mockResolvedValue(todoOf(true));
    const request = identifiedPatch({
      completed: true,
      ownerId: "11111111-2222-7000-8000-333333333333",
    });
    request.headers.set("x-owner-id", "11111111-2222-7000-8000-333333333333");
    request.headers.set("x-forwarded-owner", "someone else entirely");

    await PATCH(request, contextFor(TODO_ID));

    expect(todosRepository.setTodoCompleted.mock.calls[0][0]).toBe(OWNER_ID);
  });

  it("hashes the cookie before looking the identity up — the raw token never reaches the repository", async () => {
    const token = mintIdentityToken();
    identityRepository.findClientIdentityByTokenHash.mockResolvedValue({
      id: OWNER_ID,
      tokenHash: await hashIdentityToken(token),
      createdAt: new Date("2026-09-21T00:00:00.000Z"),
    });
    todosRepository.setTodoCompleted.mockResolvedValue(todoOf(true));

    await PATCH(
      patchRequest({ completed: true }, `${IDENTITY_COOKIE_NAME}=${token}`),
      contextFor(TODO_ID),
    );

    expect(
      identityRepository.findClientIdentityByTokenHash,
    ).toHaveBeenCalledWith(await hashIdentityToken(token));
    expect(
      identityRepository.findClientIdentityByTokenHash,
    ).not.toHaveBeenCalledWith(token);
  });

  it("awaits the params promise rather than reading id off the promise itself", async () => {
    // Next 16's `params` is a `Promise`. A handler that forgot the `await`
    // would read `id` as `undefined`, fail `isCanonicalUuidV7` and answer 400
    // — which is why the row below asserts a 200 and the id that was passed.
    todosRepository.setTodoCompleted.mockResolvedValue(todoOf(true));

    const response = await PATCH(identifiedPatch({ completed: true }), {
      // Deliberately not already-resolved: a microtask later, like the real one.
      params: new Promise((resolve) =>
        setTimeout(() => resolve({ id: TODO_ID }), 0),
      ),
    });

    expect(response.status).toBe(200);
    expect(todosRepository.setTodoCompleted.mock.calls[0][1]).toBe(TODO_ID);
  });
});

describe("PATCH /api/todos/:id — the same request twice (AC3)", () => {
  it("sends the value asked for both times and never its inverse", async () => {
    // The endpoint is a set, not a toggle: nothing in this handler reads the
    // current value, so the second request carries — and stores — exactly what
    // the first did. This is the whole of AC3 at the handler; that the *column*
    // ends up holding it is proved live in the repository suite.
    const updated = todoOf(true);
    todosRepository.setTodoCompleted.mockResolvedValue(updated);

    const first = await PATCH(
      identifiedPatch({ completed: true }),
      contextFor(TODO_ID),
    );
    const second = await PATCH(
      identifiedPatch({ completed: true }),
      contextFor(TODO_ID),
    );

    expect(second.status).toBe(first.status);
    await expect(second.json()).resolves.toEqual(await first.json());
    expect(todosRepository.setTodoCompleted).toHaveBeenCalledTimes(2);
    for (const call of todosRepository.setTodoCompleted.mock.calls) {
      expect(call).toEqual([OWNER_ID, TODO_ID, true]);
    }
  });
});

describe("PATCH /api/todos/:id — a Todo that is not the caller's, or not there (AC4)", () => {
  // One `undefined` from the repository covers both states, so the handler
  // cannot tell them apart. Every row below is the same call for that reason.
  it.each([
    ["a Todo owned by somebody else", FOREIGN_ID],
    ["an id that names no row at all", MISSING_ID],
  ])("answers 404 with the update envelope for %s", async (_case, id) => {
    todosRepository.setTodoCompleted.mockResolvedValue(undefined);

    const response = await PATCH(
      identifiedPatch({ completed: true }, id),
      contextFor(id),
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual(UPDATE_ENVELOPE);
  });

  it("answers a foreign owner byte-for-byte as it answers a missing row (AC4)", async () => {
    // Any difference between the two — a status, a message, a header — is
    // itself the disclosure AC4 forbids: it would tell a caller which ids
    // exist. The two responses are built the same way, and this is what pins
    // that they stay that way.
    todosRepository.setTodoCompleted.mockResolvedValue(undefined);
    const foreign = await PATCH(
      identifiedPatch({ completed: true }, FOREIGN_ID),
      contextFor(FOREIGN_ID),
    );
    const missing = await PATCH(
      identifiedPatch({ completed: true }, MISSING_ID),
      contextFor(MISSING_ID),
    );

    expect(missing.status).toBe(foreign.status);
    expect(await missing.text()).toBe(await foreign.text());
    expect([...missing.headers].sort()).toEqual([...foreign.headers].sort());
  });

  it("discloses nothing of the row in the body or the headers (AC4)", async () => {
    todosRepository.setTodoCompleted.mockResolvedValue(undefined);

    const response = await PATCH(
      identifiedPatch({ completed: true }),
      contextFor(TODO_ID),
    );
    const serialized = await response.text();

    // Equality, not "some envelope": the fixed message is the whole of what a
    // refused update is told.
    expect(JSON.parse(serialized)).toEqual(UPDATE_ENVELOPE);
    // Not even the id it asked about is echoed, so a caller cannot probe for
    // which ids exist by reading the body rather than the status.
    expect(serialized).not.toContain(TODO_ID);
    expect(serialized).not.toContain("owner");
    expect(serialized).not.toContain("Buy milk");
    for (const [, value] of response.headers) {
      expect(value).not.toContain(TODO_ID);
      expect(value).not.toContain(OWNER_ID);
    }
  });

  it("logs nothing at all for a 404 — a refusal is not a server failure", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    todosRepository.setTodoCompleted.mockResolvedValue(undefined);

    await PATCH(identifiedPatch({ completed: true }), contextFor(TODO_ID));

    expect(logged).not.toHaveBeenCalled();
  });
});

describe("PATCH /api/todos/:id — the path id must be a lowercase canonical UUIDv7", () => {
  it.each([
    ["uppercase hex", TODO_ID.toUpperCase()],
    ["a v4", "0199a1b2-c3d4-4e5f-8a9b-0c1d2e3f4a5b"],
    ["a wrong variant nibble", "0199a1b2-c3d4-7e5f-ca9b-0c1d2e3f4a5b"],
    ["braces", `{${TODO_ID}}`],
    ["a urn prefix", `urn:uuid:${TODO_ID}`],
    ["the wrong length", TODO_ID.slice(0, -1)],
    ["no hyphens", TODO_ID.replaceAll("-", "")],
    ["an empty segment", ""],
    ["a SQL fragment", "1 or 1=1"],
  ])("answers 400 and runs no query for %s", async (_case, id) => {
    const response = await PATCH(
      identifiedPatch({ completed: true }, encodeURIComponent(id) || "x"),
      contextFor(id),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual(UPDATE_ENVELOPE);
    // Refused before the repository: a malformed id never reaches Postgres's
    // `uuid` type, where it would become a driver error and a 500.
    expect(todosRepository.setTodoCompleted).not.toHaveBeenCalled();
  });

  it("checks the id's form before it reads the body at all", async () => {
    // The order is load-bearing: a malformed id is refused without the body
    // ever being parsed, so a caller cannot make this endpoint read a payload
    // for a resource it has already refused to name.
    identifyTheCaller();
    const request = patchRequest(
      { completed: true },
      `${IDENTITY_COOKIE_NAME}=${mintIdentityToken()}`,
      "not-a-uuid",
    );
    const readBody = vi.spyOn(request, "json");

    const response = await PATCH(request, contextFor("not-a-uuid"));

    expect(response.status).toBe(400);
    expect(readBody).not.toHaveBeenCalled();
  });
});

describe("PATCH /api/todos/:id — a body that is not a set at all", () => {
  it.each([
    ["no body fields", {}],
    ["a string completed", { completed: "true" }],
    ["a numeric completed", { completed: 1 }],
    ["a null completed", { completed: null }],
    ["an absent completed beside other keys", { text: "Buy milk" }],
    ["a JSON array", [{ completed: true }]],
    ["a JSON string", '"true"'],
    ["JSON null", "null"],
    ["a JSON number", "7"],
    ["JSON true", "true"],
    ["a body that is not JSON", "completed=true"],
    ["an empty body", ""],
  ])("answers 400 and updates nothing for %s", async (_case, body) => {
    const response = await PATCH(identifiedPatch(body), contextFor(TODO_ID));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual(UPDATE_ENVELOPE);
    expect(todosRepository.setTodoCompleted).not.toHaveBeenCalled();
  });

  it("never logs a malformed body — a JSON parse error quotes the input", async () => {
    // `SyntaxError` from `JSON.parse` embeds the offending text, so letting one
    // reach the catch block would put the submitted body in a log line.
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});

    await PATCH(
      identifiedPatch("{ this is not JSON: Buy milk }"),
      contextFor(TODO_ID),
    );

    expect(logged).not.toHaveBeenCalled();
  });
});

describe("PATCH /api/todos/:id — no valid identity", () => {
  it.each([
    ["no cookie at all", undefined],
    ["an empty cookie", `${IDENTITY_COOKIE_NAME}=`],
  ])("answers 401 and updates nothing when there is %s", async (_c, cookie) => {
    const response = await PATCH(
      patchRequest({ completed: true }, cookie),
      contextFor(TODO_ID),
    );

    expect(response.status).toBe(401);
    expect(todosRepository.setTodoCompleted).not.toHaveBeenCalled();
  });

  it("answers 401 when the token names no row — a forged or stale cookie", async () => {
    identityRepository.findClientIdentityByTokenHash.mockResolvedValue(
      undefined,
    );

    const response = await PATCH(
      patchRequest(
        { completed: true },
        `${IDENTITY_COOKIE_NAME}=${mintIdentityToken()}`,
      ),
      contextFor(TODO_ID),
    );

    expect(response.status).toBe(401);
    expect(todosRepository.setTodoCompleted).not.toHaveBeenCalled();
  });

  it("carries the shared envelope with kind update, the kind a PATCH is classified by (AC6)", async () => {
    const body = await (
      await PATCH(patchRequest({ completed: true }), contextFor(TODO_ID))
    ).json();

    expect(body).toEqual({
      error: { kind: "update", message: "No Client Identity on this request." },
    });
  });

  it("looks no identity up at all when the request carries no cookie", async () => {
    // `resolveClientIdentity` returns before the lookup when there is no
    // cookie to hash. Worth pinning rather than assuming: the `401` is
    // identical either way, so a handler that had started issuing a pointless
    // query per anonymous request would look exactly the same from outside.
    await PATCH(patchRequest({ completed: true }), contextFor(TODO_ID));

    expect(
      identityRepository.findClientIdentityByTokenHash,
    ).not.toHaveBeenCalled();
  });

  it("answers 401 rather than 400 when the id and body are also invalid — identity is checked first", async () => {
    // The order matters: an unidentified caller learns nothing about this
    // endpoint's validation, and a `400` here would be that.
    const response = await PATCH(
      patchRequest({ completed: "yes" }, undefined, "not-a-uuid"),
      contextFor("not-a-uuid"),
    );

    expect(response.status).toBe(401);
    expect(todosRepository.setTodoCompleted).not.toHaveBeenCalled();
  });
});

describe("PATCH /api/todos/:id — an update that fails (AC6)", () => {
  // Shaped like what `neon-http` actually rejects with: Drizzle wraps the
  // driver error, and the message names the statement, the relation *and* the
  // bound parameters.
  //
  // This statement binds three, in this order: the Completion Status, the
  // Todo's id and the owner id. `RETURNING` names columns and binds nothing,
  // so the row's *text* is not among them — unlike the create path, where the
  // submitted text is a bound value of the insert. What leaks here is the pair
  // of identifiers, and the owner id is the Client Identity every one of this
  // person's rows is keyed by, which is reason enough to cut the line.
  const TODO_TEXT = "pick up the dry cleaning";
  const UPDATE_STATEMENT =
    'update "todo" set "completed" = $1 where ("todo"."id" = $2 and "todo"."owner_id" = $3) returning "id", "text", "completed", "created_at"';
  const DRIVER_ERROR = drizzleQueryError(UPDATE_STATEMENT, [
    "true",
    TODO_ID,
    OWNER_ID,
  ]);

  it("carries the bound parameters in its own message — the fixture is the leak, not a stand-in", () => {
    // If this ever stops holding, every assertion below has quietly stopped
    // testing anything. `node_modules/drizzle-orm/errors.js` is the source.
    expect(DRIVER_ERROR.message).toContain(OWNER_ID);
    expect(DRIVER_ERROR.message).toContain(TODO_ID);
    expect(DRIVER_ERROR.message).toContain("\nparams:");
  });

  it("answers 500 with the update envelope when the repository rejects", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    todosRepository.setTodoCompleted.mockRejectedValue(DRIVER_ERROR);

    const response = await PATCH(
      identifiedPatch({ completed: true }),
      contextFor(TODO_ID),
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual(UPDATE_ENVELOPE);
  });

  it("never forwards the driver's text to the wire", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    todosRepository.setTodoCompleted.mockRejectedValue(DRIVER_ERROR);

    const serialized = await (
      await PATCH(identifiedPatch({ completed: true }), contextFor(TODO_ID))
    ).text();

    // Equality, not "some string": the driver's own text is a string too, so
    // `expect.any(String)` would pass on exactly the leak this guards against.
    expect(JSON.parse(serialized).error.message).toBe(UPDATE_FAILED_MESSAGE);
    // SQL fragments only: the word "update" on its own is also the error
    // *kind* every failure here legitimately carries.
    for (const fragment of [
      "Failed query",
      "owner_id",
      '"todo"',
      'set "completed"',
      TODO_TEXT,
      TODO_ID,
      OWNER_ID,
    ]) {
      expect(serialized).not.toContain(fragment);
    }
  });

  it("reports the failure as kind update and never as kind load or create (AC6)", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    todosRepository.setTodoCompleted.mockRejectedValue(DRIVER_ERROR);

    const body = await (
      await PATCH(identifiedPatch({ completed: true }), contextFor(TODO_ID))
    ).json();

    expect(body.error.kind).toBe("update");
  });

  it("logs strings only, the statement summary among them, and nothing after \\nparams:", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    todosRepository.setTodoCompleted.mockRejectedValue(DRIVER_ERROR);

    await PATCH(identifiedPatch({ completed: true }), contextFor(TODO_ID));

    expect(logged).toHaveBeenCalledTimes(1);
    // Something diagnostic survives — the SQL this repository wrote — and the
    // bound parameters do not. Both halves matter: a log line that said
    // nothing would pass a leak check and help nobody at 3am.
    expect(logged.mock.calls[0]).toContain(`Failed query: ${UPDATE_STATEMENT}`);
    for (const argument of logged.mock.calls[0]) {
      expect(typeof argument).toBe("string");
      expect(argument).not.toContain("params:");
      // The two values this statement actually binds.
      expect(argument).not.toContain(OWNER_ID);
      expect(argument).not.toContain(TODO_ID);
    }
  });

  it("logs a name rather than a blank line when nothing survives the cut", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const paramsOnly = new Error(`\nparams: ${TODO_TEXT}`);
    paramsOnly.name = "DrizzleQueryError";
    todosRepository.setTodoCompleted.mockRejectedValue(paramsOnly);

    await PATCH(identifiedPatch({ completed: true }), contextFor(TODO_ID));

    expect(logged).toHaveBeenCalledTimes(1);
    expect(logged.mock.calls[0]).toContain("DrizzleQueryError");
    for (const argument of logged.mock.calls[0]) {
      expect(argument).not.toContain(TODO_TEXT);
    }
  });

  it("logs nothing of the text when the rejection is not an Error at all", async () => {
    // `throw "…"` is legal, and a thrown string could be anything.
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    todosRepository.setTodoCompleted.mockRejectedValue(TODO_TEXT);

    const response = await PATCH(
      identifiedPatch({ completed: true }),
      contextFor(TODO_ID),
    );

    expect(response.status).toBe(500);
    expect(logged).toHaveBeenCalledTimes(1);
    for (const argument of logged.mock.calls[0]) {
      expect(argument).not.toContain(TODO_TEXT);
    }
  });

  it("answers the same enveloped 500 when the identity lookup itself fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    identityRepository.findClientIdentityByTokenHash.mockRejectedValue(
      new Error("Failed query: select from client_identity"),
    );

    const response = await PATCH(
      patchRequest(
        { completed: true },
        `${IDENTITY_COOKIE_NAME}=${mintIdentityToken()}`,
      ),
      contextFor(TODO_ID),
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual(UPDATE_ENVELOPE);
  });

  it("answers the same enveloped 500 when the params promise itself rejects", async () => {
    // Not hypothetical insulation: `params` is the platform's promise, and an
    // unhandled rejection here would escape as an unenveloped crash rather
    // than as the error shape AD-10 requires of every failure.
    vi.spyOn(console, "error").mockImplementation(() => {});
    identifyTheCaller();
    const params = Promise.reject(new Error("params unavailable"));
    // Vitest fails a run on an unhandled rejection, and this one is only
    // handled once `resolveClientIdentity` has resolved — a turn later than
    // Node's watcher looks. The handler still awaits the rejecting promise
    // itself; this second consumer only tells the watcher someone is home.
    params.catch(() => {});

    const response = await PATCH(
      patchRequest(
        { completed: true },
        `${IDENTITY_COOKIE_NAME}=${mintIdentityToken()}`,
      ),
      { params },
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual(UPDATE_ENVELOPE);
  });
});

describe("PATCH /api/todos/:id — no identity is ever issued (AD-17)", () => {
  // AD-17 is not "a refusal issues none" — it is that a route handler never
  // issues one, full stop. `middleware.ts` is the only minting site, and a
  // handler that quietly created a Client Identity on the way to a successful
  // update would put a second one there.
  it.each([
    [
      "a 200",
      async () => {
        todosRepository.setTodoCompleted.mockResolvedValue(todoOf(true));
        return PATCH(identifiedPatch({ completed: true }), contextFor(TODO_ID));
      },
    ],
    [
      "a 400 for the id",
      async () =>
        PATCH(identifiedPatch({ completed: true }, "x"), contextFor("x")),
    ],
    [
      "a 400 for the body",
      async () => PATCH(identifiedPatch({}), contextFor(TODO_ID)),
    ],
    [
      "a 404",
      async () => {
        todosRepository.setTodoCompleted.mockResolvedValue(undefined);
        return PATCH(identifiedPatch({ completed: true }), contextFor(TODO_ID));
      },
    ],
    [
      "a 401",
      async () => PATCH(patchRequest({ completed: true }), contextFor(TODO_ID)),
    ],
    [
      "a 500",
      async () => {
        vi.spyOn(console, "error").mockImplementation(() => {});
        todosRepository.setTodoCompleted.mockRejectedValue(
          new Error("unreachable"),
        );
        return PATCH(identifiedPatch({ completed: true }), contextFor(TODO_ID));
      },
    ],
  ])("issues none on %s", async (_case, respond) => {
    await respond();

    expect(identityRepository.createClientIdentity).not.toHaveBeenCalled();
  });
});

describe("PATCH /api/todos/:id — the response belongs to one caller (AC1)", () => {
  // Every response here is decided by the identity cookie. Without these two
  // headers a shared cache may key it on the URL alone and hand one person's
  // Todo to the next caller.
  it.each([
    [
      "the 200",
      async () => {
        todosRepository.setTodoCompleted.mockResolvedValue(todoOf(true));
        return PATCH(identifiedPatch({ completed: true }), contextFor(TODO_ID));
      },
    ],
    [
      "the 400 for a malformed id",
      async () =>
        PATCH(identifiedPatch({ completed: true }, "x"), contextFor("x")),
    ],
    [
      "the 400 for a malformed body",
      async () => PATCH(identifiedPatch({}), contextFor(TODO_ID)),
    ],
    [
      "the 404",
      async () => {
        todosRepository.setTodoCompleted.mockResolvedValue(undefined);
        return PATCH(identifiedPatch({ completed: true }), contextFor(TODO_ID));
      },
    ],
    [
      "the 401",
      async () => PATCH(patchRequest({ completed: true }), contextFor(TODO_ID)),
    ],
    [
      "the 500",
      async () => {
        vi.spyOn(console, "error").mockImplementation(() => {});
        todosRepository.setTodoCompleted.mockRejectedValue(
          new Error("unreachable"),
        );
        return PATCH(identifiedPatch({ completed: true }), contextFor(TODO_ID));
      },
    ],
    [
      "the 500 raised by the identity lookup itself",
      async () => {
        // The one failure that happens *before* the handler has an identity,
        // and so the one most likely to be built by a path that forgot the
        // wrap.
        vi.spyOn(console, "error").mockImplementation(() => {});
        identityRepository.findClientIdentityByTokenHash.mockRejectedValue(
          new Error("Failed query: select from client_identity"),
        );
        return PATCH(
          patchRequest(
            { completed: true },
            `${IDENTITY_COOKIE_NAME}=${mintIdentityToken()}`,
          ),
          contextFor(TODO_ID),
        );
      },
    ],
  ])(
    "marks %s private, uncacheable and varying on the cookie",
    async (_case, respond) => {
      const response = await respond();

      expect(response.headers.get("cache-control")).toBe("private, no-store");
      // The exact value, not a `/\bCookie\b/` match: `privateToTheCaller`
      // appends rather than sets, so a double wrap yields `Cookie, Cookie` —
      // valid HTTP, and exactly what a word-boundary match fails to catch. Its
      // own comment names this trap; asserting equality is what springs it.
      expect(response.headers.get("vary")).toBe("Cookie");
    },
  );
});

// --- Story 5.1: DELETE /api/todos/:id ---------------------------------------

describe("DELETE /api/todos/:id — one answer for three states (AC1, AC2, AC3)", () => {
  // The three cases the I/O matrix separates and this endpoint deliberately
  // does not: a row that was there, a row already gone, and a row another
  // identity owns. `deleteTodo` resolves to `undefined` in all three — it
  // returns `void` — so the handler has nothing to branch on and could not
  // tell them apart even if a later change wanted it to.
  it.each([
    ["a row the caller owns", TODO_ID],
    ["the same delete sent a second time", TODO_ID],
    ["a row another identity owns", FOREIGN_ID],
    ["an id that names no row at all", MISSING_ID],
  ])("answers 204 with no body for %s", async (_case, id) => {
    todosRepository.deleteTodo.mockResolvedValue(undefined);

    const response = await DELETE(identifiedDelete(id), contextFor(id));

    expect(response.status).toBe(204);
    // Not merely an empty string: a `204` carries no body at all, and
    // `Response.json({})` would still read as `""` under `.text()` for nobody.
    expect(response.body).toBeNull();
    await expect(response.text()).resolves.toBe("");
    // No envelope on a success, either — SPINE "Error shape" envelopes
    // failures and nothing else.
    expect(response.headers.get("content-type")).toBeNull();
  });

  it("answers the retry byte-for-byte as it answered the first delete (AC2)", async () => {
    // A retry of a delete whose answer the browser never saw must succeed.
    // Nothing here reads whether the row was present, so the second response
    // is built by the identical path as the first.
    todosRepository.deleteTodo.mockResolvedValue(undefined);

    const first = await DELETE(identifiedDelete(), contextFor(TODO_ID));
    const second = await DELETE(identifiedDelete(), contextFor(TODO_ID));

    expect(second.status).toBe(first.status);
    expect(await second.text()).toBe(await first.text());
    expect([...second.headers].sort()).toEqual([...first.headers].sort());
    expect(todosRepository.deleteTodo).toHaveBeenCalledTimes(2);
  });

  it("answers a foreign owner byte-for-byte as it answers an owned row (AC3)", async () => {
    // Any difference between the two — a status, a body, a header — is itself
    // the disclosure AC3 forbids: it would tell a caller which ids exist and
    // whose they are. Pinning the equality is what keeps the two paths one.
    todosRepository.deleteTodo.mockResolvedValue(undefined);

    const mine = await DELETE(identifiedDelete(TODO_ID), contextFor(TODO_ID));
    const theirs = await DELETE(
      identifiedDelete(FOREIGN_ID),
      contextFor(FOREIGN_ID),
    );

    expect(theirs.status).toBe(mine.status);
    expect(await theirs.text()).toBe(await mine.text());
    expect([...theirs.headers].sort()).toEqual([...mine.headers].sort());
  });

  it("deletes a Completed row exactly as it deletes an Active one (AC5)", async () => {
    // Deletion works on a Todo in either Completion Status (epic-5-context),
    // and the reason it does is that nothing on this path names `completed` at
    // all — there is no body, and the repository takes an owner and an id.
    todosRepository.deleteTodo.mockResolvedValue(undefined);

    const response = await DELETE(identifiedDelete(), contextFor(TODO_ID));

    expect(response.status).toBe(204);
    expect(todosRepository.deleteTodo).toHaveBeenCalledWith(OWNER_ID, TODO_ID);
    for (const call of todosRepository.deleteTodo.mock.calls) {
      expect(call).toHaveLength(2);
    }
  });

  it("passes the resolved identity first and the path id second (AC4)", async () => {
    todosRepository.deleteTodo.mockResolvedValue(undefined);

    await DELETE(identifiedDelete(), contextFor(TODO_ID));

    expect(todosRepository.deleteTodo).toHaveBeenCalledTimes(1);
    expect(todosRepository.deleteTodo).toHaveBeenCalledWith(OWNER_ID, TODO_ID);
  });

  it("ignores request-supplied ownership — the cookie names the owner (AD-7)", async () => {
    todosRepository.deleteTodo.mockResolvedValue(undefined);
    const request = identifiedDelete();
    request.headers.set("x-owner-id", "11111111-2222-7000-8000-333333333333");
    request.headers.set("x-forwarded-owner", "someone else entirely");

    await DELETE(request, contextFor(TODO_ID));

    expect(todosRepository.deleteTodo.mock.calls[0][0]).toBe(OWNER_ID);
  });

  it("awaits the params promise rather than reading id off the promise itself", async () => {
    // Next 16's `params` is a `Promise`. A handler that forgot the `await`
    // would read `id` as `undefined`, fail `isCanonicalUuidV7` and answer 400.
    todosRepository.deleteTodo.mockResolvedValue(undefined);

    const response = await DELETE(identifiedDelete(), {
      // Deliberately not already-resolved: a microtask later, like the real one.
      params: new Promise((resolve) =>
        setTimeout(() => resolve({ id: TODO_ID }), 0),
      ),
    });

    expect(response.status).toBe(204);
    expect(todosRepository.deleteTodo.mock.calls[0][1]).toBe(TODO_ID);
  });

  it("logs nothing at all on the success path", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    todosRepository.deleteTodo.mockResolvedValue(undefined);

    await DELETE(identifiedDelete(), contextFor(TODO_ID));

    expect(logged).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/todos/:id — the path id must be a lowercase canonical UUIDv7 (AC6)", () => {
  it.each([
    ["uppercase hex", TODO_ID.toUpperCase()],
    ["a v4", "0199a1b2-c3d4-4e5f-8a9b-0c1d2e3f4a5b"],
    ["a wrong variant nibble", "0199a1b2-c3d4-7e5f-ca9b-0c1d2e3f4a5b"],
    ["braces", `{${TODO_ID}}`],
    ["a urn prefix", `urn:uuid:${TODO_ID}`],
    ["the wrong length", TODO_ID.slice(0, -1)],
    ["no hyphens", TODO_ID.replaceAll("-", "")],
    ["an empty segment", ""],
    ["a SQL fragment", "1 or 1=1"],
  ])(
    "answers 400 with the delete envelope and runs no query for %s",
    async (_case, id) => {
      const response = await DELETE(
        identifiedDelete(encodeURIComponent(id) || "x"),
        contextFor(id),
      );

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual(DELETE_ENVELOPE);
      // Refused before the repository: a malformed id never reaches Postgres's
      // `uuid` type, where it would become a driver error and a 500.
      expect(todosRepository.deleteTodo).not.toHaveBeenCalled();
    },
  );

  it("discloses nothing of the row it refused to name", async () => {
    const response = await DELETE(identifiedDelete("x"), contextFor("x"));
    const serialized = await response.text();

    expect(JSON.parse(serialized)).toEqual(DELETE_ENVELOPE);
    expect(serialized).not.toContain("owner");
    for (const [, value] of response.headers) {
      expect(value).not.toContain(OWNER_ID);
    }
  });
});

describe("DELETE /api/todos/:id — no valid identity", () => {
  it.each([
    ["no cookie at all", undefined],
    ["an empty cookie", `${IDENTITY_COOKIE_NAME}=`],
  ])("answers 401 and deletes nothing when there is %s", async (_c, cookie) => {
    const response = await DELETE(deleteRequest(cookie), contextFor(TODO_ID));

    expect(response.status).toBe(401);
    expect(todosRepository.deleteTodo).not.toHaveBeenCalled();
  });

  it("answers 401 when the token names no row — a forged or stale cookie", async () => {
    identityRepository.findClientIdentityByTokenHash.mockResolvedValue(
      undefined,
    );

    const response = await DELETE(
      deleteRequest(`${IDENTITY_COOKIE_NAME}=${mintIdentityToken()}`),
      contextFor(TODO_ID),
    );

    expect(response.status).toBe(401);
    expect(todosRepository.deleteTodo).not.toHaveBeenCalled();
  });

  it("carries the shared envelope with kind delete, the kind a DELETE is classified by (AC6)", async () => {
    const body = await (
      await DELETE(deleteRequest(), contextFor(TODO_ID))
    ).json();

    expect(body).toEqual({
      error: { kind: "delete", message: "No Client Identity on this request." },
    });
  });

  it("answers 401 rather than 400 when the id is also invalid — identity is checked first", async () => {
    // An unidentified caller learns nothing about this endpoint's validation,
    // and a `400` here would be exactly that.
    const response = await DELETE(
      deleteRequest(undefined, "not-a-uuid"),
      contextFor("not-a-uuid"),
    );

    expect(response.status).toBe(401);
    expect(todosRepository.deleteTodo).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/todos/:id — a delete that fails (AC6)", () => {
  // Shaped like what `neon-http` actually rejects with: Drizzle wraps the
  // driver error, and the message names the statement, the relation *and* the
  // bound parameters. This statement binds two — the Todo's id and the owner
  // id — and the owner id is the Client Identity every one of this person's
  // rows is keyed by, which is reason enough to cut the line.
  const DELETE_STATEMENT =
    'delete from "todo" where ("todo"."id" = $1 and "todo"."owner_id" = $2)';
  const DRIVER_ERROR = drizzleQueryError(DELETE_STATEMENT, [TODO_ID, OWNER_ID]);

  it("carries the bound parameters in its own message — the fixture is the leak, not a stand-in", () => {
    expect(DRIVER_ERROR.message).toContain(OWNER_ID);
    expect(DRIVER_ERROR.message).toContain(TODO_ID);
    expect(DRIVER_ERROR.message).toContain("\nparams:");
  });

  it("answers 500 with the delete envelope when the repository rejects", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    todosRepository.deleteTodo.mockRejectedValue(DRIVER_ERROR);

    const response = await DELETE(identifiedDelete(), contextFor(TODO_ID));

    expect(response.status).toBe(500);
    // Equality covers the kind too: `delete` is what `errorKindForMethod`
    // maps a `DELETE` to, and reporting it as `update` or `load` would put the
    // wrong copy in the single error slot.
    await expect(response.json()).resolves.toEqual(DELETE_ENVELOPE);
  });

  it("never forwards the driver's text to the wire", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    todosRepository.deleteTodo.mockRejectedValue(DRIVER_ERROR);

    const serialized = await (
      await DELETE(identifiedDelete(), contextFor(TODO_ID))
    ).text();

    // Equality, not "some string": the driver's own text is a string too, so
    // `expect.any(String)` would pass on exactly the leak this guards against.
    expect(JSON.parse(serialized).error.message).toBe(DELETE_FAILED_MESSAGE);
    // SQL fragments only: the word "delete" on its own is also the error
    // *kind* every failure here legitimately carries.
    for (const fragment of [
      "Failed query",
      "owner_id",
      '"todo"',
      "delete from",
      TODO_ID,
      OWNER_ID,
    ]) {
      expect(serialized).not.toContain(fragment);
    }
  });

  it("logs strings only, the statement summary among them, and nothing after \\nparams:", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    todosRepository.deleteTodo.mockRejectedValue(DRIVER_ERROR);

    await DELETE(identifiedDelete(), contextFor(TODO_ID));

    expect(logged).toHaveBeenCalledTimes(1);
    // Something diagnostic survives — the SQL this repository wrote — and the
    // bound parameters do not.
    expect(logged.mock.calls[0]).toContain(`Failed query: ${DELETE_STATEMENT}`);
    for (const argument of logged.mock.calls[0]) {
      expect(typeof argument).toBe("string");
      expect(argument).not.toContain("params:");
      expect(argument).not.toContain(OWNER_ID);
      expect(argument).not.toContain(TODO_ID);
    }
  });

  it("answers the same enveloped 500 when the identity lookup itself fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    identityRepository.findClientIdentityByTokenHash.mockRejectedValue(
      new Error("Failed query: select from client_identity"),
    );

    const response = await DELETE(
      deleteRequest(`${IDENTITY_COOKIE_NAME}=${mintIdentityToken()}`),
      contextFor(TODO_ID),
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual(DELETE_ENVELOPE);
  });

  it("answers the same enveloped 500 when the params promise itself rejects", async () => {
    // `params` is the platform's promise, and an unhandled rejection here
    // would escape as an unenveloped crash rather than as the error shape
    // AD-10 requires of every failure.
    vi.spyOn(console, "error").mockImplementation(() => {});
    identifyTheCaller();
    const params = Promise.reject(new Error("params unavailable"));
    // Vitest fails a run on an unhandled rejection, and this one is only
    // handled once `resolveClientIdentity` has resolved — a turn later than
    // Node's watcher looks. The handler still awaits the rejecting promise
    // itself; this second consumer only tells the watcher someone is home.
    params.catch(() => {});

    const response = await DELETE(
      deleteRequest(`${IDENTITY_COOKIE_NAME}=${mintIdentityToken()}`),
      { params },
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual(DELETE_ENVELOPE);
  });
});

describe("DELETE /api/todos/:id — no identity is ever issued, and every answer is one caller's", () => {
  // AD-17: a route handler reads an identity and never creates one. And every
  // response here is decided by the identity cookie, so without the two
  // headers a shared cache may key it on the URL alone and hand one person's
  // `204` — or `401` — to the next caller.
  it.each([
    [
      "the 204",
      async () => {
        todosRepository.deleteTodo.mockResolvedValue(undefined);
        return DELETE(identifiedDelete(), contextFor(TODO_ID));
      },
    ],
    [
      "the 400 for a malformed id",
      async () => DELETE(identifiedDelete("x"), contextFor("x")),
    ],
    ["the 401", async () => DELETE(deleteRequest(), contextFor(TODO_ID))],
    [
      "the 500",
      async () => {
        vi.spyOn(console, "error").mockImplementation(() => {});
        todosRepository.deleteTodo.mockRejectedValue(new Error("unreachable"));
        return DELETE(identifiedDelete(), contextFor(TODO_ID));
      },
    ],
  ])("issues no identity and marks %s private", async (_case, respond) => {
    const response = await respond();

    expect(identityRepository.createClientIdentity).not.toHaveBeenCalled();
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    // The exact value, not a `/\bCookie\b/` match: `privateToTheCaller`
    // appends rather than sets, so a double wrap yields `Cookie, Cookie` —
    // valid HTTP, and exactly what a word-boundary match fails to catch.
    expect(response.headers.get("vary")).toBe("Cookie");
  });
});

describe("the route's exported surface", () => {
  // The same exclusion `app/api/todos/route.test.ts` makes: Next.js recognises
  // route *segment config* exports, which are declarations about how the route
  // runs rather than endpoints.
  const SEGMENT_CONFIG = new Set([
    "dynamic",
    "dynamicParams",
    "revalidate",
    "fetchCache",
    "runtime",
    "preferredRegion",
    "maxDuration",
  ]);

  it("exports the two methods this segment serves and their two messages", () => {
    // Story 5.1's `DELETE` landed in this file and updated this list, which is
    // what the previous wording said would happen. The list stays exact: an
    // extra export here is an endpoint nobody designed, and a missing one is a
    // handler Next.js would answer `405` for.
    const surface = Object.keys(routeModule)
      .filter((name) => !SEGMENT_CONFIG.has(name))
      .sort();

    expect(surface).toEqual([
      "DELETE",
      "DELETE_FAILED_MESSAGE",
      "PATCH",
      "UPDATE_FAILED_MESSAGE",
    ]);
  });
});

describe("the whole app surface — no toggle anywhere in it (AC2)", () => {
  // AC2 is about the route *tree*, not about this one module, so the tree is
  // what is enumerated: a toggle endpoint added as a third route file would
  // pass every other test in this repository and fail here.
  const HTTP_METHODS = [
    "GET",
    "HEAD",
    "POST",
    "PUT",
    "PATCH",
    "DELETE",
    "OPTIONS",
  ];

  // Every extension the App Router treats as a route file, not just the one
  // this repository happens to use: `route.js` beside `route.ts` is a route,
  // and a scan that only knew `.ts` would let it through. Next resolves these
  // from `pageExtensions`, whose default is `["tsx", "ts", "jsx", "js"]`
  // (`node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/pageExtensions.md`);
  // `.mjs`/`.cjs`/`.mts`/`.cts` are added here because `next.config.ts` sets no
  // `pageExtensions`, so the day it does, this list is already wider than the
  // default rather than narrower.
  const ROUTE_FILES = new Set(
    ["ts", "tsx", "js", "jsx", "mjs", "cjs", "mts", "cts"].map(
      (extension) => `route.${extension}`,
    ),
  );

  // `app/` and not `app/api/`: a route file is a route file wherever it sits,
  // and `app/todos/toggle/route.ts` would be an endpoint this scan exists to
  // catch. Resolved from this file's own URL rather than `process.cwd()`, so a
  // run started from another directory fails on an assertion rather than on an
  // ENOENT that names neither the test nor the reason.
  const APP_ROOT = fileURLToPath(new URL("../../..", import.meta.url));

  /** Every route file under `app/`, as a path relative to `app/`. */
  function routeFiles(directory: string): string[] {
    return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) return routeFiles(full);
      if (!ROUTE_FILES.has(entry.name)) return [];
      return [path.relative(APP_ROOT, full)];
    });
  }

  it("holds exactly the two route files Epics 1-4 designed", () => {
    expect(routeFiles(APP_ROOT).sort()).toEqual([
      path.join("api", "todos", "[id]", "route.ts"),
      path.join("api", "todos", "route.ts"),
    ]);
  });

  it("offers GET and POST on the collection and PATCH and DELETE on the one Todo, and nothing else", async () => {
    // Imported rather than pattern-matched, so what is enumerated is what
    // Next.js would actually route: an endpoint exported as `export const
    // PUT = …` counts exactly as much as a function declaration does.
    const collection = await import("../route");
    const one = await import("./route");

    const methodsOf = (routeFile: object) =>
      Object.keys(routeFile)
        .filter((name) => HTTP_METHODS.includes(name))
        .sort();

    expect(methodsOf(collection)).toEqual(["GET", "POST"]);
    expect(methodsOf(one)).toEqual(["DELETE", "PATCH"]);
  });

  it("names no toggle in a path segment or an export (AC2)", async () => {
    // "No endpoint whose result depends on the current state" cannot be read
    // off a name, but the name is where such an endpoint announces itself, and
    // `Done` is banned vocabulary throughout besides.
    const banned = /toggle|flip|invert|\bdone\b/i;

    for (const file of routeFiles(APP_ROOT)) expect(file).not.toMatch(banned);

    const modules = [await import("../route"), await import("./route")];
    for (const routeFile of modules) {
      for (const name of Object.keys(routeFile)) {
        expect(name).not.toMatch(banned);
      }
    }
  });
});
