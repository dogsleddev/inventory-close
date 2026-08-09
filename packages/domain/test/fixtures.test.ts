import { describe, expect, it } from "vitest";
import {
  exceptionFixtureSchema,
  glBalanceFixtureSchema,
  inventoryItemFixtureSchema,
  skuFixtureSchema,
  sourceHealthFixtureSchema,
  sourceRecordRefSchema,
} from "../src/schemas/fixtures.js";

describe("fixture boundary validation", () => {
  it("accepts a valid SKU fixture", () => {
    const result = skuFixtureSchema.safeParse({
      code: "KE-E2",
      description: "KestrelGrid edge appliance",
      unitCostCents: 740000,
    });
    expect(result.success).toBe(true);
  });

  it("rejects float unit costs (money must be integer cents)", () => {
    const result = skuFixtureSchema.safeParse({
      code: "KE-E2",
      description: "KestrelGrid edge appliance",
      unitCostCents: 7400.5,
    });
    expect(result.success).toBe(false);
  });

  it("rejects malformed SKU codes", () => {
    const result = skuFixtureSchema.safeParse({
      code: "WIDGET_1",
      description: "not a KestrelGrid SKU",
      unitCostCents: 100,
    });
    expect(result.success).toBe(false);
  });

  it("accepts a valid inventory item fixture", () => {
    const result = inventoryItemFixtureSchema.safeParse({
      serial: "KE-E2-1048",
      sku: "KE-E2",
      location: "PRIMARY_WAREHOUSE",
      classification: "FINISHED_HARDWARE",
      unitCostCents: 740000,
    });
    expect(result.success).toBe(true);
  });

  it("rejects unknown accounting classifications", () => {
    const result = inventoryItemFixtureSchema.safeParse({
      serial: "KE-E2-1048",
      sku: "KE-E2",
      location: "PRIMARY_WAREHOUSE",
      classification: "SOMEWHERE",
      unitCostCents: 740000,
    });
    expect(result.success).toBe(false);
  });

  it("accepts a valid GL balance and rejects malformed dates", () => {
    expect(
      glBalanceFixtureSchema.safeParse({
        account: "1200",
        asOf: "2026-12-31",
        amountCents: 378915000,
      }).success,
    ).toBe(true);
    expect(
      glBalanceFixtureSchema.safeParse({
        account: "1200",
        asOf: "12/31/2026",
        amountCents: 378915000,
      }).success,
    ).toBe(false);
  });

  it("rejects unknown source systems in health fixtures", () => {
    expect(
      sourceHealthFixtureSchema.safeParse({
        sourceSystem: "ACCORD_VAULT",
        status: "STALE",
      }).success,
    ).toBe(true);
    expect(
      sourceHealthFixtureSchema.safeParse({
        sourceSystem: "MYSTERY_SYSTEM",
        status: "HEALTHY",
      }).success,
    ).toBe(false);
  });

  it("requires source refs to preserve NetSuite identity and hash", () => {
    expect(
      sourceRecordRefSchema.safeParse({
        sourceSystem: "NETSUITE_ERP",
        recordType: "ITEM_FULFILLMENT",
        internalId: "261972",
        transactionNumber: "IF-261972",
        retrievedAt: "2026-12-31T23:59:00Z",
        sourceHash: "abc123",
      }).success,
    ).toBe(true);
    expect(
      sourceRecordRefSchema.safeParse({
        sourceSystem: "NETSUITE_ERP",
        recordType: "ITEM_FULFILLMENT",
        internalId: "261972",
        retrievedAt: "2026-12-31T23:59:00Z",
        // sourceHash missing
      }).success,
    ).toBe(false);
  });

  it("validates exception fixtures against canonical status and ID shape", () => {
    expect(
      exceptionFixtureSchema.safeParse({
        id: "EXC-001",
        title: "Outbound deployment / missing contract",
        ruleId: "CUT-OUT-001",
        ruleVersion: "1.0.0",
        status: "WAITING_ON_CONTRACT",
        risk: "HIGH",
        exposureCents: 1480000,
        blocker: true,
      }).success,
    ).toBe(true);
    expect(
      exceptionFixtureSchema.safeParse({
        id: "EXCEPTION-1",
        title: "bad id shape",
        ruleId: "CUT-OUT-001",
        ruleVersion: "1.0.0",
        status: "WAITING_ON_CONTRACT",
        risk: "HIGH",
        exposureCents: 1480000,
        blocker: true,
      }).success,
    ).toBe(false);
    expect(
      exceptionFixtureSchema.safeParse({
        id: "EXC-001",
        title: "unknown status",
        ruleId: "CUT-OUT-001",
        ruleVersion: "1.0.0",
        status: "DONE",
        risk: "HIGH",
        exposureCents: 1480000,
        blocker: true,
      }).success,
    ).toBe(false);
  });
});
