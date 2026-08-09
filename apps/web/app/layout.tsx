import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Inventory Close Gaurd",
  description:
    "The evidence layer between NetSuite inventory operations and the financial close. Synthetic FY2026 prototype for the fictional KestrelGrid AI.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
