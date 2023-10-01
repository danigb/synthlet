import {
  GenerateNodeOptions,
  GenerateNodeType,
  loadWorklet,
  workletNodeConstructor,
} from "../worklet-utils";
import { LfoParams } from "./lfo";
import { PROCESSOR } from "./processor";

export const loadLfo = loadWorklet(PROCESSOR);
export type LfoOptions = GenerateNodeOptions<typeof LfoParams>;
export type LfoNode = GenerateNodeType<typeof LfoParams>;

export const Lfo = workletNodeConstructor<LfoNode, LfoOptions>(
  "LfoWorklet",
  LfoParams
);
