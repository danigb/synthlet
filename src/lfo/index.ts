import {
  GenerateNodeOptions,
  GenerateNodeType,
  loadWorkletNode,
  workletNodeConstructor,
} from "../worklet-utils";
import { PARAMS } from "./lfo";
import { PROCESSOR } from "./processor";

export { LFO_WAVEFORM_NAMES, LfoMode, LfoWaveform } from "./lfo";

export const loadLfoNode = loadWorkletNode(PROCESSOR);
export type LfoOptions = GenerateNodeOptions<typeof PARAMS>;
export type LfoNode = GenerateNodeType<typeof PARAMS>;

export const Lfo = workletNodeConstructor<LfoNode, LfoOptions>(
  "LfoWorklet",
  PARAMS
);
