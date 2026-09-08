// Copied from state-variable-filter/src/test-utils.ts, deliberately.
//
// Three packages already carry a copy of `createWorkletTestContext` and a
// fourth is not the trigger to share it: `scripts/_spectrum.ts` records the
// rule that a helper earns a place in `scripts/` once its *readings* have to
// line up across packages, and a jest stub is not a reading.
export function createWorkletTestContext(sampleRate = 10) {
  // @ts-ignore
  global.sampleRate = sampleRate;
  // @ts-ignore
  global.AudioWorkletProcessor = class AudioWorkletNodeStub {
    port: {
      postMessage: jest.Mock<any, any, any>;
      onmessage: jest.Mock<any, any, any>;
    };

    constructor() {
      this.port = {
        postMessage: jest.fn(),
        onmessage: jest.fn(),
      };
    }
  };
  // @ts-ignore
  global.registerProcessor = jest.fn(); // Mock registerProcessor
}

// The worklet global scope exposes `sampleRate` and the processor reads it once,
// at construction, to derive its ballistics. A meter's fall rate must be the
// same at 44.1, 48 and 96 kHz, and the only way to assert that from a stub is to
// move the global between constructions.
export function setSampleRate(sampleRate: number) {
  // @ts-ignore
  global.sampleRate = sampleRate;
}

type Worklet = {
  process: (
    inputs: Float32Array[][],
    outputs: Float32Array[][],
    parameters: any,
  ) => boolean;
};

/**
 * Run `blocks` render quanta of `channels` through `worklet` and return the last
 * block's output.
 *
 * Outputs are allocated the way Web Audio allocates them when no
 * `outputChannelCount` is declared - one output channel per input channel -
 * which is exactly the shape the pass-through is supposed to fill. Pass
 * `outputChannels` to model a node whose output is narrower or wider than its
 * input.
 *
 * `channels: []` models an **unconnected input**, which Chrome delivers as an
 * empty `inputs[0]`. That is a browser fact rather than a spec guarantee, so a
 * test using it asserts the fix, not the browser.
 */
export function runProcess(
  worklet: Worklet,
  channels: Float32Array[],
  blocks = 1,
  options: { outputChannels?: number; blockSize?: number } = {},
): Float32Array[] {
  const blockSize = options.blockSize ?? channels[0]?.length ?? 128;
  const outputChannels = options.outputChannels ?? channels.length;
  let output: Float32Array[] = [];
  for (let block = 0; block < blocks; block++) {
    output = [];
    for (let c = 0; c < outputChannels; c++)
      output.push(new Float32Array(blockSize));
    worklet.process([channels], [output], {});
  }
  return output;
}

/** A block of `length` samples all equal to `value`. */
export function constant(value: number, length = 128): Float32Array {
  return new Float32Array(length).fill(value);
}

/** A block that is silent apart from one sample of `value` at `index`. */
export function spike(value: number, index = 0, length = 128): Float32Array {
  const block = new Float32Array(length);
  block[index] = value;
  return block;
}

/** `count` independent blocks, so a per-channel test cannot alias them. */
export function channels(
  count: number,
  fill: (channel: number) => Float32Array,
): Float32Array[] {
  return Array.from({ length: count }, (_, c) => fill(c));
}
