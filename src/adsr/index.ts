import {
  GenerateNodeOptions,
  GenerateNodeType,
  loadWorklet,
  loadWorkletProcessor,
  workletNodeConstructor,
} from "../worklet-utils";
import { PARAMS } from "./adsr";
import { PROCESSOR } from "./processor";

export const loadAdsrNode = loadWorkletProcessor(PROCESSOR);
export type AdsrOptions = GenerateNodeOptions<typeof PARAMS>;
export type AdsrNode = GenerateNodeType<typeof PARAMS>;

export const loadAdsr = loadWorklet<AdsrNode, AdsrOptions>(
  loadAdsrNode,
  "AdsrWorklet",
  PARAMS
);
export const Adsr = workletNodeConstructor<AdsrNode, AdsrOptions>(
  "AdsrWorklet",
  PARAMS
);
