/**
 * Primary navigation (docs/11, amended by COMPLETION_PLAN.md Stage A).
 *
 * Every entry resolves to a screen that exists. When a section was designed
 * but not built, it used to ship as a "not designed yet" placeholder in the
 * rail; a smaller complete product reads better than a larger one with holes
 * in it, so unbuilt sections are absent until they are real.
 *
 * Deliberately not a client module, so server components read the real array.
 *
 * GROUPED, and two entries shorter than it used to be. Seventeen flat items
 * asked the reader to hold the whole product in their head at once. The five
 * groups below are the close's own order of operations — what we have, what
 * we checked, what is outstanding, what we produce — so a reader can ignore
 * four fifths of the rail and still be somewhere sensible.
 *
 * Cutoff and Ownership left the rail in the same change. They were never
 * screens: both rendered `ExceptionsScreen` with a different control-domain
 * lens, so they are now filters ON the exception queue, where a reader
 * already is when they care about either. `/cutoff` and `/ownership` redirect
 * rather than 404 — the site is publicly deployed and links may exist.
 *
 * `NAV_ITEMS` is the flat projection. It exists because the rail is not the
 * only consumer: several tests walk every navigable destination, and asking
 * each of them to flatten the groups themselves is how one of them would
 * quietly stop covering a section.
 */

export interface NavItem {
  readonly label: string;
  readonly href: string;
}

export interface NavSection {
  /** Shown above the group in the rail; hidden when the rail is collapsed. */
  readonly title: string;
  readonly items: readonly NavItem[];
}

export const NAV_SECTIONS: readonly NavSection[] = [
  {
    title: "Start",
    items: [
      { label: "Overview", href: "/" },
      { label: "How to Explore", href: "/user-guide" },
    ],
  },
  {
    title: "The Book",
    items: [
      { label: "Inventory", href: "/inventory" },
      { label: "Procurement", href: "/procurement" },
      { label: "Costing", href: "/costing" },
    ],
  },
  {
    title: "Assertions",
    items: [
      { label: "Physical Count", href: "/physical-count" },
      { label: "Custody & Disposition", href: "/custody" },
      { label: "Valuation", href: "/valuation" },
    ],
  },
  {
    title: "The Close",
    items: [
      { label: "Exceptions", href: "/exceptions" },
      { label: "Evidence", href: "/evidence" },
      { label: "Reconciliation", href: "/reconciliation" },
      { label: "Adjustments", href: "/adjustments" },
    ],
  },
  {
    title: "Output",
    items: [
      { label: "Audit Package", href: "/audit-package" },
      { label: "Methodology", href: "/methodology" },
      { label: "Close Memo", href: "/close-memo" },
    ],
  },
];

/**
 * Every navigable destination, in rail order.
 *
 * Derived from the sections rather than maintained beside them: a second
 * hand-written list is a test with an expiry date nobody set.
 */
export const NAV_ITEMS: readonly NavItem[] = NAV_SECTIONS.flatMap((s) => s.items);

/**
 * Routes that used to be rail entries and now redirect into a filtered
 * `/exceptions`. Exported so the redirect stubs and the tests that prove the
 * old URLs still resolve read ONE list.
 */
export const FOLDED_ROUTES: Readonly<Record<string, string>> = {
  "/cutoff": "/exceptions?filter=cutoff",
  "/ownership": "/exceptions?filter=ownership",
};
