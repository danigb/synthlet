import {
  GenerateNodeOptions,
  GenerateNodeType,
  loadWorkletNode,
  workletNodeConstructor,
} from "../worklet-utils";
import { AdsrParams } from "./adsr";
import { PROCESSOR } from "./processor";

export const loadAdsrNode = loadWorkletNode(PROCESSOR);
export type AdsrOptions = GenerateNodeOptions<typeof AdsrParams>;
export type AdsrNode = GenerateNodeType<typeof AdsrParams>;

export const Adsr = workletNodeConstructor<AdsrNode, AdsrOptions>(
  "AdsrWorklet",
  AdsrParams
);
