import {
  GenerateNodeOptions,
  GenerateNodeType,
  createProcessorLoader,
  createWorkletConstructor,
  loadWorklet,
} from "../worklet-utils";
import { PROCESSOR } from "./processor";
import { PARAMS } from "./sequencer";

export type SequencerOptions = GenerateNodeOptions<typeof PARAMS>;

export type SequencerNode = GenerateNodeType<typeof PARAMS>;

export const Sequencer = createWorkletConstructor<
  SequencerNode,
  SequencerOptions
>("SequencerWorklet", PARAMS);

export const loadSequencerNode = createProcessorLoader(PROCESSOR);

export const loadSequencer = loadWorklet<SequencerNode, SequencerOptions>(
  loadSequencerNode,
  "SequencerWorklet",
  PARAMS
);
