import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Poppins } from "next/font/google";
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

// Placeholder root layout. Story 1.7 mounts the query client, the live regions
// and the error slot here.
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={poppins.variable}>
      <body>{children}</body>
    </html>
  );
}
