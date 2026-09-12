import { createGateDetector } from "./_gate";
import { PARAMS } from "./params";
import { SampleHoldType } from "./dsp";

/**
 * Latch the input on a trigger edge and hold it.
 *
 * ```
 * on the edge:  held = input[i]
 * every sample: output[i] = held
 * ```
 *
 * Which edge is `type`. Everything else is the gate contract, and this package
 * does not own a copy of it: `createGateDetector()` from `_gate.ts` is what
 * decides both what a rising edge is and - through its `open` state - what
 * "while the trigger is positive" means in `Track` mode. There is deliberately
 * no `> 0` anywhere in this file.
 *
 * The hold is exact and permanent. The book is careful about the analogue
 * version's droop - *"the impedance is never truly infinite, so the voltage
 * will decay slowly"* - and the digital one simply has none. A droop parameter
 * would be a slew limiter pointing the wrong way.
 */

/** Channels of held value allocated up front, as `level-meter` does. */
const MAX_CHANNELS = 16;

export class SampleHoldProcessor extends AudioWorkletProcessor {
  r: boolean; // running
  g: ReturnType<typeof createGateDetector>;
  o: boolean; // the detector's open state, for Track mode
  v: Float32Array; // per-channel held value
  l: Uint8Array; // scratch: latch this frame?

  constructor() {
    super();
    this.r = true;
    this.g = createGateDetector();
    this.o = false;
    this.v = new Float32Array(MAX_CHANNELS);
    this.l = new Uint8Array(128);
    this.port.onmessage = (event) => {
      switch (event.data.type) {
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
    const output = outputs[0];
    const frames = output[0]?.length ?? 0;
    if (frames === 0) return this.r;

    const input = inputs[0];
    const track = parameters.type[0] >= SampleHoldType.Track;

    // The trigger is one signal for every channel, so the detector advances
    // once per *frame*. Running it inside the channel loop would step it once
    // per channel, and a stereo input would sample at different instants from
    // a mono one.
    const trigger = parameters.trigger;
    const tRate = trigger.length > 1;
    if (this.l.length < frames) this.l = new Uint8Array(frames);
    const latch = this.l;

    let open = this.o;
    if (track) {
      for (let i = 0; i < frames; i++) {
        const edge = this.g(tRate ? trigger[i] : trigger[0]);
        if (edge !== undefined) open = edge;
        latch[i] = open ? 1 : 0;
      }
    } else {
      for (let i = 0; i < frames; i++) {
        const edge = this.g(tRate ? trigger[i] : trigger[0]);
        if (edge !== undefined) open = edge;
        latch[i] = edge === true ? 1 : 0;
      }
    }
    this.o = open;

    // Growing is an allocation, but only when the channel count changes -
    // never per block.
    if (input.length > this.v.length) {
      const held = new Float32Array(input.length);
      held.set(this.v);
      this.v = held;
    }

    for (let c = 0; c < input.length && c < output.length; c++) {
      const inputChannel = input[c];
      const outputChannel = output[c];
      let held = this.v[c];

      for (let i = 0; i < inputChannel.length; i++) {
        if (latch[i]) held = inputChannel[i];
        outputChannel[i] = held;
      }

      this.v[c] = held;
    }

    return this.r;
  }

  static get parameterDescriptors() {
    return PARAMS;
  }
}

registerProcessor("SampleHoldProcessor", SampleHoldProcessor);
