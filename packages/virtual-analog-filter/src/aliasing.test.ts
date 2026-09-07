// What the oversampling is for, measured end to end through the processor
// rather than through the circuits, because the resampling lives in
// `worklet.ts` and a measurement that bypassed it would be measuring nothing.
//
// The metric is `_spectrum.ts`'s `aliasSnr`: signal power in the bins near
// harmonics of the probe against everything else, in dB, higher is better.
// This package opted into that file so its numbers are comparable with the
// two oscillator packages' rather than being a second metric with its own
// conventions.

import { aliasSnr } from "./_spectrum";

const SAMPLE_RATE = 48000;
const BLOCK = 128;
const LENGTH = 1 << 15;

const MOOG_LADDER = 0;
const MOOG_HALF_LADDER = 1;
const DIODE_LADDER = 4;
const OBERHEIM_LPF = 5;

describe("aliasing", () => {
  let Worklet: any;

  beforeAll(async () => {
    // @ts-ignore
    global.sampleRate = SAMPLE_RATE;
    // @ts-ignore
    global.AudioWorkletProcessor = class {
      port: { postMessage: jest.Mock; onmessage: jest.Mock };
      constructor() {
        this.port = { postMessage: jest.fn(), onmessage: jest.fn() };
      }
    };
    // @ts-ignore
    global.registerProcessor = jest.fn();
    Worklet = (await import("./worklet")).VAF;
  });

  function measure(
    type: number,
    probe: number,
    frequency: number,
    drive: number,
    resonance: number,
  ) {
    const node = new Worklet();
    const params = {
      type: [type],
      frequency: [frequency],
      detune: [0],
      resonance: [resonance],
      drive: [drive],
    };
    const rendered = new Float32Array(LENGTH);
    const input = new Float32Array(BLOCK);
    const outputs = [[new Float32Array(BLOCK)]];
    for (let i = 0; i < LENGTH; i += BLOCK) {
      for (let n = 0; n < BLOCK; n++) {
        input[n] = Math.sin((2 * Math.PI * probe * (i + n)) / SAMPLE_RATE);
      }
      node.process([[input]], outputs, params);
      rendered.set(outputs[0][0], i);
    }
    // The second half, so the resampler and the filter have both settled.
    return aliasSnr(rendered.subarray(LENGTH / 2), probe, SAMPLE_RATE);
  }

  // A probe that is *not* a sub-multiple of the sample rate. 1 kHz at 48 kHz
  // is 48 samples a cycle exactly, so every alias folds back onto a harmonic
  // and the metric reads a clean 97 dB whatever the filter is doing. That
  // reading is an artefact of the probe, and it is why these are 3.7 and 7.9
  // kHz.
  const CASES: [string, number, number, number, number, number][] = [
    // name, type, probe, cutoff, drive, resonance
    ["MOOG_LADDER", MOOG_LADDER, 3700, 8000, 10, 0.5],
    ["MOOG_LADDER hot", MOOG_LADDER, 7900, 12000, 10, 0.9],
    ["MOOG_HALF_LADDER", MOOG_HALF_LADDER, 3700, 8000, 10, 0.5],
    ["DIODE_LADDER", DIODE_LADDER, 3700, 8000, 10, 0.9],
    ["DIODE_LADDER hot", DIODE_LADDER, 3700, 8000, 100, 0.9],
    ["OBERHEIM_LPF", OBERHEIM_LPF, 3700, 8000, 10, 0.9],
    ["OBERHEIM_LPF hot", OBERHEIM_LPF, 3700, 8000, 100, 0.9],
  ];

  // Measured without oversampling, before this ticket, and measured with it
  // after. The floors below are the "after" column minus a couple of dB of
  // headroom; the "before" column is what they have to beat, and it is in the
  // comment rather than in a second render because re-measuring the old
  // behaviour would mean shipping it.
  //
  //                        before   after (2x)
  //   MOOG_LADDER           39.5      51.0
  //   MOOG_LADDER hot       26.6      35.3
  //   MOOG_HALF_LADDER      44.6      54.4
  //   DIODE_LADDER          14.8      31.6
  //   DIODE_LADDER hot      12.5      23.4
  //   OBERHEIM_LPF           7.3      43.4
  //   OBERHEIM_LPF hot      -9.3      23.6
  const FLOORS: Record<string, number> = {
    MOOG_LADDER: 48,
    "MOOG_LADDER hot": 33,
    MOOG_HALF_LADDER: 51,
    DIODE_LADDER: 29,
    "DIODE_LADDER hot": 21,
    OBERHEIM_LPF: 40,
    "OBERHEIM_LPF hot": 21,
  };

  it.each(CASES)(
    "%s clears its floor",
    (name, type, probe, cutoff, drive, resonance) => {
      const snr = measure(type, probe, cutoff, drive, resonance);
      expect(snr).toBeGreaterThan(FLOORS[name]);
    },
  );

  it("the linear models are unaffected, because they do not alias", () => {
    // KORG35_LPF has no clipper and no `tanh`, so it generates nothing to
    // fold: it does not resample and this is the assertion that it does not
    // need to.
    const snr = measure(2, 3700, 8000, 10, 0.9);
    expect(snr).toBeGreaterThan(90);
  });
});
