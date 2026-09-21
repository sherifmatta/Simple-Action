import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Simple Action",
  description: "A Todo List small enough to finish.",
};

// Placeholder root layout. Story 1.2 loads the typeface, Story 1.7 mounts the
// query client, the live regions and the error slot here.
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
