import type { NextRequest } from "next/server";

import {
  errorKindForMethod,
  privateToTheCaller,
  resolveClientIdentity,
  unauthorizedIdentityResponse,
} from "@/server/identity/request-identity";
import { createTodo, listTodos } from "@/server/repository/todos";
import { isCanonicalUuidV7 } from "@/server/validation/todo-id";
import type { ErrorEnvelope } from "@/shared/contract/errors";
import { isValidTodoText } from "@/shared/contract/validation";

// The first route handler in the codebase (AD-1: every client-server
// interaction is a REST route handler, never a Server Action).
//
// It reads an identity and never issues one (AD-17). `middleware.ts` already
// answers `401` for any `/api/**` request without a valid identity, so in
// production this handler's own `401` is a second wall rather than the only
// one — but it is the wall that makes the behaviour true of the handler
// itself, which is what a direct call to `GET` or `POST` (a test, a future
// runtime that skips the matcher) exercises.
//
// The identity is resolved here rather than read from a header middleware
// forwarded. `deferred-work.md` records the trusted-header remedy for the
// second indexed `SELECT` this costs; it is deliberately not taken, so
// ownership is derived from the cookie in exactly one way and no route handler
// ever trusts request-supplied ownership.

/**
 * The body of every failure `GET` reports.
 *
 * Fixed, and never composed from the caught error. `ErrorEnvelope["error"]["message"]`
 * is an unconstrained `string` crossing the wire, so a driver error interpolated
 * here would put SQL text — table names, the failing statement — in the browser.
 * The real error is logged instead. AD-10 already says the client never forwards
 * this message to the interface; this is the other half of that rule, enforced at
 * the site that produces it.
 *
 * Exported so `route.test.ts` can assert equality rather than "some string",
 * which a driver error would also satisfy.
 */
export const LOAD_FAILED_MESSAGE = "The Todo List could not be read.";

/**
 * The body of every failure `POST` reports — its own string, not a reuse.
 *
 * One message covers the `400`, the `409` and the `500` deliberately. AC4 asks
 * that a create refused for a foreign owner disclose nothing about the row
 * holding that id, and "that id is taken" is itself a disclosure; a single
 * fixed message says only that this create did not happen, which is all the
 * client is entitled to and all AD-10 lets it do anything with. The status code
 * is what carries the distinction, for the caller that is our interface.
 *
 * Exported for the same reason as `LOAD_FAILED_MESSAGE`: so `route.test.ts` can
 * assert equality rather than "some string", which a driver error would satisfy.
 */
export const CREATE_FAILED_MESSAGE = "The Todo could not be created.";

/**
 * The most a caught value is allowed to contribute to a log line.
 *
 * Not defensiveness: Drizzle puts the bound parameters of the failing statement
 * into the error's own `message`. `DrizzleQueryError` is constructed as
 * `` new Error(`Failed query: ${query}\nparams: ${params}`) ``
 * (`node_modules/drizzle-orm/errors.js`, `DrizzleQueryError`'s constructor) and
 * is thrown around every query from `drizzle-orm/pg-core/session.js`'s
 * `queryWithCache`. The submitted Todo text is a bound parameter of the
 * `createTodo` insert, so `console.error(error.message)` would put that text in
 * a log line — exactly what SPINE "Logging" and AC11 forbid.
 *
 * Everything from the `\nparams:` line onwards is therefore cut, leaving the
 * statement summary, which is SQL this repository wrote and carries nothing of
 * the caller's. `error.name` is the fallback for a message that is empty or was
 * entirely params, so a failure is never logged as a blank line.
 *
 * Applied in both catch blocks, and not only in `POST`'s. `GET`'s bound
 * parameter is an owner id today, but insulation that depends on which query
 * happens to be running is insulation that breaks the first time a query
 * changes — and `resolveClientIdentity` runs inside both.
 */
function logSafeError(error: unknown): string {
  if (!(error instanceof Error)) return "unknown error";

  const [summary] = error.message.split("\nparams:");

  return summary.trim() || error.name || "unknown error";
}

/**
 * The enveloped refusal for a request this endpoint would not or could not
 * serve.
 *
 * The kind comes from `errorKindForMethod` rather than a literal, for the same
 * reason `unauthorizedIdentityResponse` takes a method: AD-10 classifies a
 * failure by the operation attempted, and this file now serves two. A hardcoded
 * `load` would report a failed create to the single error slot as a failed
 * read, and the slot would show the wrong copy.
 *
 * The message is a parameter and never composed from a caught error.
 * `ErrorEnvelope["error"]["message"]` is an unconstrained `string` crossing the
 * wire, so a driver error interpolated here would put SQL text — table names,
 * the failing statement — in the browser. Every caller passes one of the two
 * module constants above; the real error is logged instead.
 */
function requestFailedResponse(
  method: string,
  status: number,
  message: string,
): Response {
  const body: ErrorEnvelope = {
    error: { kind: errorKindForMethod(method), message },
  };

  return Response.json(body, { status });
}

/**
 * `GET /api/todos` — the caller's Todo List, ordered `id DESC` (AD-5).
 *
 * The success body is a bare JSON array with no envelope (SPINE "Error shape":
 * success responses are the bare resource or a bare array). An empty array is a
 * success, not a failure — Story 2.6's empty state is what renders it.
 */
export async function GET(request: NextRequest): Promise<Response> {
  try {
    const identity = await resolveClientIdentity(request);
    // Already marked private by the helper, which is also what `middleware.ts`
    // answers with — so the `401` a browser receives carries the same headers
    // whether or not it ever reaches this handler.
    if (!identity) return unauthorizedIdentityResponse(request.method);

    return privateToTheCaller(Response.json(await listTodos(identity.id)));
  } catch (error) {
    // The statement summary only — never the error object, which carries the
    // query, and never the message whole, which carries the bound parameters
    // (SPINE "Logging": no Todo text in any log line). See `logSafeError`.
    console.error("GET /api/todos failed:", logSafeError(error));

    return privateToTheCaller(
      requestFailedResponse(request.method, 500, LOAD_FAILED_MESSAGE),
    );
  }
}

/**
 * The `POST` body, as the wire actually delivers it.
 *
 * Local rather than shared: `contract.test.ts` fails any type outside
 * `src/shared/contract/` that spells out `text`, `completed` and `createdAt`
 * together, and that directory is pinned at three modules, so a shared request
 * type has nowhere to live. It declares two of the three fields and is a
 * request rather than a resource — the server sets the other two (AC1), which
 * is exactly why this is not a `Todo` minus fields.
 */
type CreateTodoRequest = { id: string; text: string };

/**
 * Whether a parsed body is shaped like a create at all.
 *
 * Structural only — the id's form and the text's length are checked separately
 * below, so a malformed body, a bad id and an empty text all reach the same
 * refusal by three explicit steps rather than one clever predicate. `unknown`
 * in, because `request.json()` returns whatever arrived: a JSON array, a
 * string, `null` and a number are all valid JSON and none of them is a create.
 */
function isCreateTodoRequest(body: unknown): body is CreateTodoRequest {
  if (typeof body !== "object" || body === null) return false;

  return (
    "id" in body &&
    typeof body.id === "string" &&
    "text" in body &&
    typeof body.text === "string"
  );
}

/**
 * `POST /api/todos` — store one Todo the caller minted the id for.
 *
 * The order of the three gates is load-bearing. Identity first, so a request
 * carrying no Client Identity is `401` whatever else is wrong with it and the
 * endpoint tells an unidentified caller nothing about its validation (AC6).
 * Validation second, so a bad id or an empty text is `400` before any query
 * runs and no row can be created by a request that was never valid (AC7, AC8).
 * The repository last, which is also the only thing here that touches the
 * database: this handler builds no query (AC5).
 *
 * `isValidTodoText` and the cap it enforces are the shared contract's, imported
 * and never retyped (AC9) — the same predicate the input calls at entry, run
 * again here because the API must be safe against a caller that is not our
 * interface. The predicate returns a verdict and hands back no string, so the
 * trim that AC10 requires to persist is performed at the call below.
 *
 * Success is the created Todo bare, with no envelope: `201` when a row was
 * written, `200` when this was a retry of a create that had already landed.
 * Those two are what let a client tell a create from a replay.
 */
export async function POST(request: NextRequest): Promise<Response> {
  try {
    const identity = await resolveClientIdentity(request);
    if (!identity) return unauthorizedIdentityResponse(request.method);

    // Swallowed rather than thrown into the catch below, and not merely for
    // tidiness: `SyntaxError` from `JSON.parse` quotes the offending input, so
    // logging it would put a fragment of the submitted body — the Todo's own
    // text — in a log line, which SPINE "Logging" forbids (AC11). A body that
    // is not JSON is a caller error, not a server failure, and answers `400`.
    const submitted: unknown = await request.json().catch(() => undefined);

    if (
      !isCreateTodoRequest(submitted) ||
      !isCanonicalUuidV7(submitted.id) ||
      !isValidTodoText(submitted.text)
    ) {
      return privateToTheCaller(
        requestFailedResponse(request.method, 400, CREATE_FAILED_MESSAGE),
      );
    }

    const result = await createTodo(
      identity.id,
      submitted.id,
      submitted.text.trim(),
    );

    if (result.outcome === "foreign-owner") {
      return privateToTheCaller(
        requestFailedResponse(request.method, 409, CREATE_FAILED_MESSAGE),
      );
    }

    return privateToTheCaller(
      Response.json(result.todo, {
        status: result.outcome === "created" ? 201 : 200,
      }),
    );
  } catch (error) {
    // The statement summary only — never the error object, which carries the
    // query, and never the message whole: the submitted text is a bound
    // parameter of the `createTodo` insert and Drizzle interpolates the
    // parameters into the message (SPINE "Logging": no Todo text in any log
    // line, AC11). `logSafeError` is where that is cut off, and it is the only
    // thing in this handler that a failure's text reaches.
    console.error("POST /api/todos failed:", logSafeError(error));

    return privateToTheCaller(
      requestFailedResponse(request.method, 500, CREATE_FAILED_MESSAGE),
    );
  }
}
