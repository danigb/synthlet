import {
  createRegistrar,
  createWorkletConstructor,
  ParamInput,
} from "./_worklet";
import { PARAMS } from "./params";
import { PROCESSOR } from "./processor";

export { ArpMode, ArpOctaveMode, ArpScale } from "./dsp";

export const registerArpWorklet = createRegistrar("ARP", PROCESSOR);

export type ArpInputs = {
  trigger?: ParamInput;
  mode?: ParamInput;
  octaveMode?: ParamInput;
  baseNote?: ParamInput;
  scale?: ParamInput;
  octaves?: ParamInput;
};

export type ArpWorkletNode = AudioWorkletNode & {
  trigger: AudioParam;
  mode: AudioParam;
  octaveMode: AudioParam;
  baseNote: AudioParam;
  scale: AudioParam;
  octaves: AudioParam;
  dispose(): void;
};

export const Arp = createWorkletConstructor<ArpWorkletNode, ArpInputs>({
  processorName: "ArpProcessor",
  descriptors: PARAMS,
  workletOptions: () => ({
    numberOfInputs: 0,
    numberOfOutputs: 1,
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
