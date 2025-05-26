import { PROCESSOR } from "./_processor";
import { createRegistrar, disposable } from "./_worklet";

export const registerMeterWorklet = createRegistrar("LEVEL_METER", PROCESSOR);

export type LevelMeterInputs = {};

export type LevelMeterWorkletNode = AudioWorkletNode & {
  dispose(): void;
  getPeaks(): Float32Array;
  getRms(): Float32Array;
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
  const rmsBuffer = new SharedArrayBuffer(
    maxChannels * Float32Array.BYTES_PER_ELEMENT
  );
  const peaks = new Float32Array(peaksBuffer);
  const rms = new Float32Array(rmsBuffer);
  const node = new AudioWorkletNode(context, "LevelMeterProcessor", {
    numberOfInputs: 1,
    numberOfOutputs: 1,
    processorOptions: {
      peaksBuffer,
      rmsBuffer,
    },
  }) as LevelMeterWorkletNode;

  node.getPeaks = () => {
    return peaks;
  };

  node.getRms = () => {
    return rms;
  };

  return disposable(node);
};
