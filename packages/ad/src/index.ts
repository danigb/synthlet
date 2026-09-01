import {
  createRegistrar,
  createWorkletConstructor,
  ParamInput,
} from "./_worklet";
import { PARAMS } from "./params";
import { PROCESSOR } from "./processor";

export const registerAdWorklet = createRegistrar("AD", PROCESSOR);

export type AdWorkletNode = AudioWorkletNode & {
  trigger: AudioParam;
  attack: AudioParam;
  decay: AudioParam;
  offset: AudioParam;
  gain: AudioParam;
  dispose(): void;
};

export type AdInputs = {
  trigger?: ParamInput;
  attack?: ParamInput;
  decay?: ParamInput;
  offset?: ParamInput;
  gain?: ParamInput;
};

/**
 * An attack-decay envelope generator: no input, the envelope on its output.
 */
export const AdEnv = createWorkletConstructor<AdWorkletNode, AdInputs>({
  processorName: "AdProcessor",
  descriptors: PARAMS,
  workletOptions: () => ({
    numberOfInputs: 0,
    numberOfOutputs: 1,
    processorOptions: { mode: "generator" },
  }),
});

/**
 * An attack-decay amplifier: one input, multiplied by the envelope. The
 * percussive counterpart of `AdsrAmp`.
 */
export const AdAmp = createWorkletConstructor<AdWorkletNode, AdInputs>({
  processorName: "AdProcessor",
  descriptors: PARAMS,
  workletOptions: () => ({
    numberOfInputs: 1,
    numberOfOutputs: 1,
    processorOptions: { mode: "modulator" },
  }),
});

export { Compound, disposable } from "./_worklet";
export type {
  CompoundNode,
  ConnectedUnit,
  Connector,
  Disposable,
  ParamDescriptor,
  ParamInput,
} from "./_worklet";
