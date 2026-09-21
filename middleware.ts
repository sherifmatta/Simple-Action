import { NextResponse } from "next/server";

// Pass-through for now. Story 1.6 mints and sets the Client Identity cookie
// here, on the document request, before any API call is possible (AD-17).
export function middleware() {
  return NextResponse.next();
}

export const config = {
  // Document requests only. `api/` and `_next/` carry the trailing slash on
  // purpose — without it the lookahead also swallows sibling routes such as
  // /api-docs. The `.*\..*` branch excludes anything with a file extension,
  // which is what actually covers robots.txt, favicon.ico and /_next/data/*.json.
  matcher: ["/((?!api/|_next/|.*\\..*).*)"],
};
