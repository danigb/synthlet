import {
  createRegistrar,
  createWorkletConstructor,
  ParamInput,
} from "./_worklet";
import { PROCESSOR } from "./processor";

export const registerReverbDelayWorklet = createRegistrar(
  "REVERB-DELAY",
  PROCESSOR
);

export type ReverbDelayInputs = {
  delay: ParamInput;
  damping: ParamInput;
  size: ParamInput;
  diffusion: ParamInput;
  feedback: ParamInput;
  modDepth: ParamInput;
  modFreq: ParamInput;
};

export type ReverbDelayWorkletNode = AudioWorkletNode & {
  delay: AudioParam;
  damping: AudioParam;
  size: AudioParam;
  diffusion: AudioParam;
  feedback: AudioParam;
  modDepth: AudioParam;
  modFreq: AudioParam;
  dispose(): void;
};

export const ReverbDelay = createWorkletConstructor<
  ReverbDelayWorkletNode,
  ReverbDelayInputs
>({
  processorName: "ReverbDelayProcessor",
  paramNames: [
    "delay",
    "damping",
    "size",
    "diffusion",
    "feedback",
    "modDepth",
    "modFreq",
  ],
  workletOptions: () => ({
    numberOfInputs: 1,
    numberOfOutputs: 1,
    outputChannelCount: [2],
  }),
});
