"use client";

import type { ShellData } from "../lib/view-model";
import { AppShell } from "./AppShell";

/**
 * The shell's own "not designed yet" state (design 01): the shell, status
 * system, chips and drawers are final and will carry the screen when it is
 * built in a later stage. No placeholder content — an empty screen must
 * never read as a zero balance.
 */
export function NotDesignedScreen({
  shell,
  section,
  setRoleAction,
}: {
  shell: ShellData;
  section: string;
  setRoleAction: (userId: string) => Promise<void>;
}) {
  return (
    <AppShell
      shell={shell}
      section={section}
      setRoleAction={setRoleAction}
      drawerOpen={false}
      askSuggestions={["What prevents sign-off?"]}
      askContext={`FY2026 Inventory Close · ${section}`}
    >
      <main className="icg-workspace">
        <div className="icg-page-head">
          <div>
            <h1 className="icg-page-title">{section}</h1>
            <div className="icg-page-context">FY2026 · balance-sheet date Dec. 31, 2026</div>
          </div>
        </div>
        <div className="icg-notdesigned">
          <div className="icg-notdesigned-inner">
            <span className="icg-notdesigned-glyph" aria-hidden>
              ○
            </span>
            <div style={{ fontSize: "14px", fontWeight: 600 }}>
              {section} is not designed yet
            </div>
            <div className="icg-soft" style={{ fontSize: "12.5px", lineHeight: 1.6 }}>
              The shell, status system, chips and drawers on this page are final and will
              carry this screen when it is built in a later stage. No placeholder content is
              shown, because an empty screen must never read as a zero balance.
            </div>
          </div>
        </div>
      </main>
    </AppShell>
  );
}
