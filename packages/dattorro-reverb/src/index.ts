import {
  createRegistrar,
  createWorkletConstructor,
  ParamInput,
} from "./_worklet";
import { PROCESSOR } from "./processor";

export const registerDattorroReverbWorklet = createRegistrar(
  "DATTORRO_REVERB",
  PROCESSOR
);

export type DattorroReverbInputs = {
  filter?: ParamInput;
  inputDiffusion1?: ParamInput;
  inputDiffusion2?: ParamInput;
  decayDiffusion1?: ParamInput;
  decayDiffusion2?: ParamInput;
  decay?: ParamInput;
  damping?: ParamInput;
  // dryWet?: ParamInput;
  // level?: ParamInput;
};

export type DattorroReverbWorkletNode = AudioWorkletNode & {
  filter: AudioParam;
  inputDiffusion1: AudioParam;
  inputDiffusion2: AudioParam;
  decayDiffusion1: AudioParam;
  decayDiffusion2: AudioParam;
  decay: AudioParam;
  damping: AudioParam;
  // dryWet: AudioParam;
  // level: AudioParam;
  dispose(): void;
};

export const DattorroReverb = createWorkletConstructor<
  DattorroReverbWorkletNode,
  DattorroReverbInputs
>({
  processorName: "DattorroReverbProcessor",
  paramNames: [
    "filter",
    "inputDiffusion1",
    "inputDiffusion2",
    "decayDiffusion1",
    "decayDiffusion2",
    "decay",
    "damping",
    // "dryWet",
    // "level",
  ],
  workletOptions: () => ({
    numberOfInputs: 1,
    numberOfOutputs: 1,
    outputChannelCount: [2],
  }),
});
