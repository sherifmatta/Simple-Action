import { NextResponse } from "next/server";

// Pass-through for now. Story 1.6 mints and sets the Client Identity cookie
// here, on the document request, before any API call is possible (AD-17).
export function middleware() {
  return NextResponse.next();
}

export const config = {
  // Document requests only. `api` and `_next` are matched with `(/|$)` rather
  // than a bare trailing slash: the slash alone keeps sibling routes such as
  // /api-docs out of the lookahead, but it also lets the extensionless `/api`
  // itself through, which would run identity minting on an API request
  // contrary to AD-17. The `.*\..*` branch excludes anything with a file
  // extension, which is what covers robots.txt, favicon.ico and
  // /_next/data/*.json. The groups are non-capturing: Next.js's route parser
  // rejects a capturing group in a matcher outright, which fails the build.
  // `middleware.test.ts` pins all four cases.
  matcher: ["/((?!api(?:/|$)|_next(?:/|$)|.*\\..*).*)"],
};
