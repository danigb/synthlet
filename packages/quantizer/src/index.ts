import {
  createRegistrar,
  createWorkletConstructor,
  ParamInput,
} from "./_worklet";
import { PARAMS } from "./params";
import { PROCESSOR } from "./processor";

export { QuantizerOutput } from "./dsp";
// The mask table is `scripts/_scales.ts`, shared with `@synthlet/arp`, which
// publishes the same members as `ArpScale` because it named them first. The
// numbers are identical by construction - `worklet-copies.test.ts` asserts the
// file is byte-identical across its copies - so `Arp(ac, { scale })` and
// `Quantizer(ac, { scale })` can be handed the same value, or the same node.
export { Scale } from "./_scales";

export const registerQuantizerWorklet = createRegistrar("QUANTIZER", PROCESSOR);

export type QuantizerInputs = {
  /** The note number to snap: a fractional MIDI note, read per sample. */
  input?: ParamInput;
  /** 12-bit pitch-class mask, bit 0 the root. `Scale`'s encoding. */
  scale?: ParamInput;
  /** Pitch class of the root, semitones above C. Floored. */
  root?: ParamInput;
  /** Semitones past a boundary before the note changes. 0 turns it off. */
  hysteresis?: ParamInput;
  /** `QuantizerOutput.Hz` or `QuantizerOutput.Note`. */
  output?: ParamInput;
};

export type QuantizerWorkletNode = AudioWorkletNode & {
  input: AudioParam;
  scale: AudioParam;
  root: AudioParam;
  hysteresis: AudioParam;
  output: AudioParam;
  dispose(): void;
};

export const Quantizer = createWorkletConstructor<
  QuantizerWorkletNode,
  QuantizerInputs
>({
  processorName: "QuantizerProcessor",
  descriptors: PARAMS,
  workletOptions: () => ({
    // No audio input: the signal arrives on the `input` param, the way it does
    // for `Param` and `Arp`. A quantizer takes a control voltage, and in this
    // library that is an `AudioParam` a node is connected to.
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
