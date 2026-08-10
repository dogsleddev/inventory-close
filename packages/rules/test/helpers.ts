import { buildDataset, toCloseInput, type IcgDataset } from "@icg/data";
import type { CloseInput } from "../src/index.js";

/**
 * Test-side assembly of CloseInput. The wiring lives in @icg/data
 * (toCloseInput) so services and tests share one bridge; packages/rules
 * itself never depends on @icg/data (dependency direction).
 */
export function closeInputFromDataset(dataset: IcgDataset = buildDataset()): CloseInput {
  return toCloseInput(dataset);
}
