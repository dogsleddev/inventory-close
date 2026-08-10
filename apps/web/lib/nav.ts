/**
 * Primary navigation (docs/11): thirteen sections, numbered in rail order.
 * Shared by the client shell and the server section router — deliberately
 * not a client module so server components read the real array.
 */
export const NAV_SECTIONS: readonly { label: string; href: string }[] = [
  { label: "Overview", href: "/" },
  { label: "Inventory", href: "/inventory" },
  { label: "Physical Count", href: "/physical-count" },
  { label: "Cutoff", href: "/cutoff" },
  { label: "Ownership", href: "/ownership" },
  { label: "Valuation", href: "/valuation" },
  { label: "Exceptions", href: "/exceptions" },
  { label: "Evidence", href: "/evidence" },
  { label: "Reconciliation", href: "/reconciliation" },
  { label: "Adjustments", href: "/adjustments" },
  { label: "Audit Package", href: "/audit-package" },
  { label: "Assumptions", href: "/assumptions" },
  { label: "User Guide", href: "/user-guide" },
];
