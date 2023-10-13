import {
  GenerateNodeOptions,
  GenerateNodeType,
  loadWorklet,
  loadWorkletProcessor,
  workletNodeConstructor,
} from "../worklet-utils";
import { PROCESSOR } from "./processor";
import { PARAMS } from "./sequencer";

export type SequencerOptions = GenerateNodeOptions<typeof PARAMS>;

export type SequencerNode = GenerateNodeType<typeof PARAMS>;

export const Sequencer = workletNodeConstructor<
  SequencerNode,
  SequencerOptions
>("SequencerWorklet", PARAMS);

export const loadSequencerNode = loadWorkletProcessor(PROCESSOR);

export const loadSequencer = loadWorklet<SequencerNode, SequencerOptions>(
  loadSequencerNode,
  "SequencerWorklet",
  PARAMS
);
