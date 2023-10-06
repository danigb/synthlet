import {
  GenerateNodeOptions,
  GenerateNodeType,
  loadWorklet,
  workletNodeConstructor,
} from "../worklet-utils";
import { PROCESSOR } from "./processor";
import { VaFilterParams } from "./va-filter";

export { VA_FILTER_TYPE_NAMES, VaFilterType } from "./va-filter";

export const loadVaFilter = loadWorklet(PROCESSOR);
export type VaFilterOptions = GenerateNodeOptions<typeof VaFilterParams>;
export type VaFilterNode = GenerateNodeType<typeof VaFilterParams>;

export const VaFilter = workletNodeConstructor<VaFilterNode, VaFilterOptions>(
  "VaFilterWorklet",
  VaFilterParams
);