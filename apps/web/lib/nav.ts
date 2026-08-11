/**
 * Primary navigation (docs/11, amended by COMPLETION_PLAN.md Stage A).
 *
 * Every entry resolves to a screen that exists. When a section was designed
 * but not built, it used to ship as a "not designed yet" placeholder in the
 * rail; a smaller complete product reads better than a larger one with holes
 * in it, so unbuilt sections are absent until they are real.
 *
 * Deliberately not a client module, so server components read the real array.
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
  { label: "How to Explore", href: "/user-guide" },
];
