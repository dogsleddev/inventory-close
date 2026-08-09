# 10 — PBC and Audit Support Package

The PBC package is management-prepared external-audit support, not an audit conclusion. PBC Ready means internal preparation/review is complete; it never means Auditor Approved.

21 PBCs: Inventory Listing; Inventory-to-GL Reconciliation; Physical Count Instructions; Physical Count Results; Count Variance Reconciliation; External Auditor Test-Count Support; Movement During Count; Outbound Cutoff; Inbound Cutoff; Goods in Transit; Third-Party Inventory; Third-Party Confirmation Tracker; Customer-Site Company-Owned Inventory; Demo Inventory; Loaner Inventory; RMA Reconciliation; Inventory Aging; E&O Analysis; Damaged Inventory Review; Proposed Inventory Adjustments; Evidence/Data-Lineage Index.

Baseline: Provided 5, Ready 12, Preparing 2, Follow-Up Requested 1, Not Started 1 = **17/21 = 80.95%**.

PBC-008 outbound cutoff includes Sales Order, Item Fulfillment, carrier, delivery, installation, invoice, contract, inventory state. PBC-009 inbound includes PO, Item Receipt, Vendor Bill, procurement match, physical receipt/carrier, ownership terms. PBC-005 includes relevant cycle-count history and repeat-variance indicators. PBC-021 carries NetSuite record type/internal ID/transaction number/line ID plus evidence lineage.

Provided versions are immutable; changes create new versions. Underlying controlled-state changes may mark workpapers `REFRESH_REQUIRED`. Export package has manifest, version set, hashes, control totals and synthetic disclosure. Auditor role is read-only and sees only provided/permitted support.
