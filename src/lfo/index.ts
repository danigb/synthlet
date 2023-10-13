import {
  GenerateNodeOptions,
  GenerateNodeType,
  createConstructor,
  createLoader,
  loadWorklet,
} from "../worklet-utils";
import { PARAMS } from "./lfo";
import { PROCESSOR } from "./processor";

export { LFO_WAVEFORM_NAMES, LfoMode, LfoWaveform } from "./lfo";

export type LfoOptions = GenerateNodeOptions<typeof PARAMS>;
export type LfoNode = GenerateNodeType<typeof PARAMS>;

export const Lfo = createConstructor<LfoNode, LfoOptions>("LfoWorklet", PARAMS);

export const loadLfoProcessor = createLoader(PROCESSOR);
export const loadLfo = loadWorklet(loadLfoProcessor, Lfo);
