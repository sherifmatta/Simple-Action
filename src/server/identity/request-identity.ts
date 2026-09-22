// The Client Identity as seen from an incoming request (AD-7, AD-17).
//
// Two functions, and neither of them mints: resolving a request to the identity
// its cookie already names, and building the `401` for a request that has none.
// Issuing is `middleware.ts`'s alone (AC6), which is why the repository's create
// is not imported here — only its lookup is.
import type { NextRequest } from "next/server";
import type { ErrorEnvelope, ErrorKind } from "@/shared/contract/errors";
import type { ClientIdentity } from "@/server/repository/client-identity";
import { findClientIdentityByTokenHash } from "@/server/repository/client-identity";
import { IDENTITY_COOKIE_NAME } from "./identity-cookie";
import { hashIdentityToken } from "./identity-token";

/**
 * The Client Identity this request's cookie resolves to, or `undefined`.
 *
 * `undefined` covers all three ways a request can lack one — no cookie at all,
 * an empty cookie, and a cookie whose token names no row (a forged value, or a
 * row that has since been removed). The caller decides what that means:
 * `middleware.ts` mints on a document request, and answers `401` under
 * `app/api/` (AD-17). This function never writes.
 */
export async function resolveClientIdentity(
  request: NextRequest,
): Promise<ClientIdentity | undefined> {
  const token = request.cookies.get(IDENTITY_COOKIE_NAME)?.value;
  if (!token) return undefined;

  return findClientIdentityByTokenHash(await hashIdentityToken(token));
}

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
 * Marks a response as one caller's, and cacheable by nobody.
 *
 * Every response under `app/api/` is decided by the identity cookie, including
 * the refusals below: a cache keying on the URL alone would hand this `401` to a
 * caller who does carry a cookie, or hand one person's Todo List to the next
 * caller. `Vary` is appended rather than set, so the platform's own
 * `Accept-Encoding` entry survives, and appending is guarded so the helper is
 * idempotent.
 *
 * Added by Story 2.1 for its route handler; applied here too, because the `401`
 * a browser actually receives is built by `middleware.ts` through the helper
 * below and never reaches the handler.
 */
export function privateToTheCaller<T extends Response>(response: T): T {
  response.headers.set("Cache-Control", "private, no-store");

  // Appended rather than set, so the platform's own `Accept-Encoding` entry
  // survives — and guarded, because `append` is not idempotent: wrapping one
  // response twice would otherwise yield `Vary: Cookie, Cookie`, which is
  // valid HTTP and passes a `/\bCookie\b/` assertion, so nothing would catch
  // it. The type parameter keeps a `NextResponse` a `NextResponse`, which is
  // what lets `middleware.ts` mark the response it mints the cookie on.
  if (!/\bCookie\b/i.test(response.headers.get("Vary") ?? "")) {
    response.headers.append("Vary", "Cookie");
  }

  return response;
}

/**
 * The `401` for a request under `app/api/` carrying no valid Client Identity.
 *
 * AD-17: a route handler reads an identity and never creates one, so a request
 * without one is refused rather than served. The body is the shared error
 * envelope (AD-10); the message is diagnostic only and the client never
 * forwards it.
 */
export function unauthorizedIdentityResponse(method: string): Response {
  const body: ErrorEnvelope = {
    error: {
      kind: errorKindForMethod(method),
      message: "No Client Identity on this request.",
    },
  };

  return privateToTheCaller(Response.json(body, { status: 401 }));
}
