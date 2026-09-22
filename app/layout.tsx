import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Poppins } from "next/font/google";
import { AppProviders } from "@/client/providers";
import "./globals.css";

// DESIGN.md §Typography: one typeface, Poppins. It ships no variable axis, so
// the three weights the ten typography roles use are requested explicitly.
//
// `adjustFontFallback` is left at its default (true) so next/font synthesises
// the metric-adjusted `Poppins Fallback` face — `local(Arial)` with
// ascent/descent/line-gap/size-adjust overrides — and the webfont swap
// contributes zero layout shift.
//
// `fallback` is deliberately NOT passed. Turbopack's next/font implementation
// treats a supplied fallback list as a *replacement* for the automatic
// fallback: pass one and the metric-adjusted face is never emitted, which
// trades away the zero-CLS guarantee. DESIGN.md's remaining fallback stack is
// therefore appended to `--font-poppins` in app/globals.css, producing the
// identical family list with the metric adjustment kept. `--font-poppins`
// resolves here to `"Poppins", "Poppins Fallback"`.
//
// The family is exposed only as a CSS variable — app/globals.css is the sole
// place the token is composed and read (AD-13).
const poppins = Poppins({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
  variable: "--font-poppins",
});

export const metadata: Metadata = {
  title: "Simple Action",
  description: "A Todo List small enough to finish.",
};

// The root layout is a Server Component and stays one (Next.js `layout.js`
// reference: the root layout must define `<html>` and `<body>`). The three
// shell singletons — the query client, the two live regions and the error slot
// — need React context, which Server Components cannot provide, so they are
// mounted through the one `"use client"` boundary in `@/client/providers`.
// Mounting them here, once, is what stops a feature story from inventing its
// own state store, its own `aria-live` element or its own error surface
// (AD-8, AD-9, AD-12).
//
// `<body>` carries the ground and the default ink, both resolving to
// DESIGN.md tokens transcribed in app/globals.css — no hex literal, no
// arbitrary value (AD-13).
//
// `min-h-dvh`, not `min-h-screen`: `100vh` is mobile Safari's *large*
// viewport, so the page would scroll by the URL-bar delta with no content
// under it. `dvh` is what "the ground is behind the card at every viewport
// height" actually means.
//
// `overflow-x-hidden` transcribes DESIGN.md:356 — "No horizontal scrolling on
// the page body, **ever**, at any viewport width" — which the mockups enforce
// on `body`. This story is the only one that owns `<body>`, so leaving it out
// would mean the first long-unbroken-Todo story has to rediscover it.
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={poppins.variable}>
      <body className="min-h-dvh overflow-x-hidden bg-ground text-text-primary">
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
