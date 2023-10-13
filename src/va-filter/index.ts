import {
  GenerateNodeOptions,
  GenerateNodeType,
  createConstructor,
  createLoader,
  loadWorklet,
} from "../worklet-utils";
import { PROCESSOR } from "./processor";
import { VaFilterParams } from "./va-filter";

export { VA_FILTER_TYPE_NAMES, VaFilterType } from "./va-filter";

export const loadVaFilterProcessor = createLoader(PROCESSOR);
export type VaFilterOptions = GenerateNodeOptions<typeof VaFilterParams>;
export type VaFilterNode = GenerateNodeType<typeof VaFilterParams>;

export const VaFilter = createConstructor<VaFilterNode, VaFilterOptions>(
  "VaFilterWorklet",
  VaFilterParams
);
export const loadVaFilter = loadWorklet(loadVaFilterProcessor, VaFilter);
