// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { userByRole } from "@icg/data";
import { getProcurementPopulations } from "@icg/services";
import { ProcurementScreen } from "../components/ProcurementScreen";
import { buildShellData } from "../lib/server/data";
import { buildProcurementData, tabWithheldNote } from "../lib/server/procurement-view";
import { getQueries, getWorkspace, makeContext } from "../lib/server/workspace";

/**
 * Procurement (COMPLETION_PLAN Stage C).
 *
 * The three-way-match assertions here came from `reconciliation.test.tsx`
 * unchanged: the tab moved, so its regressions moved with it rather than
 * being deleted alongside it. The rest pin the four new populations, and in
 * particular the one claim this screen makes that no other screen makes —
 * that invoiced-not-received and inbound goods in transit are one population.
 */

afterEach(cleanup);

const noopRole = vi.fn(async () => {});

function renderProcurement(
  role: Parameters<typeof userByRole>[0] = "CONTROLLER",
  initialTab?: string,
) {
  const user = userByRole(role);
  return render(
    <ProcurementScreen
      shell={buildShellData(user, "T-PROC")}
      data={buildProcurementData(user, "T-PROC")}
      {...(initialTab !== undefined ? { initialTab } : {})}
      setRoleAction={noopRole}
    />,
  );
}

function services() {
  const user = userByRole("CONTROLLER");
  const ctx = makeContext(user, "T-PROC-SVC");
  return { queries: getQueries(), ctx, populations: getProcurementPopulations(getWorkspace(), ctx) };
}

async function openTab(name: RegExp) {
  await userEvent.setup().click(screen.getByRole("tab", { name }));
}

describe("Procurement — the section", () => {
  it("opens on the three-way match and carries all five populations", () => {
    renderProcurement();
    for (const name of [
      /Three-Way Match/,
      /Received Not Invoiced/,
      /Invoiced Not Received/,
      /Goods in Transit/,
      /Price Variance/,
    ]) {
      expect(screen.getByRole("tab", { name })).toBeTruthy();
    }
    expect(screen.getByText("All procurement matches")).toBeTruthy();
  });

  it("offers the population as a file, because a screen is not a workpaper", () => {
    renderProcurement();
    const link = screen.getByRole("link", { name: /Export the procurement populations as CSV/ });
    expect(link.getAttribute("href")).toBe("/api/export/procurement");
  });

  it("opens the population named in the URL", () => {
    renderProcurement("CONTROLLER", "ppv");
    expect(screen.getByRole("tab", { name: /Price Variance/ })).toHaveProperty(
      "ariaSelected",
      "true",
    );
  });
});

describe("Procurement — three-way match", () => {
  it("keeps the native NetSuite state and the close state side by side and independent", async () => {
    const { queries, ctx } = services();
    const matches = queries.getProcurementMatches(ctx);
    renderProcurement();
    const panel = screen.getByText("All procurement matches").closest("section");
    const rows = within(panel as HTMLElement).getAllByRole("row").slice(1);
    expect(rows).toHaveLength(matches.length);
    // Native incomplete + close open (EXC-002)…
    expect(screen.getAllByText("NS 3WM · INCOMPLETE").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Accounting Review").length).toBeGreaterThan(0);
    // …and native incomplete + no close exception (clean GIT), so neither
    // state is derived from the other.
    const incompleteNativeCleanClose = matches.some(
      (m) => m.nativeNetsuiteMatchStatus !== "PASS" && m.closeMatchStatus === "PASS",
    );
    expect(incompleteNativeCleanClose).toBe(true);
    expect(screen.getAllByText("NS 3WM · PASS").length).toBeGreaterThan(0);
    expect(screen.getAllByText("No close exception").length).toBeGreaterThan(0);
  });

  it("features the EXC-002 incomplete year-end example with its absent receipt", () => {
    renderProcurement();
    expect(screen.getByText(/Absent at Dec\. 31/)).toBeTruthy();
    expect(screen.getAllByText(/EXC-002/).length).toBeGreaterThan(0);
    expect(
      screen.getByText(/answer different questions and are reported separately/),
    ).toBeTruthy();
  });

  it("features a resolved-historical example alongside the open one", () => {
    const { populations } = services();
    const resolved = populations.orders.find(
      (o) => o.relatedExceptionId !== undefined && o.relatedExceptionOpen === false,
    );
    expect(resolved).toBeDefined();
    renderProcurement();
    expect(
      screen.getAllByText(new RegExp(resolved?.relatedExceptionId ?? "")).length,
    ).toBeGreaterThan(0);
  });

  it("a match whose exception is resolved never reads 'No close exception'", () => {
    const { queries, ctx } = services();
    // EXC-014 is resolved and rides on PO-26-1201's receipt.
    const exc = queries.listExceptions(ctx).find((e) => e.exception.id === "EXC-014");
    expect(exc?.open).toBe(false);
    renderProcurement();
    const table = screen.getByText("All procurement matches").closest("section");
    const row = within(table as HTMLElement)
      .getAllByRole("row")
      .find((r) => within(r).queryByText("PO-26-1201") !== null);
    expect(row).toBeDefined();
    expect(within(row as HTMLElement).queryByText("No close exception")).toBeNull();
    expect(within(row as HTMLElement).getByText("EXC-014")).toBeTruthy();
  });

  it("rows with nothing to open are not rendered as selected", () => {
    renderProcurement();
    const table = screen.getByText("All procurement matches").closest("section");
    const selected = within(table as HTMLElement)
      .getAllByRole("row")
      .filter((r) => r.getAttribute("data-selected") === "true");
    // Nothing is open, so nothing is selected.
    expect(selected).toEqual([]);
  });

  it("never shows an ordered amount beside a different billed amount without saying why", () => {
    const { populations } = services();
    const varied = new Set(
      populations.priceVariance.rows.map((r) => r.purchaseOrderNumber),
    );
    expect(varied.size).toBeGreaterThan(0);
    renderProcurement();
    // The clean-cycle card is the one this went wrong on: it carried a PO
    // total and a different bill total under a footnote calling the legs
    // matched. A card is only "clean" when there is nothing left to explain.
    const cleanCard = screen.getByText("Clean procurement cycle").closest("section");
    expect(cleanCard).toBeTruthy();
    const po = within(cleanCard as HTMLElement)
      .getAllByText(/^PO-/)
      .map((n) => n.textContent ?? "")[0];
    expect(varied.has((po ?? "").trim())).toBe(false);
  });

  it("names the variance on any card whose bill differs from its order", () => {
    const { populations } = services();
    const data = buildProcurementData(userByRole("CONTROLLER"), "T-PROC");
    const varied = new Set(
      populations.priceVariance.rows.map((r) => r.purchaseOrderNumber),
    );
    for (const card of data.match?.featured ?? []) {
      const billLeg = card.legs.find((l) => l.label === "VENDOR BILL");
      expect(
        /above the price ordered|below the price ordered/.test(billLeg?.note ?? ""),
        card.po,
      ).toBe(varied.has(card.po));
    }
  });

  it("states where every order stood at the balance-sheet date", () => {
    const { populations } = services();
    renderProcurement();
    const table = screen.getByText("All procurement matches").closest("section");
    // Each of the three positions the dataset actually produces is legible in
    // the table, not left for the reader to infer from two dates.
    const positions = new Set(populations.orders.map((o) => o.position));
    expect(positions.size).toBeGreaterThan(1);
    expect(within(table as HTMLElement).getAllByText("Matched in period").length).toBeGreaterThan(0);
    expect(within(table as HTMLElement).getAllByText("Received, not invoiced").length).toBe(
      populations.grni.length,
    );
    expect(within(table as HTMLElement).getAllByText("Invoiced, not received").length).toBe(
      populations.invoicedNotReceived.length,
    );
  });
});

describe("Procurement — received not invoiced", () => {
  it("renders one row per receipt awaiting a bill, with its age at period end", async () => {
    const { populations } = services();
    renderProcurement();
    await openTab(/Received Not Invoiced/);
    const panel = screen.getByText("Orders awaiting a vendor bill").closest("section");
    const rows = within(panel as HTMLElement).getAllByRole("row").slice(1);
    expect(rows).toHaveLength(populations.grni.length);
    for (const row of populations.grni) {
      expect(within(panel as HTMLElement).getByText(row.itemReceiptNumber)).toBeTruthy();
    }
  });

  it("says why the accrual is not in the inventory reconciliation", async () => {
    renderProcurement();
    await openTab(/Received Not Invoiced/);
    // The units are already on the book; what is missing is the invoice. A
    // reader who took this for an inventory difference would double-count it.
    expect(screen.getByText(/already in the 1,500-unit book population/)).toBeTruthy();
    expect(screen.getByText(/accounts payable, not in inventory/)).toBeTruthy();
  });
});

describe("Procurement — goods in transit is one population, not two", () => {
  it("states the agreement between the document side and the book side", async () => {
    const { populations } = services();
    const git = populations.goodsInTransit;
    expect(git.inboundAgrees).toBe(true);
    renderProcurement();
    await openTab(/Goods in Transit/);
    expect(screen.getByText("The documents and the book agree.")).toBeTruthy();
    // The sentence a reader needs before they reach for a calculator.
    expect(screen.getByText(/Same population, two sides/)).toBeTruthy();
  });

  it("reports the whole of account 1210 so it cannot contradict the GL screen", async () => {
    const { populations } = services();
    const git = populations.goodsInTransit;
    renderProcurement();
    await openTab(/Goods in Transit/);
    expect(screen.getByText(`${git.inboundUnits} units`)).toBeTruthy();
    expect(screen.getByText(`${git.outboundUnits} units`)).toBeTruthy();
    expect(screen.getByText(`${git.accountUnits} units`)).toBeTruthy();
    expect(screen.getByText(/belongs to the commercial chain/)).toBeTruthy();
  });
});

describe("Procurement — price variance", () => {
  it("renders each varying line with both prices and its direction", async () => {
    const { populations } = services();
    renderProcurement();
    await openTab(/Price Variance/);
    const panel = screen
      .getByText("Lines billed at a price other than the one ordered")
      .closest("section");
    const rows = within(panel as HTMLElement).getAllByRole("row").slice(1);
    expect(rows).toHaveLength(populations.priceVariance.rows.length);
    expect(within(panel as HTMLElement).getAllByText("Unfavorable").length).toBeGreaterThan(0);
    expect(within(panel as HTMLElement).getAllByText("Favorable").length).toBeGreaterThan(0);
  });

  it("says the variance is expensed, so no figure here belongs to inventory", async () => {
    renderProcurement();
    await openTab(/Price Variance/);
    expect(screen.getByText(/expensed in the period rather than capitalized/)).toBeTruthy();
    expect(
      screen.getByText(/native three-way match still passes on every order in this table/),
    ).toBeTruthy();
  });
});

describe("Procurement — a scoped reader is not shown their own scope as a finding", () => {
  /**
   * Found while wiring Stage G's invoiced-not-received intent, which reads
   * the same projection.
   *
   * The document side of goods in transit is scope-filtered; the book side is
   * not. One purchase order is outside the auditor's scope, so the two
   * populations differed by that order and `inboundAgrees` came back FALSE —
   * and this screen printed "The documents and the book do not agree… must be
   * resolved before either figure is relied on" to every auditor who opened
   * the tab. An omission the reader is not allowed to see was being reported
   * to them as an unexplained control difference, on the one tab whose whole
   * job is to say the two sides are the same population.
   */
  it("withholds an order from the auditor and not from the book", () => {
    // The premise. Without it the assertions below describe a case that does
    // not occur and would pass on any implementation.
    const user = userByRole("AUDITOR_READ_ONLY");
    const seen = getProcurementPopulations(getWorkspace(), makeContext(user, "T-PROC-AUD"));
    expect(seen.withheldOrderCount).toBeGreaterThan(0);
    expect(seen.goodsInTransit.documentUnits).not.toBe(seen.goodsInTransit.inboundUnits);
  });

  it("says the comparison could not be made, rather than that it failed", async () => {
    renderProcurement("AUDITOR_READ_ONLY");
    await openTab(/Goods in Transit/);
    expect(screen.getByText(/cannot be compared at your access scope/)).toBeTruthy();
    expect(screen.queryByText("The documents and the book do not agree.")).toBeNull();
    expect(screen.getByText(/is your scope, not a finding/)).toBeTruthy();
  });

  it("still states the agreement for a reader who can see every order", async () => {
    // The other direction: a fix that simply stopped comparing would satisfy
    // the assertion above and delete this tab's load-bearing sentence.
    renderProcurement("CONTROLLER");
    await openTab(/Goods in Transit/);
    expect(screen.getByText("The documents and the book agree.")).toBeTruthy();
  });

  it("counts the withheld orders in words that fit the count", async () => {
    // "1 orders are outside your role's scope" — a hard-coded plural,
    // invisible until a role withheld exactly one. The auditor is that role.
    //
    // Read on Three-Way Match, which is the tab the claim is about. This
    // assertion used to be made on Goods in Transit, and passed there only
    // because one note was rendered above all five tables — see below.
    renderProcurement("AUDITOR_READ_ONLY");
    const note = screen.getByText(/outside your role's scope in this demo/);
    expect(note.textContent).not.toMatch(/\b1 orders\b/);
    expect(note.textContent).toMatch(/\b1 order is\b/);
  });

  /**
   * The scope note belongs to a table, not to the screen.
   *
   * It was one string built from the close-wide withheld counts and rendered
   * as the first child of the tabpanel, so an auditor read "1 order … has no
   * row in the table above" over all five tables. Three of them — Received Not
   * Invoiced, Goods in Transit and Price Variance — are byte-identical to a
   * Controller's, so a complete population was being announced to the reader
   * as shortened by their own access. That is the scope-as-a-finding trap, and
   * the assertion above sat on one of the three tabs where the sentence was
   * false without noticing, because it only ever read the wording.
   *
   * Asserted as a biconditional against the service, so it cannot be satisfied
   * by a note that is simply never rendered: a tab carries the note exactly
   * when that tab's own population is short at this reader's scope.
   */
  it("shows the scope note only on the tabs whose table is actually short", async () => {
    const user = userByRole("AUDITOR_READ_ONLY");
    const seen = getProcurementPopulations(getWorkspace(), makeContext(user, "T-PROC-TABS"));
    // The premise: exactly one order is withheld, and it is an
    // invoiced-not-received order, so GRNI and price variance are complete.
    expect(seen.withheldOrderCount).toBe(1);
    expect(seen.withheldFrom.grni).toBe(0);
    expect(seen.withheldFrom.priceVariance).toBe(0);
    expect(seen.withheldFrom.invoicedNotReceived).toBe(1);

    const shortened: Record<string, boolean> = {
      "Three-Way Match": true,
      "Received Not Invoiced": false,
      "Invoiced Not Received": true,
      "Goods in Transit": false,
      "Price Variance": false,
    };
    renderProcurement("AUDITOR_READ_ONLY");
    for (const [label, isShort] of Object.entries(shortened)) {
      await openTab(new RegExp(label));
      const note = screen.queryByText(/outside your role's scope in this demo/);
      expect(note !== null, `${label}: note rendered=${note !== null}, table short=${isShort}`).toBe(
        isShort,
      );
    }
  });

  /**
   * The plural class, asserted over the sentence rather than over its three
   * known instances.
   *
   * "1 orders" survived one fix and was reintroduced by the next: the rewrite
   * that removed it branched two phrases by hand and carried a third
   * hard-coded "orders" through its own closing sentence. Listing the three
   * would have caught none of them, because each was written by someone who
   * had just read the other two.
   *
   * So this reads the rendered note and requires that no "1" is ever followed
   * by a word ending in "s" — which is the property the sentence has to have
   * and the one a hand-branched phrase loses.
   */
  it("never prints a plural noun after a count of one", () => {
    // Driven through the note builder rather than through the screen, because
    // the shipped dataset has 84 orders and the defect only shows at one. A
    // test that could only read the rendered page would pass on the broken
    // template — which is exactly why this instance survived a fix pass whose
    // author was looking straight at it.
    const singular = /\b1 (?!of\b)([a-z]+s)\b/;
    for (const totalOrders of [1, 2, 84]) {
      for (const missingRows of [0, 1, 2]) {
        for (const rowsMissingADocument of [0, 1, 2]) {
          const note = tabWithheldNote({ missingRows, rowsMissingADocument, totalOrders });
          if (note === null) continue;
          const hit = singular.exec(note);
          expect(
            hit === null,
            `"1 ${hit?.[1]}" at totalOrders=${totalOrders} missing=${missingRows} docs=${rowsMissingADocument}: ${note}`,
          ).toBe(true);
        }
      }
    }
  });

  it("still says the plural where the count is plural", () => {
    // The other direction: a builder that emitted the singular everywhere
    // would satisfy the assertion above.
    const note = tabWithheldNote({ missingRows: 3, rowsMissingADocument: 2, totalOrders: 84 });
    expect(note).toMatch(/3 orders are/);
    expect(note).toMatch(/2 rows keep/);
    expect(note).toMatch(/84 orders/);
  });

  it("points at the table it describes, which is below it on every tab", async () => {
    // The half that was wrong for every reader on every tab, including the one
    // the claim was true of: the note is the first child of the tabpanel and
    // the tabpanel holds the only table in the document, so there has never
    // been anything above the sentence but the tab bar.
    renderProcurement("AUDITOR_READ_ONLY");
    const note = screen.getByText(/outside your role's scope in this demo/);
    expect(note.textContent).toMatch(/table below/);
    expect(note.textContent).not.toMatch(/table above/);
  });

  /**
   * The rest of that same defect, which the fix above did not reach.
   *
   * `inboundAgrees` was one consumer of the scope-shortened order array. Its
   * siblings — the match summary, the price-variance denominator and the
   * period-end classification — were computed in the same loop and left alone.
   * The worst of them was not a short count but a fabricated one: PO-26-1201's
   * RECEIPT is outside an auditor's scope, so a visibility-derived position
   * classified a matched order INVOICED_NOT_RECEIVED and printed it on that
   * tab as a named cutoff exposure, with its EXC-014 link gone because the
   * exception was matched on the withheld receipt's number. A second order
   * left the population at the same moment, so the row COUNT was 4 for both
   * roles and no surface revealed the swap.
   */
  it("does not show the auditor a cutoff finding on an order they cannot fully see", async () => {
    renderProcurement("AUDITOR_READ_ONLY", "inr");
    const panel = screen.getByRole("tabpanel");
    expect(within(panel).queryByText("PO-26-1201")).toBeNull();
    // And the claim that row used to carry: "Not yet recorded" over a receipt
    // that was recorded on 2026-12-30 and is merely unreadable here.
    expect(within(panel).queryByText("Not yet recorded")).toBeNull();
    // The premise, so this cannot pass on an empty tab.
    expect(within(panel).getByText("PO-26-1241")).toBeTruthy();
  });

  it("names a withheld document in the cell rather than dashing it out", async () => {
    renderProcurement("AUDITOR_READ_ONLY", "match");
    const cells = screen.getAllByText(/Withheld — outside your scope/);
    expect(cells.length).toBeGreaterThan(0);
    const controller = buildProcurementData(userByRole("CONTROLLER"), "T-PROC-CTL");
    const auditor = buildProcurementData(userByRole("AUDITOR_READ_ONLY"), "T-PROC-AUD");
    // The Controller sees the identifier; the auditor sees that there is one.
    const row = (d: typeof controller) =>
      d.match?.rows.find((r) => r.po === "PO-26-1201");
    expect(row(controller)?.ir).toBe("IR-26-2214");
    expect(row(auditor)?.ir).toMatch(/^Withheld/);
    expect(row(auditor)?.position).toBe(row(controller)?.position);
  });

  it("reports the close's own review count to a reader whose rows are shorter", async () => {
    // The close holds one order requiring close review. Counting the filtered
    // rows told the auditor ZERO — a control state the close does not hold.
    renderProcurement("AUDITOR_READ_ONLY", "match");
    const controller = buildProcurementData(userByRole("CONTROLLER"), "T-PROC-CTL");
    const auditor = buildProcurementData(userByRole("AUDITOR_READ_ONLY"), "T-PROC-AUD");
    expect(auditor.match?.closeSummary).toBe(controller.match?.closeSummary);
    expect(auditor.match?.divergentNote).toBe(controller.match?.divergentNote);
    expect(auditor.match?.nativeSummary).toBe(controller.match?.nativeSummary);
    // And the tab still promises only the rows it has.
    expect(auditor.tabs.find((t) => t.key === "match")?.count).toBe(
      String(auditor.match?.rows.length),
    );
  });

  it("qualifies the price-variance denominator it could not fill", async () => {
    renderProcurement("AUDITOR_READ_ONLY", "ppv");
    const tile = screen.getByText(/could be compared/);
    expect(tile.textContent).toMatch(/1 of the close.s 84 orders is outside your scope/);
    // The Controller compared every order, so the qualification must not
    // appear for them — a note that is always on says nothing.
    cleanup();
    renderProcurement("CONTROLLER", "ppv");
    expect(screen.queryByText(/could be compared/)).toBeNull();
  });
});
