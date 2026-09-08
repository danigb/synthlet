import { PROCESSOR } from "./processor";
import { createRegistrar, disposable, ParamDescriptor } from "./_worklet";
export { LevelMeterUI } from "./meter-ui";

export const registerLevelMeterWorklet = createRegistrar(
  "LEVEL_METER",
  PROCESSOR,
);

export type LevelMeterInputs = {};

export type LevelMeterWorkletNode = AudioWorkletNode & {
  dispose(): void;
  getPeaks(): Float32Array;
};

export type LevelMeterOptions = {
  maxChannels?: number;
};

export const LevelMeter = Object.assign(
  (
    context: AudioContext,
    options: LevelMeterOptions = {},
  ): LevelMeterWorkletNode => {
    const maxChannels = options.maxChannels || 16;
    const peaksBuffer = new SharedArrayBuffer(
      maxChannels * Float32Array.BYTES_PER_ELEMENT,
    );
    const peaks = new Float32Array(peaksBuffer);
    // Hand-rolled rather than built with `createWorkletConstructor`: that helper
    // exists to wire `AudioParam`s from a `ParamInput` map, and the meter has no
    // parameters by design. What it does need is a `processorOptions` payload,
    // which the helper does not carry. Not an oversight - there is nothing here
    // for it to do.
    const node = new AudioWorkletNode(context, "LevelMeterProcessor", {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      processorOptions: {
        peaksBuffer,
      },
    }) as LevelMeterWorkletNode;

    node.getPeaks = () => {
      return peaks;
    };

    return disposable(node);
  },
  // No parameters: the meter is configured by options, not AudioParams.
  { descriptors: [] as readonly ParamDescriptor[] },
);

export { Compound, disposable } from "./_worklet";
export type {
  CompoundNode,
  ConnectedUnit,
  Connector,
  Disposable,
  ParamDescriptor,
  ParamInput,
} from "./_worklet";
