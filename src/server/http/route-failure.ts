// The two things every route handler under `app/api/` does with a failure:
// report it to the caller as the shared error envelope, and log it without
// putting the caller's own data in a log line (AD-10, SPINE "Logging").
//
// Both were born inside `app/api/todos/route.ts` with Stories 2.1 and 3.1,
// where one file held every endpoint. Story 4.1 adds a second route file, and a
// second copy of a redaction rule is a redaction rule that can drift: the day
// one of them learns about a new leaky field, the other is the leak. They move
// here rather than being duplicated.
//
// A sibling of `src/server/validation/`, and for the same reason — server-side
// machinery that is not a repository, not the schema and not identity. The
// `src/server/` ESLint block already covers it: no Drizzle, no Drizzle client,
// no `src/client/` import.
//
// This module imports the shared contract and nothing else, deliberately.
// `errorKindForMethod` lived in `request-identity.ts` until Story 4.1, and that
// module value-imports the Client Identity repository, which constructs the
// Drizzle client at module scope and throws without `DATABASE_URL`. Importing
// the kind from there made a pair of pure string helpers unloadable without a
// database — `DATABASE_URL="" npx vitest run src/server/http` failed at import
// and ran nothing. The classification is a fact about HTTP methods, not about
// identity, so it moved here with them and `request-identity.ts` now imports
// it back.
import type { ErrorEnvelope, ErrorKind } from "@/shared/contract/errors";

/**
 * The error kind for a request that failed before it did anything.
 *
 * AD-10 classifies a failure by the operation attempted rather than by the
 * response, and under `app/api/` the method is the operation: the REST verbs of
 * ARCHITECTURE-SPINE's endpoint table map one-to-one onto the four kinds. `GET`
 * is the default rather than a case of its own, so a method nobody planned for
 * still produces a kind the single error slot can classify.
 */
export function errorKindForMethod(method: string): ErrorKind {
  switch (method.toUpperCase()) {
    case "POST":
      return "create";
    case "PUT":
    case "PATCH":
      return "update";
    case "DELETE":
      return "delete";
    default:
      return "load";
  }
}

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
 * a log line — exactly what SPINE "Logging" and Story 3.1 AC11 forbid.
 *
 * Everything from the `\nparams:` line onwards is therefore cut, leaving the
 * statement summary, which is SQL this repository wrote and carries nothing of
 * the caller's. `error.name` is the fallback for a message that is empty or was
 * entirely params, so a failure is never logged as a blank line.
 *
 * Applied in every catch block on every endpoint, and not only the ones whose
 * query happens to bind a Todo's text today: insulation that depends on which
 * query is running is insulation that breaks the first time a query changes —
 * and `resolveClientIdentity` runs inside all of them.
 */
export function logSafeError(error: unknown): string {
  if (!(error instanceof Error)) return "unknown error";

  const [summary] = error.message.split("\nparams:");

  return summary.trim() || error.name || "unknown error";
}

/**
 * The enveloped refusal for a request an endpoint would not or could not serve.
 *
 * The kind comes from `errorKindForMethod` rather than a literal, for the same
 * reason `unauthorizedIdentityResponse` takes a method: AD-10 classifies a
 * failure by the operation attempted, and this helper now serves three methods
 * across two route files. A hardcoded `load` would report a failed create or a
 * failed update to the single error slot as a failed read, and the slot would
 * show the wrong copy.
 *
 * The message is a parameter and never composed from a caught error.
 * `ErrorEnvelope["error"]["message"]` is an unconstrained `string` crossing the
 * wire, so a driver error interpolated here would put SQL text — table names,
 * the failing statement — in the browser. Every caller passes one of its own
 * module's fixed message constants; the real error is logged instead.
 *
 * Pairing a status with a message is still the caller's to get right;
 * `deferred-work.md` records making that pairing structural, and Story 4.1
 * deliberately does not take it — a `{status, message}` descriptor type would
 * still let any caller pair any two, so it buys nothing until there is a
 * catalogue to pair against.
 */
export function requestFailedResponse(
  method: string,
  status: number,
  message: string,
): Response {
  const body: ErrorEnvelope = {
    error: { kind: errorKindForMethod(method), message },
  };

  return Response.json(body, { status });
}
