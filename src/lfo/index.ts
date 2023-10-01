import {
  GenerateNodeOptions,
  GenerateNodeType,
  loadWorklet,
  workletNodeConstructor,
} from "../worklet-utils";
import { LfoParamsDef } from "./lfo";
import { PROCESSOR } from "./processor";

export { LFO_WAVEFORM_NAMES, LfoMode, LfoWaveform } from "./lfo";

export const loadLfo = loadWorklet(PROCESSOR);
export type LfoOptions = GenerateNodeOptions<typeof LfoParamsDef>;
export type LfoNode = GenerateNodeType<typeof LfoParamsDef>;

export const Lfo = workletNodeConstructor<LfoNode, LfoOptions>(
  "LfoWorklet",
  LfoParamsDef
);
