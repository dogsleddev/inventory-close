import { useEffect, useRef } from "react";

/**
 * The §7 drawer contract in one place: opening moves focus to the drawer's
 * heading, Tab cycles inside the drawer rather than escaping into the page
 * behind it, and Escape closes and hands focus back to whatever opened it —
 * so a keyboard reviewer returns to the row they left.
 */

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function useDrawerFocus<T extends HTMLElement = HTMLElement>(
  onClose: () => void,
  /** Re-run when the drawer swaps to a different object. */
  objectKey?: string,
) {
  const rootRef = useRef<T | null>(null);
  const headingRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    headingRef.current?.focus();

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const root = rootRef.current;
      if (root === null) return;

      const stops = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (stops.length === 0) {
        event.preventDefault();
        headingRef.current?.focus();
        return;
      }
      const first = stops[0];
      const last = stops[stops.length - 1];
      if (first === undefined || last === undefined) return;
      const active = document.activeElement;

      if (active === null || !root.contains(active)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
        return;
      }
      if (event.shiftKey && (active === first || active === headingRef.current)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      if (opener !== null && document.body.contains(opener)) opener.focus();
    };
  }, [onClose, objectKey]);

  return { rootRef, headingRef };
}
