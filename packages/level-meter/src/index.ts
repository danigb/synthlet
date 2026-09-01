import { PROCESSOR } from "./_processor";
import { createRegistrar, disposable } from "./_worklet";
export { LevelMeterUI } from "./meter-ui";

export const registerLevelMeterWorklet = createRegistrar(
  "LEVEL_METER",
  PROCESSOR
);

export type LevelMeterInputs = {};

export type LevelMeterWorkletNode = AudioWorkletNode & {
  dispose(): void;
  getPeaks(): Float32Array;
};

export type LevelMeterOptions = {
  maxChannels?: number;
};

export const LevelMeter = (
  context: AudioContext,
  options: LevelMeterOptions = {}
): LevelMeterWorkletNode => {
  const maxChannels = options.maxChannels || 16;
  const peaksBuffer = new SharedArrayBuffer(
    maxChannels * Float32Array.BYTES_PER_ELEMENT
  );
  const peaks = new Float32Array(peaksBuffer);
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
};
