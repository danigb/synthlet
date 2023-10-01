import {
  GenerateNodeOptions,
  GenerateNodeType,
  loadWorklet,
  workletNodeConstructor,
} from "../worklet-utils";
import { OscParams } from "./osc";
import { PROCESSOR } from "./processor";

export const loadOsc = loadWorklet(PROCESSOR);
export type OscOptions = GenerateNodeOptions<typeof OscParams>;
export type OscNode = GenerateNodeType<typeof OscParams>;

export const Osc = workletNodeConstructor<OscNode, OscOptions>(
  "OscWorklet",
  OscParams
);
