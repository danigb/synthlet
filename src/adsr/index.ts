import {
  GenerateNodeOptions,
  GenerateNodeType,
  createProcessorLoader,
  createWorkletConstructor,
  loadWorklet,
} from "../worklet-utils";
import { PARAMS } from "./adsr";
import { PROCESSOR } from "./processor";

export const loadAdsrNode = createProcessorLoader(PROCESSOR);
export type AdsrOptions = GenerateNodeOptions<typeof PARAMS>;
export type AdsrNode = GenerateNodeType<typeof PARAMS>;

export const loadAdsr = loadWorklet<AdsrNode, AdsrOptions>(
  loadAdsrNode,
  "AdsrWorklet",
  PARAMS
);
export const Adsr = createWorkletConstructor<AdsrNode, AdsrOptions>(
  "AdsrWorklet",
  PARAMS
);
