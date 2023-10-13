import {
  GenerateNodeOptions,
  GenerateNodeType,
  createProcessorLoader,
  createWorkletConstructor,
  loadWorklet,
} from "../worklet-utils";
import { PARAMS } from "./lfo";
import { PROCESSOR } from "./processor";

export { LFO_WAVEFORM_NAMES, LfoMode, LfoWaveform } from "./lfo";

export const loadLfoNode = createProcessorLoader(PROCESSOR);
export type LfoOptions = GenerateNodeOptions<typeof PARAMS>;
export type LfoNode = GenerateNodeType<typeof PARAMS>;

export const Lfo = createWorkletConstructor<LfoNode, LfoOptions>(
  "LfoWorklet",
  PARAMS
);

export const loadLfo = loadWorklet<LfoNode, LfoOptions>(
  loadLfoNode,
  "LfoWorklet",
  PARAMS
);
