import type { NextRequest } from "next/server";

import {
  privateToTheCaller,
  resolveClientIdentity,
  unauthorizedIdentityResponse,
} from "@/server/identity/request-identity";
import { listTodos } from "@/server/repository/todos";
import type { ErrorEnvelope } from "@/shared/contract/errors";

// The first route handler in the codebase (AD-1: every client-server
// interaction is a REST route handler, never a Server Action).
//
// It reads an identity and never issues one (AD-17). `middleware.ts` already
// answers `401` for any `/api/**` request without a valid identity, so in
// production this handler's own `401` is a second wall rather than the only
// one — but it is the wall that makes the behaviour true of the handler
// itself, which is what a direct call to `GET` (a test, a future runtime that
// skips the matcher) exercises.
//
// The identity is resolved here rather than read from a header middleware
// forwarded. `deferred-work.md` records the trusted-header remedy for the
// second indexed `SELECT` this costs; it is deliberately not taken, so
// ownership is derived from the cookie in exactly one way and no route handler
// ever trusts request-supplied ownership.

/**
 * The body of every failure this endpoint reports.
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

function loadFailedResponse(): Response {
  const body: ErrorEnvelope = {
    error: { kind: "load", message: LOAD_FAILED_MESSAGE },
  };

  return Response.json(body, { status: 500 });
}

/**
 * `GET /api/todos` — the caller's Todo List, ordered `id DESC` (AD-5).
 *
 * The success body is a bare JSON array with no envelope (SPINE "Error shape":
 * success responses are the bare resource or a bare array). An empty array is a
 * success, not a failure — Story 2.8's empty state is what renders it.
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
    // The message only — never the error object, which carries the query, and
    // never the Todo text (SPINE "Logging": no Todo text in any log line).
    console.error(
      "GET /api/todos failed:",
      error instanceof Error ? error.message : "unknown error",
    );

    return privateToTheCaller(loadFailedResponse());
  }
}
