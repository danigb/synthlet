import {
  GenerateNodeOptions,
  GenerateNodeType,
  createConstructor,
  createLoader,
  loadWorklet,
} from "../worklet-utils";
import { PROCESSOR } from "./processor";
import { PARAMS } from "./sequencer";

export type SequencerOptions = GenerateNodeOptions<typeof PARAMS>;

export type SequencerNode = GenerateNodeType<typeof PARAMS>;

export const Sequencer = createConstructor<SequencerNode, SequencerOptions>(
  "SequencerWorklet",
  PARAMS
);
export const loadSequencerProcessor = createLoader(PROCESSOR);
export const loadSequencer = loadWorklet(loadSequencerProcessor, Sequencer);
