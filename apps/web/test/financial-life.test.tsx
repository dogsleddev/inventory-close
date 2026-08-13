// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { userByRole } from "@icg/data";
import { FinancialLifeScreen } from "../components/FinancialLifeScreen";
import { InventorySearchScreen } from "../components/InventorySearchScreen";
import { buildShellData } from "../lib/server/data";
import {
  buildFinancialLifeData,
  buildInventorySearchData,
} from "../lib/server/financial-life-view";
import { getQueries, makeContext } from "../lib/server/workspace";
import {
  concludeException,
  controller,
  resetDemo,
  satisfyRequirements,
} from "./support/live-close";

afterEach(cleanup);

const noopRole = vi.fn(async () => {});
const FLAGSHIP = "KE-E2-1048";

function renderLife(serial: string, role: Parameters<typeof userByRole>[0] = "CONTROLLER") {
  const user = userByRole(role);
  return render(
    <FinancialLifeScreen
      shell={buildShellData(user, "T-LIFE")}
      data={buildFinancialLifeData(user, serial, "T-LIFE")}
      setRoleAction={noopRole}
    />,
  );
}

function services() {
  const user = userByRole("CONTROLLER");
  return { queries: getQueries(), ctx: makeContext(user, "T-LIFE-SVC") };
}

describe("Financial Life — flagship serial", () => {
  it("renders the unit header from services: book state, physical state, exception", () => {
    renderLife(FLAGSHIP);
    expect(screen.getByRole("heading", { level: 1, name: FLAGSHIP })).toBeTruthy();
    expect(screen.getByText("SKU KE-E2")).toBeTruthy();
    // Header stat and the NETSUITE STATE phase card both state the book
    // position — that is the design, so assert presence, not uniqueness.
    expect(screen.getAllByText("Primary Warehouse Inventory").length).toBeGreaterThan(0);
    expect(screen.getByText("At customer site")).toBeTruthy();
    // Header stat, chip, and phase cards all reach EXC-001 — every one of
    // them must go to the same destination.
    const links = screen.getAllByRole("link", { name: /EXC-001/ });
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) {
      expect(link.getAttribute("href")).toBe("/exceptions/EXC-001");
    }
  });

  it("renders the carrier's real delivered state — never the mockup's 'in transit' (§9a-2)", () => {
    const { queries, ctx } = services();
    const life = queries.getFinancialLife(ctx, FLAGSHIP);
    expect(life.sellSide.deliveredAt).toBeDefined();
    renderLife(FLAGSHIP);
    expect(screen.getByText(/^Delivered/)).toBeTruthy();
    expect(screen.queryByText(/in transit/i)).toBeNull();
  });

  it("keeps the missing provision visibly missing, outside any positive state", () => {
    const { queries, ctx } = services();
    const exc = queries
      .listExceptions(ctx)
      .find((e) => e.exception.id === "EXC-001");
    const unmet = exc?.exception.finding.evidenceRequirements.find(
      (r) => r.required && !r.satisfied,
    );
    expect(unmet).toBeDefined();
    renderLife(FLAGSHIP);
    // The requirement text renders as a required-missing card, tagged with
    // the rule that needs it.
    expect(screen.getAllByText(unmet?.description ?? "").length).toBeGreaterThan(0);
    expect(screen.getByText(/MISSING · required for CUT-OUT-001/)).toBeTruthy();
  });

  it("marks invoice and telemetry as non-conclusive evidence", () => {
    renderLife(FLAGSHIP);
    expect(screen.getAllByText(/billing evidence only/).length).toBeGreaterThan(0);
    expect(screen.getByText("Corroborating only")).toBeTruthy();
    // The management conclusion comes from the exception workflow, not from
    // the invoice, telemetry, or location.
    expect(screen.getByText("Management conclusion: Open")).toBeTruthy();
  });

  it("summarizes the chain as component coverage, not a score", () => {
    const { queries, ctx } = services();
    const chain = queries
      .getCommercialChains(ctx)
      .find((c) => c.subjectRef === "SO-26184");
    expect(chain).toBeDefined();
    renderLife(FLAGSHIP);
    expect(
      screen.getByText(
        new RegExp(
          `${chain?.presentCount} of ${chain?.totalCount} components present`,
        ),
      ),
    ).toBeTruthy();
    expect(screen.getByText(/not a score and not a measure of accounting confidence/)).toBeTruthy();
  });

  it("opens the source-record drawer from a transaction chip (occurred vs retrieved)", async () => {
    const user = userEvent.setup();
    const { queries, ctx } = services();
    const life = queries.getFinancialLife(ctx, FLAGSHIP);
    const po = life.buySide.purchaseOrder ?? "";
    renderLife(FLAGSHIP);
    await user.click(screen.getAllByRole("button", { name: po })[0] as HTMLElement);
    const drawer = screen.getByRole("complementary", { name: `Evidence record ${po}` });
    expect(within(drawer).getByText("Occurred")).toBeTruthy();
    expect(within(drawer).getByText("Retrieved")).toBeTruthy();
    await user.keyboard("{Escape}");
    expect(
      screen.queryByRole("complementary", { name: `Evidence record ${po}` }),
    ).toBeNull();
  });

  it("shows the count history under the management-risk tag", () => {
    renderLife(FLAGSHIP);
    expect(screen.getByText("MANAGEMENT RISK CONTEXT")).toBeTruthy();
    expect(screen.getByText(/implies no auditor reliance/)).toBeTruthy();
  });
});

describe("Financial Life — off-book and unknown serials", () => {
  it("renders the off-book discovery without implying book membership", () => {
    const { queries, ctx } = services();
    const offBook = queries
      .listExceptions(ctx)
      .find((e) => e.exception.finding.ruleId === "CNT-COMP-001");
    const serial = offBook?.exception.finding.subjects.serials?.[0] ?? "";
    expect(serial).not.toBe("");
    renderLife(serial);
    expect(screen.getByText("Not on the year-end listing")).toBeTruthy();
    expect(screen.getByText("No year-end book record")).toBeTruthy();
    expect(screen.getByText(/never auto-added/i)).toBeTruthy();
    // No fabricated accounting position for a unit that is not on the book.
    expect(screen.queryByText("Accounting position")).toBeNull();
  });

  it("reports an unknown serial as verified empty, never as a zero", () => {
    renderLife("KE-Z9-0000");
    expect(screen.getByText(/verified empty, not assumed/)).toBeTruthy();
  });
});

describe("Inventory serial search", () => {
  function renderSearch(query: string) {
    const user = userByRole("CONTROLLER");
    return render(
      <InventorySearchScreen
        shell={buildShellData(user, "T-SEARCH")}
        data={buildInventorySearchData(user, query, "T-SEARCH")}
        setRoleAction={noopRole}
      />,
    );
  }

  it("reaches Financial Life in one click from a hit", () => {
    renderSearch(FLAGSHIP);
    // The serial may also appear as an open-exception entry chip — assert
    // the hit row inside the results table.
    const table = screen.getByRole("table");
    const link = within(table).getByRole("link", { name: FLAGSHIP });
    expect(link.getAttribute("href")).toBe(`/inventory/${FLAGSHIP}`);
    expect(screen.getByText("On the listing")).toBeTruthy();
  });

  it("says out loud when a hit is not on the year-end book", () => {
    const { queries, ctx } = services();
    const offBook = queries
      .listExceptions(ctx)
      .find((e) => e.exception.finding.ruleId === "CNT-COMP-001");
    const serial = offBook?.exception.finding.subjects.serials?.[0] ?? "";
    renderSearch(serial);
    expect(screen.getByText("Not on the listing")).toBeTruthy();
  });
});

/**
 * The unit page below its own header.
 *
 * Commit 295a8c4 made this screen's HEADER live, and its message names the
 * exact strings it was closing. Two panels down, in the same payload, the
 * phase strip and the accounting block were still built from
 * `queries.listExceptions` — the rules' frozen list — so after concluding
 * EXC-003 `buildFinancialLifeData("KE-X1-3498")` returned a header reading
 * `{status:'Resolved — No Adjustment', blocker:false}` alongside:
 *
 *   {"kind":"EXCEPTION","date":"Open","title":"EXC-003 · Recount Required","glyph":"✕"}
 *   {"kind":"CONCLUSION","date":"Open","title":"Management conclusion: Open",
 *    "meta":"Obtain: Supervised recount locating the unit"}
 *   accounting.footnote: "…Any change requires a management conclusion on EXC-003 first."
 *
 * Rendered at FinancialLifeScreen.tsx:268 and :544. Each assertion below is
 * made twice — once before the conclusion, to prove the string is reachable at
 * all, and once after.
 */
describe("Financial Life — the panels below the header read the live close", () => {
  const SUBJECT = "KE-X1-3498"; // EXC-003's serial

  afterEach(resetDemo);

  const cards = (serial: string) =>
    buildFinancialLifeData(controller(), serial, "T-LIFE-LIVE").phases.flatMap((p) => p.events);

  it("stops printing the frozen status, the frozen requirement and the frozen footnote", () => {
    // Premise. Without these four the assertions below pass on any payload
    // that merely never contained the strings.
    const before = buildFinancialLifeData(controller(), SUBJECT, "T-LIFE-BEFORE");
    const beforeCards = before.phases.flatMap((p) => p.events);
    expect(beforeCards.some((c) => /Recount Required/.test(c.title))).toBe(true);
    expect(beforeCards.some((c) => /^Obtain:/.test(c.meta ?? ""))).toBe(true);
    expect(beforeCards.some((c) => /Management conclusion: Open/.test(c.title))).toBe(true);
    expect(before.accounting?.footnote).toMatch(/requires a management conclusion/);

    concludeException("EXC-003");

    const after = buildFinancialLifeData(controller(), SUBJECT, "T-LIFE-AFTER");
    const afterCards = after.phases.flatMap((p) => p.events);
    expect(afterCards.filter((c) => /Recount Required/.test(c.title))).toEqual([]);
    expect(afterCards.filter((c) => /^Obtain:/.test(c.meta ?? ""))).toEqual([]);
    expect(afterCards.filter((c) => /Management conclusion: Open/.test(c.title))).toEqual([]);
    expect(after.accounting?.footnote).not.toMatch(/requires a management conclusion/);
  });

  /**
   * The state the conclusion test cannot reach.
   *
   * `nextActionText` returns "None — resolved; history retained" for ANY
   * resolved status before it ever looks at the unmet list (workflow-view.ts:
   * 101), so once a conclusion is recorded the requirement list is dead code
   * on this card and an assertion made there proves nothing about it. The
   * state where it is live is the one in between, and it is a real demo step:
   * the Controller has submitted the record, the Accounting Manager has
   * accepted it, and nobody has concluded yet. The card demanded a record the
   * product was already holding — the frozen `satisfied` flag is a literal in
   * the rules package (counts.ts:62 `satisfied: false`) and never moves.
   */
  it("stops demanding a record the close has already accepted, before any conclusion", () => {
    const metaOf = (kind: string) => cards(SUBJECT).find((c) => c.kind === kind)?.meta ?? "";
    expect(metaOf("CONCLUSION")).toMatch(/^Obtain: Supervised recount/);

    satisfyRequirements("EXC-003");

    // Still open — no conclusion has been recorded, and the card still says so.
    const after = buildFinancialLifeData(controller(), SUBJECT, "T-LIFE-SATISFIED");
    const conclusion = after.phases.flatMap((p) => p.events).find((c) => c.kind === "CONCLUSION");
    expect(conclusion?.title).toBe("Management conclusion: Open");
    expect(conclusion?.meta).not.toMatch(/Obtain:/);
    expect(conclusion?.meta).toBe("Complete the recount and reconcile the variance");
  });

  it("agrees with the header it sits under", () => {
    concludeException("EXC-003");
    const data = buildFinancialLifeData(controller(), SUBJECT, "T-LIFE-AGREE");

    // The header, which 295a8c4 fixed.
    expect(data.header?.close.status?.label).toBe("Resolved — No Adjustment");
    expect(data.header?.close.blocker).toBe(false);

    // The panels below it, which it disagreed with.
    const exceptionCard = cards(SUBJECT).find((c) => c.kind === "EXCEPTION");
    expect(exceptionCard?.date).toBe("Resolved");
    expect(exceptionCard?.title).toContain("Resolved — No Adjustment");
    expect(exceptionCard?.glyph).not.toBe("✕");

    const conclusionCard = cards(SUBJECT).find((c) => c.kind === "CONCLUSION");
    expect(conclusionCard?.title).toBe("Management conclusion: Resolved — No Adjustment");
  });
});
