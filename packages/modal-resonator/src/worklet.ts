import { clampMaxModes, createResonatorBank, FIELDS } from "./dsp";
import { PARAMS } from "./params";

export class ModalResonatorProcessor extends AudioWorkletProcessor {
  r: boolean; // running
  b: ReturnType<typeof createResonatorBank>; // bank

  // `maxModes` and the initial table travel in `processorOptions`, `granite`'s
  // `maxGrains` idiom: the first allocates the pool, and the second is the
  // table a node was constructed with, so it sounds right from its first
  // block rather than from whenever a message lands. With neither, the bank
  // starts on `harmonic(8)`.
  constructor(options?: AudioWorkletNodeOptions) {
    super();
    this.r = true;
    const settings = options?.processorOptions as
      { maxModes?: number; modes?: Float64Array } | undefined;
    this.b = createResonatorBank(sampleRate, clampMaxModes(settings?.maxModes));
    if (settings?.modes) {
      this.b.setModes(settings.modes, settings.modes.length / FIELDS);
    }
    this.port.onmessage = (event) => {
      switch (event.data.type) {
        case "MODES":
          // A copy into the pool, between two render quanta: the bank takes
          // it on its next `update`, and nothing inside `process` allocates.
          this.b.setModes(event.data.modes, event.data.count);
          break;
        case "DISPOSE":
          this.r = false;
          break;
      }
    };
  }

  process(
    inputs: Float32Array[][],
    outputs: Float32Array[][],
    parameters: any,
  ) {
    // Every parameter is k-rate: three reads per block. There is no early
    // return on a missing input, as in `granite` and `digital-delay` - the
    // modes are still ringing after the exciter is disconnected, and an
    // unconnected input is only an empty channel list.
    this.b.update(
      parameters.frequency[0],
      parameters.decay[0],
      parameters.brightness[0],
    );
    this.b.process(inputs[0], outputs[0][0]);
    return this.r;
  }

  static get parameterDescriptors() {
    return PARAMS;
  }
}

registerProcessor("ModalResonatorProcessor", ModalResonatorProcessor);
