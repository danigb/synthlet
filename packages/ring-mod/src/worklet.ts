import { dcBlockCoefficient } from "./dsp";
import { PARAMS } from "./params";

/**
 * `carrier × (offset + modulator)`, with a DC blocker on each input.
 *
 * The multiply is the cheap half. The DC blockers are what make this a ring
 * modulator rather than a VCA: a `GainNode` multiplies whatever it is given,
 * and any DC on either side leaks the *other* signal straight through.
 *
 * The **output** is not blocked, deliberately. When the two frequencies
 * coincide - Reid's Case 1, 100 Hz against 100 Hz - the difference tone lands
 * at 0 Hz and the output legitimately carries an offset. Removing it would be
 * removing signal.
 */

/** Channels of DC-blocker state allocated up front, as `level-meter` does. */
const MAX_CHANNELS = 16;

export class RingModProcessor extends AudioWorkletProcessor {
  r: boolean; // running
  R: number; // the DC blockers' pole
  cx: Float32Array; // per-channel carrier x[n-1]
  cy: Float32Array; // per-channel carrier y[n-1]
  mx: number; // modulator x[n-1]
  my: number; // modulator y[n-1]
  m: Float32Array; // scratch: `offset + coupled modulator`, one per frame

  constructor() {
    super();
    this.r = true;
    this.R = dcBlockCoefficient(sampleRate);
    this.cx = new Float32Array(MAX_CHANNELS);
    this.cy = new Float32Array(MAX_CHANNELS);
    this.mx = 0;
    this.my = 0;
    this.m = new Float32Array(128);
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
    const offset = parameters.offset[0];
    const coupled = parameters.coupling[0] > 0;
    const R = this.R;

    // The modulator is one signal for every channel of the carrier, so its
    // blocker advances once per *frame*. Running it inside the channel loop
    // would step it once per channel and make a stereo carrier sound
    // different from a mono one.
    const modulator = parameters.modulator;
    const mRate = modulator.length > 1;
    if (this.m.length < frames) this.m = new Float32Array(frames);
    const m = this.m;

    let mx = this.mx;
    let my = this.my;
    if (coupled) {
      for (let i = 0; i < frames; i++) {
        const x = mRate ? modulator[i] : modulator[0];
        my = x - mx + R * my;
        mx = x;
        m[i] = offset + my;
      }
    } else {
      for (let i = 0; i < frames; i++) {
        const x = mRate ? modulator[i] : modulator[0];
        // Primed rather than frozen: `x1 = x, y1 = 0` is the state a settled
        // blocker holds for a steady input, so turning `coupling` back on
        // resumes without a step.
        mx = x;
        my = 0;
        m[i] = offset + x;
      }
    }
    this.mx = mx;
    this.my = my;

    // Growing is an allocation, but only when the channel count changes -
    // never per block. 16 covers everything a browser routes by default.
    if (input.length > this.cx.length) {
      const cx = new Float32Array(input.length);
      const cy = new Float32Array(input.length);
      cx.set(this.cx);
      cy.set(this.cy);
      this.cx = cx;
      this.cy = cy;
    }

    for (let c = 0; c < input.length && c < output.length; c++) {
      const inputChannel = input[c];
      const outputChannel = output[c];
      let x1 = this.cx[c];
      let y1 = this.cy[c];

      if (coupled) {
        for (let i = 0; i < inputChannel.length; i++) {
          const x = inputChannel[i];
          y1 = x - x1 + R * y1;
          x1 = x;
          outputChannel[i] = y1 * m[i];
        }
      } else {
        for (let i = 0; i < inputChannel.length; i++) {
          const x = inputChannel[i];
          x1 = x;
          y1 = 0;
          outputChannel[i] = x * m[i];
        }
      }

      this.cx[c] = x1;
      this.cy[c] = y1;
    }

    return this.r;
  }

  static get parameterDescriptors() {
    return PARAMS;
  }
}

registerProcessor("RingModProcessor", RingModProcessor);
