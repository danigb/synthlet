import {
  GenerateNodeOptions,
  GenerateNodeType,
  loadWorklet,
  workletNodeConstructor,
} from "../utils";
import { AdsrParams } from "./adsr";
import { PROCESSOR } from "./processor";

export const loadAdsr = loadWorklet(PROCESSOR);
export type AdsrOptions = GenerateNodeOptions<typeof AdsrParams>;
export type AdsrNode = GenerateNodeType<typeof AdsrParams>;

export const Adsr = workletNodeConstructor<AdsrNode, AdsrOptions>(
  "AdsrWorklet",
  AdsrParams
);
