import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { IDENTITY_COOKIE_ATTRIBUTES, IDENTITY_COOKIE_NAME } from "@/server/identity/identity-cookie";
import { hashIdentityToken, mintIdentityId, mintIdentityToken } from "@/server/identity/identity-token";
import {
  errorKindForMethod,
  privateToTheCaller,
  resolveClientIdentity,
  unauthorizedIdentityResponse,
} from "@/server/identity/request-identity";
import { createClientIdentity } from "@/server/repository/client-identity";
import type { ErrorEnvelope } from "@/shared/contract/errors";

// The one identity-issuing path in the codebase (AD-17, Story 1.6 AC6).
//
// AD-17 puts issuance on the *document* request because `EXPERIENCE.md` makes
// the input live before the list arrives: on a first visit a GET and a POST can
// both be in flight with no cookie yet, and an API route allowed to mint would
// give each its own identity, landing the first Todo in a different Todo List
// from the one being read. So this file mints and every route handler only
// reads.
//
// The same middleware covers `app/api/` — not to issue there, but to refuse
// there. A request under `app/api/` with no valid identity is answered `401`
// before it reaches a route handler, which makes AC4 true for every route
// handler by construction rather than by each one remembering to check. Route
// handlers still call `resolveClientIdentity` for the `ownerId` they scope on;
// this is the wall in front of them, not a substitute for it.
//
// Note: Next.js 16 deprecated the `middleware` file convention in favour of
// `proxy.ts` (same behaviour, new file and export names, codemod
// `middleware-to-proxy`). The rename is deliberately not done here: Story 1.6
// AC6 and ARCHITECTURE-SPINE's source tree both name `middleware.ts`, so it is
// a repository-wide rename of its own, not a side effect of this story.

// `/api` exactly, or anything beneath it. `startsWith("/api")` alone would also
// claim a sibling document route such as `/api-docs`.
function isApiRequest(pathname: string): boolean {
  return pathname === "/api" || pathname.startsWith("/api/");
}

// The identity store is unreachable, so we cannot tell whether this request has
// an identity. `401` would be a lie — it asserts the caller has none — so the
// failure is reported as one, enveloped (AD-10) and classified by the operation
// attempted, and the client's single error slot offers its Retry.
function identityUnavailableResponse(method: string): Response {
  const body: ErrorEnvelope = {
    error: {
      kind: errorKindForMethod(method),
      message: "The Client Identity store is unreachable.",
    },
  };

  return privateToTheCaller(Response.json(body, { status: 503 }));
}

export async function middleware(request: NextRequest) {
  const api = isApiRequest(request.nextUrl.pathname);

  try {
    const identity = await resolveClientIdentity(request);

    if (api) {
      // Never mints — not even when the identity is absent (AC4).
      return identity ? NextResponse.next() : unauthorizedIdentityResponse(request.method);
    }

    // A cookie that resolves to a row is left alone: no new token, no new row
    // (AC3). An unknown or empty cookie value falls through and is replaced,
    // so a browser holding a stale token is not locked out of the product.
    if (identity) return NextResponse.next();

    const token = mintIdentityToken();
    await createClientIdentity(mintIdentityId(), await hashIdentityToken(token));

    const response = NextResponse.next();
    // The raw token goes to the browser and nowhere else; only its SHA-256 was
    // stored above (AC5).
    //
    // It is set on the *response*, so it is not visible to anything rendering
    // in this same pass — `request.cookies` still has none. Nothing in this
    // architecture needs it to be: pages and layouts are walled off
    // `src/server/` by `eslint.config.mjs`, so only a route handler ever reads
    // an identity, and the browser's first API call carries the cookie this
    // response just set.
    response.cookies.set(IDENTITY_COOKIE_NAME, token, IDENTITY_COOKIE_ATTRIBUTES);
    return response;
  } catch (error) {
    // Neon auto-suspends, so an unreachable identity store is an ordinary
    // transient, not an impossible state. A document request is served without
    // a cookie rather than replaced by an error page: the shell renders, its
    // API calls answer `401`, the user sees the designed load failure with its
    // Retry (AD-9), and the next document request mints. Letting this throw
    // would make a database blip look like a broken product.
    //
    // The message only — never the error object, which carries the query, and
    // never the token.
    console.error(
      "Client Identity unavailable:",
      error instanceof Error ? error.message : "unknown error",
    );

    return api ? identityUnavailableResponse(request.method) : NextResponse.next();
  }
}

export const config = {
  // Two entries.
  //
  // The first is document requests. `_next` is matched with `(/|$)` rather than
  // a bare trailing slash: the slash alone keeps sibling routes such as
  // /_nextdoor out of the lookahead, but it also lets the extensionless `/_next`
  // itself through. The `.*\..*` branch excludes anything with a file
  // extension, which is what covers robots.txt, favicon.ico and
  // /_next/data/*.json. The groups are non-capturing: Next.js's route parser
  // rejects a capturing group in a matcher outright, which fails the build.
  //
  // The second is everything under `app/api/`. It is listed separately, rather
  // than left to the first entry, because the first entry's extension carve-out
  // would otherwise exempt any route handler whose path carried a dot — and
  // AC4's `401` has to hold for *every* route under `app/api/`. `/api` itself
  // needs no entry: it carries no extension, so the first matcher already
  // covers it.
  //
  // `middleware.test.ts` pins these cases.
  matcher: ["/((?!api(?:/|$)|_next(?:/|$)|.*\\..*).*)", "/api/:path*"],
};
