/**
 * Label helpers: canonical enum spellings → display copy. Pure string
 * shaping — the canonical value always exists alongside where it matters.
 */

const SMALL_WORDS = new Set(["of", "and", "the", "to", "in", "on", "at"]);

export function titleCase(value: string): string {
  return value
    .toLowerCase()
    .split(/[_\s]+/)
    .map((word, i) =>
      i > 0 && SMALL_WORDS.has(word) ? word : word.charAt(0).toUpperCase() + word.slice(1),
    )
    .join(" ");
}

/** First letter up, rest untouched — for phrases that are already cased. */
export function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/**
 * Location id → display name. The dataset owns these names, so they are
 * registered from `listLocations()` at page-build time rather than
 * transcribed here; title-casing the id is only the fallback for an id the
 * dataset does not describe.
 */
const LOCATION_NAMES = new Map<string, string>();

export function registerLocationNames(
  locations: readonly { id: string; name: string }[],
): void {
  for (const loc of locations) LOCATION_NAMES.set(loc.id, loc.name);
}

export function locationLabel(value: string): string {
  return LOCATION_NAMES.get(value) ?? titleCase(value);
}

/** Evidence/record kinds → display ("ITEM_FULFILLMENT" → "Item Fulfillment"). */
export function kindLabel(kind: string): string {
  const special: Record<string, string> = {
    RMA_RECORD: "RMA Record",
    GL_ENTRY: "GL Entry",
    TELEMETRY: "Telemetry — first online",
    CARRIER_SHIPMENT: "Carrier Shipment",
    COUNT_RESULT: "Count Result",
    COUNT_TEST: "Count Test",
    CUSTODIAN_STATEMENT: "Custodian Statement",
  };
  return special[kind] ?? titleCase(kind);
}

/** Source-system ids → the design's short mono chip labels. */
export function sourceLabel(sourceSystem: string): string {
  const map: Record<string, string> = {
    NETSUITE_ERP: "NETSUITE",
    NETSUITE_WMS: "NETSUITE WMS",
    FLIGHTPATH: "FLIGHTPATH",
    DEPLOY_OPS: "DEPLOYOPS",
    DEVICE_CLOUD: "DEVICE CLOUD",
    ACCORD_VAULT: "ACCORDVAULT",
    RETURN_LOOP: "RETURNLOOP",
    KESTREL_CRM: "KESTREL CRM",
    FORECAST_PLATFORM: "FORECAST",
  };
  return map[sourceSystem] ?? sourceSystem;
}

/** Source-system ids → friendly names for the health panel. */
export function sourceName(sourceSystem: string): string {
  const map: Record<string, string> = {
    NETSUITE_ERP: "NetSuite ERP",
    NETSUITE_WMS: "NetSuite WMS",
    FLIGHTPATH: "FlightPath",
    DEPLOY_OPS: "DeployOps",
    DEVICE_CLOUD: "Device Cloud",
    ACCORD_VAULT: "AccordVault",
    RETURN_LOOP: "ReturnLoop",
    KESTREL_CRM: "Kestrel CRM",
    FORECAST_PLATFORM: "Forecast Platform",
  };
  return map[sourceSystem] ?? sourceSystem;
}

/** Assertion enum → design tag copy ("RIGHTS_AND_OBLIGATIONS" → "Rights & Obligations"). */
export function assertionLabel(assertion: string): string {
  return titleCase(assertion).replace(" and ", " & ");
}

/** Scenario event types → activity feed labels. */
export function eventTypeLabel(eventType: string): string {
  return titleCase(eventType);
}

const NUMBER_WORDS = [
  "zero",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
] as const;

export function numberWord(n: number): string {
  return NUMBER_WORDS[n] ?? String(n);
}
