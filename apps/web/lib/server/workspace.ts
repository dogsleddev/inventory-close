import { createCommandService, createQueryService, createWorkspace } from "@icg/services";
import type {
  CommandService,
  QueryService,
  ServiceContext,
  Workspace,
} from "@icg/services";
import { DEMO_USERS } from "@icg/data";
import type { DemoUser } from "@icg/data";

/**
 * Server-side workspace singleton (stage 05). One deterministic workspace
 * per server process — the same shape a demo reset rebuilds. The UI reaches
 * data ONLY through the query service; there is no other import path from
 * components to @icg/data fixtures.
 */

import { registerLocationNames } from "./humanize";

const globalStore = globalThis as {
  __icgWorkspace?: Workspace;
  __icgLocationsRegistered?: boolean;
};

export function getWorkspace(): Workspace {
  // Survives Next dev-server module reloads without re-deriving the close.
  globalStore.__icgWorkspace ??= createWorkspace();
  return globalStore.__icgWorkspace;
}

export function getQueries(): QueryService {
  const queries = createQueryService(getWorkspace());
  // Location display names belong to the dataset; register them once so
  // locationLabel() reports what the data says rather than a transcription.
  if (!globalStore.__icgLocationsRegistered) {
    registerLocationNames(getWorkspace().dataset.locations);
    globalStore.__icgLocationsRegistered = true;
  }
  return queries;
}

/**
 * The command service over the same workspace (stage 09). Only the demo
 * controls reach for this; every screen still reads through queries alone.
 * Authorization stays inside @icg/services — a command called from here is
 * refused exactly as it would be anywhere else.
 */
export function getCommands(): CommandService {
  return createCommandService(getWorkspace());
}

export const DEFAULT_USER_ID = "U-002"; // M. Reyes — Controller

export function userById(userId: string | undefined): DemoUser {
  return (
    DEMO_USERS.find((u) => u.id === userId) ??
    DEMO_USERS.find((u) => u.id === DEFAULT_USER_ID) ??
    DEMO_USERS[0]!
  );
}

export function makeContext(user: DemoUser, correlationId: string): ServiceContext {
  return { user, correlationId, sourceInterface: "WEB_UI" };
}

/** Human labels for the canonical role ids (docs/15 role matrix). */
export const ROLE_LABELS: Readonly<Record<string, string>> = {
  HEAD_OF_FINANCE: "Head of Finance",
  CONTROLLER: "Controller",
  ACCOUNTING_MANAGER: "Accounting Manager",
  PREPARER: "Preparer",
  WAREHOUSE: "Warehouse",
  SUPPLY_CHAIN: "Supply Chain",
  FPA: "FP&A",
  LEGAL: "Legal",
  AUDITOR_READ_ONLY: "Auditor (Read-Only)",
  SYSTEM_ADMIN: "System Admin",
};

export function roleLabel(user: DemoUser): string {
  const role = user.roles[0];
  return (role !== undefined ? ROLE_LABELS[role] : undefined) ?? "Unknown";
}

export function initials(displayName: string): string {
  const letters = displayName
    .split(/\s+/)
    .map((part) => part.replace(/[^A-Za-z]/g, "").charAt(0))
    .filter((c) => c !== "");
  return letters.slice(0, 2).join("").toUpperCase() || "??";
}
