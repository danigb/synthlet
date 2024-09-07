import {
  createRegistrar,
  createWorkletConstructor,
  ParamInput,
} from "./_worklet";
import { PROCESSOR } from "./processor";

export { ArpScale, ArpType } from "./dsp";

export const registerArpWorklet = createRegistrar("ARP", PROCESSOR);

export type ArpInputs = {
  trigger?: ParamInput;
  type?: ParamInput;
  baseNote?: ParamInput;
  scale?: ParamInput;
  octaves?: ParamInput;
};

export type ArpWorkletNode = AudioWorkletNode & {
  trigger: AudioParam;
  type: AudioParam;
  baseNote: AudioParam;
  scale: AudioParam;
  octaves: AudioParam;
  dispose(): void;
};

export const Arp = createWorkletConstructor<ArpWorkletNode, ArpInputs>({
  processorName: "ArpProcessor",
  paramNames: ["trigger", "type", "baseNote", "scale", "octaves"],
  workletOptions: () => ({
    numberOfInputs: 0,
    numberOfOutputs: 1,
  }),
});
