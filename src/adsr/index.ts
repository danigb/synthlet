import {
  GenerateNodeOptions,
  GenerateNodeType,
  createProcessorLoader,
  createWorkletConstructor,
  loadWorklet,
} from "../worklet-utils";
import { PARAMS } from "./adsr";
import { PROCESSOR } from "./processor";

export type AdsrOptions = GenerateNodeOptions<typeof PARAMS>;
export type AdsrNode = GenerateNodeType<typeof PARAMS>;

export const loadAdsrNode = createProcessorLoader(PROCESSOR);
export const Adsr = createWorkletConstructor<AdsrNode, AdsrOptions>(
  "AdsrWorklet",
  PARAMS
);
export const loadAdsr = loadWorklet(loadAdsrNode, Adsr);
