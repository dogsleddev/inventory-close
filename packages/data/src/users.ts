import type { Role } from "@icg/domain";

/**
 * The synthetic demo user roster — one named user per docs/15 role. These
 * are workspace identities, not source-system records, so they live
 * outside the fixture manifest.
 */
export interface DemoUser {
  readonly id: string;
  readonly displayName: string;
  readonly roles: readonly Role[];
}

export const DEMO_USERS: readonly DemoUser[] = [
  { id: "U-001", displayName: "A. Winslow", roles: ["HEAD_OF_FINANCE"] },
  { id: "U-002", displayName: "M. Reyes", roles: ["CONTROLLER"] },
  { id: "U-003", displayName: "L. Whitfield", roles: ["ACCOUNTING_MANAGER"] },
  { id: "U-004", displayName: "T. Okafor", roles: ["PREPARER"] },
  { id: "U-005", displayName: "R. Calloway", roles: ["WAREHOUSE"] },
  { id: "U-006", displayName: "S. Ibarra", roles: ["SUPPLY_CHAIN"] },
  { id: "U-007", displayName: "J. Petrov", roles: ["FPA"] },
  { id: "U-008", displayName: "D. Marsh", roles: ["LEGAL"] },
  { id: "U-009", displayName: "External Audit Team", roles: ["AUDITOR_READ_ONLY"] },
  { id: "U-010", displayName: "K. Osei", roles: ["SYSTEM_ADMIN"] },
];

export const userByRole = (role: Role): DemoUser => {
  const user = DEMO_USERS.find((u) => u.roles.includes(role));
  if (!user) throw new Error(`No demo user for role ${role}`);
  return user;
};
