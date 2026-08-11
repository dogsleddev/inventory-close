import type { Metadata } from "next";
import type { ReactNode } from "react";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "@fontsource-variable/fraunces";
import { THEME_BOOTSTRAP } from "../lib/theme";
import "./icg.css";

/**
 * Product identity and the one description a shared link shows.
 *
 * The description leads with what the product IS. An earlier version led
 * with the word "fictional", so a pasted link read as a disclaimer before it
 * read as a product — the synthetic nature is still stated, second, where it
 * belongs.
 */
const PRODUCT = "Inventory Close Gaurd";

const DESCRIPTION =
  "Evidence and close-control layer for a year-end inventory close — reconciling NetSuite, physical operations and accounting evidence. Synthetic FY2026 demonstration dataset.";

/**
 * Absolute base for og:image and canonical URLs, read from the deployment
 * rather than written down here. Two reasons: this source tree carries no
 * outbound URLs (test/synthetic-and-secrets.test.ts scans for them), and a
 * hard-coded host goes stale the first time the demo moves. Local
 * development falls back to the dev server's own origin.
 */
function siteBase(): URL {
  const configured = process.env.NEXT_PUBLIC_SITE_ORIGIN;
  if (configured !== undefined && configured !== "") return new URL(configured);
  const host =
    process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.VERCEL_URL ?? "";
  if (host !== "") return new URL(`https://${host}`);
  return new URL(`http://localhost:${process.env.PORT ?? "3000"}`);
}

export const metadata: Metadata = {
  metadataBase: siteBase(),
  /**
   * Every route sets its own `title`; the template appends the product name
   * so a tab strip full of this demo is still readable at 12 characters.
   */
  title: { default: PRODUCT, template: `%s · ${PRODUCT}` },
  description: DESCRIPTION,
  applicationName: PRODUCT,
  openGraph: {
    type: "website",
    siteName: PRODUCT,
    title: PRODUCT,
    description: DESCRIPTION,
  },
  twitter: {
    card: "summary_large_image",
    title: PRODUCT,
    description: DESCRIPTION,
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP }} />
      </head>
      <body className={`${GeistSans.variable} ${GeistMono.variable}`}>
        {children}
      </body>
    </html>
  );
}
