import {
  GenerateNodeOptions,
  GenerateNodeType,
  createConstructor,
  createLoader,
  loadWorklet,
} from "../worklet-utils";
import { PARAMS } from "./adsr";
import { PROCESSOR } from "./processor";

export type AdsrOptions = GenerateNodeOptions<typeof PARAMS>;
export type AdsrNode = GenerateNodeType<typeof PARAMS>;

export const loadAdsrNode = createLoader(PROCESSOR);
export const Adsr = createConstructor<AdsrNode, AdsrOptions>(
  "AdsrWorklet",
  PARAMS
);
export const loadAdsr = loadWorklet(loadAdsrNode, Adsr);
