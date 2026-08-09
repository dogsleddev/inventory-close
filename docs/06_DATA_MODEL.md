# 06 — Canonical Data Model

Key objects: ClosePeriod, InventorySnapshot, InventoryItem, SerialNumber, Sku, Location, GLAccount/Balance, Reconciliation/ReconciliationItem, PhysicalCountPlan, CountResult/Test/Movement, PurchaseOrder/Line, ItemReceipt/Line, VendorBill/Line, ProcurementMatch, SalesOrder/Line, ItemFulfillment/Line, CustomerInvoice/Line, CommercialChainReconciliation, Shipment/CarrierEvent, Installation/Site/Telemetry, Contract/Term, Demo, Loaner, RMA/Event, Aging/DemandForecast/ValuationIndicator/Review, Custodian/ThirdPartyInventory/Confirmation, Evidence/EvidenceLink, SourceSystem/Health/Sync, DataQualityIssue, AccountingException, BlockingCondition, RuleDefinition/Execution/Coverage/Config, PolicyConfig, OpenQuestion/Assumption, ProposedAdjustment/Lines, Review/User/Role/Permission, PBCRequest/Artifact, CloseTask/Readiness, RunManifest/ReplayResult, AuditEvent/Comment, AiInteraction/ToolCall/Citation/Draft/Session, TechnicalAccountingReview/LegalReview, Version/Manifest/GoldenScenario.

## NetSuite count extensions
Count plan stores count type YEAR_END/CYCLE/SPOT, source/external IDs, snapshot time, source status, approval/rejection metadata. Count results retain snapshot quantity, count quantity, adjusted quantity, variance, bin, serial and external count detail ID. InventoryCountAdjustment links count → variance → NetSuite inventory adjustment → GL reference.

## Key data corrections
Completeness example is **KE-X1-8842 / $9,200**. Primary cutoff serial is **KE-E2-1048** plus one linked KE-E2 unit. Redwood third-party support is 14 units / $92,400.

## State separation
Preserve NetSuite source state, operational source state, close-control state, human approval state, and AI-generated content separately.
