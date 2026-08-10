import type { SourceHealthFixture } from "@icg/domain";

/**
 * Baseline source health (CANONICAL_SPEC §4): seven healthy, AccordVault
 * stale, ReturnLoop partial → 825/900 = 91.67%.
 */
export const SOURCE_HEALTH: readonly SourceHealthFixture[] = [
  { sourceSystem: "NETSUITE_ERP", status: "HEALTHY", lastSyncAt: "2027-01-07T05:30:00Z", lastSyncId: "SYNC-ERP-8841" },
  { sourceSystem: "NETSUITE_WMS", status: "HEALTHY", lastSyncAt: "2027-01-07T05:32:00Z", lastSyncId: "SYNC-WMS-5527" },
  { sourceSystem: "FLIGHTPATH", status: "HEALTHY", lastSyncAt: "2027-01-07T05:45:00Z", lastSyncId: "SYNC-FP-3310" },
  { sourceSystem: "DEPLOY_OPS", status: "HEALTHY", lastSyncAt: "2027-01-07T05:10:00Z", lastSyncId: "SYNC-DO-2296" },
  { sourceSystem: "DEVICE_CLOUD", status: "HEALTHY", lastSyncAt: "2027-01-07T05:50:00Z", lastSyncId: "SYNC-DC-9083" },
  {
    sourceSystem: "ACCORD_VAULT",
    status: "STALE",
    lastSyncAt: "2026-12-26T08:00:00Z",
    lastSyncId: "SYNC-AV-1174",
    note: "Document index sync failing since 2026-12-26; manual review in use",
  },
  {
    sourceSystem: "RETURN_LOOP",
    status: "PARTIAL",
    lastSyncAt: "2027-01-07T05:00:00Z",
    lastSyncId: "SYNC-RL-4419",
    note: "December return detail records syncing with delay",
  },
  { sourceSystem: "KESTREL_CRM", status: "HEALTHY", lastSyncAt: "2027-01-07T05:20:00Z", lastSyncId: "SYNC-CRM-6650" },
  { sourceSystem: "FORECAST_PLATFORM", status: "HEALTHY", lastSyncAt: "2027-01-07T04:55:00Z", lastSyncId: "SYNC-FCP-1027" },
];
