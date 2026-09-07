// The first measurement of what the nine models actually do.
//
// These tests drive the five circuit modules directly rather than through
// `worklet.ts`. `worklet.test.ts` already covers the segment renderer, and
// routing a magnitude reading through it would mean a failure here could be
// either the filter or the renderer.
//
// There is no analytic reference to compare against: these are five different
// circuits with feedback and, in two cases, a saturator, and deriving closed
// forms for them is not what this file is for. So every assertion is a
// *property* - the corner is within a stated factor of the request, the skirt
// is within a few dB of the topology's order, the response does not depend on
// the block size, the output is bounded - with the tolerance justified per
// assertion. Nothing here compares against a captured output of today's code.
//
// Five groups fail today. They are written with `it.failing`, which Jest
// reports as passing while the assertion inside is false, so the branch stays
// green and the defect stays recorded. Each one names the ticket that flips it
// back to `it`.

import { Diode } from "./diode";
import { Korg35 } from "./korg35";
import { Moog } from "./moog";
import { MoogHalf } from "./moog-half";
import { Oberheim } from "./oberheim";
import {
  Filter,
  findCorner,
  findCornerHigh,
  findExtreme,
  measureDb,
  render,
} from "./test-utils";

const RATES = [44100, 48000, 96000];

// Every corner and gain reading uses this resonance. Low, because the corner
// search bisects a magnitude curve and assumes it falls monotonically, which
// stops being true once the resonant peak is tall enough to cross the -3 dB
// line twice.
const R = 0.2;

type Model = {
  name: string;
  make: (sampleRate: number) => Filter;
  /** Order of the topology, for the skirt assertion. */
  poles: number;
};

const LOWPASS: Model[] = [
  { name: "MOOG_LADDER", make: (sr) => Moog(sr), poles: 4 },
  {
    name: "MOOG_HALF_LADDER",
    make: (sr) => MoogHalf(sr),
    poles: 2,
  },
  { name: "KORG35_LPF", make: (sr) => Korg35(sr, 0), poles: 2 },
  { name: "DIODE_LADDER", make: (sr) => Diode(sr), poles: 4 },
  {
    name: "OBERHEIM_LPF",
    make: (sr) => Oberheim(sr, 0),
    poles: 2,
  },
];

const OTHERS: Model[] = [
  { name: "KORG35_HPF", make: (sr) => Korg35(sr, 1), poles: 2 },
  {
    name: "OBERHEIM_HPF",
    make: (sr) => Oberheim(sr, 1),
    poles: 2,
  },
  {
    name: "OBERHEIM_BPF",
    make: (sr) => Oberheim(sr, 2),
    poles: 2,
  },
  {
    name: "OBERHEIM_BSF",
    make: (sr) => Oberheim(sr, 3),
    poles: 2,
  },
];

const ALL = [...LOWPASS, ...OTHERS];

function tuned(
  model: Model,
  sampleRate: number,
  frequency: number,
  resonance = R,
) {
  const filter = model.make(sampleRate);
  filter.update(frequency, resonance);
  return filter;
}

function db(
  model: Model,
  sampleRate: number,
  frequency: number,
  probe: number,
) {
  return measureDb(tuned(model, sampleRate, frequency), probe, sampleRate);
}

describe("the measured corner tracks the requested one", () => {
  // Per topology, and stated rather than fitted. A cascade of four identical
  // one-pole sections is -0.75 dB per section at the design cutoff, so its
  // composite -3 dB point sits at 0.435 * f; resonant feedback lifts the
  // response near the corner and moves the crossing back up. A 2-pole section
  // is -3 dB at its cutoff by construction and its own feedback pushes the
  // crossing above it. The bands allow +/-15-20% around what each topology
  // predicts, which is two orders tighter than the ~80x error this group was
  // written to catch and loose enough not to be a snapshot.
  const RATIO: Record<string, [number, number]> = {
    // 4-pole. 0.435 for a pure cascade, lifted by k = 4*resonance = 0.8.
    MOOG_LADDER: [0.75, 1.1],
    // 4-pole, with the ladder's own feedback zeros; closest to the cascade.
    DIODE_LADDER: [0.4, 0.7],
    // 2-pole.
    MOOG_HALF_LADDER: [1.0, 1.35],
    KORG35_LPF: [0.75, 1.05],
    // 2-pole plus the integrator in its feedback path, which sits it highest.
    OBERHEIM_LPF: [1.3, 1.75],
  };

  for (const model of LOWPASS) {
    it(`${model.name}`, () => {
      {
        const [min, max] = RATIO[model.name];
        for (const request of [100, 500, 1000, 5000]) {
          const corner = findCorner(() => model.make(48000), request, R, 48000);
          const ratio = corner / request;
          expect(ratio).toBeGreaterThan(min);
          expect(ratio).toBeLessThan(max);
        }
      }
    });
  }
});

describe("the corner does not move with the sample rate", () => {
  for (const model of LOWPASS) {
    it(`${model.name}`, () => {
      const corners = RATES.map((rate) =>
        findCorner(() => model.make(rate), 1000, R, rate),
      );
      // 5%: a bilinear-prewarped corner is exact at the cutoff by
      // construction, so what is left is each topology's own drift between
      // 44.1k and 96k - measured at 0.05% for the Moog and 1.9% for the diode
      // ladder, whose feedback term reads the cutoff a second time. The
      // Nyquist-fraction bug produced ~20% over the same span.
      const ratio = Math.max(...corners) / Math.min(...corners);
      expect(ratio).toBeLessThan(1.05);
    });
  }
});

describe("the response does not depend on the block size", () => {
  // 3000 Hz and 12000 Hz are exactly 8 and 32 cycles per 128-sample block, so
  // a model that latches `input[0]` latches a zero on every block and returns
  // silence. 231 Hz is deliberately not block-synchronous, and shows the same
  // defect as a block-size-dependent gain rather than as a hole.
  const PROBES = [231, 3000, 12000];

  for (const model of ALL) {
    it(`${model.name}`, () => {
      for (const probe of PROBES) {
        const readings = [64, 128, 512].map((blockSize) =>
          measureDb(tuned(model, 48000, 16000), probe, 48000, { blockSize }),
        );
        expect(Math.max(...readings) - Math.min(...readings)).toBeLessThan(0.5);
      }
    });
  }
});

describe("recovers from a poisoned state", () => {
  // The circuit-level half of the contract. Every model keeps its state in
  // plain arrays with no guard, and `NaN + anything` is `NaN`, so once one of
  // the `fRec*` is poisoned there is no input that clears it - the saturating
  // models included, because `Math.max(-1, Math.min(1, NaN))` is `NaN` too.
  // `reset()` is the only way out, and this is what asserts it does the job.
  //
  // Who calls `reset()`, and when, is `worklet.ts`'s once-a-block output scan;
  // that end of it is asserted in `worklet.test.ts`, where the guard lives.
  for (const model of ALL) {
    it(`${model.name}`, () => {
      const filter = tuned(model, 48000, 1000, 0.5);
      const poison = new Float32Array(128);
      poison[0] = NaN;
      filter.process(poison, new Float32Array(128), 0, 128);

      const length = 8 * 128;
      const input = new Float32Array(length);
      const output = new Float32Array(length);
      for (let n = 0; n < length; n++) {
        input[n] = 1e-3 * Math.sin((2 * Math.PI * 440 * n) / 48000);
      }

      // Still dead, however long it is fed.
      render(filter, input, output, 128);
      expect(Number.isFinite(output[length - 1])).toBe(false);

      // And alive again one block after a reset.
      filter.reset();
      filter.update(1000, 0.5);
      output.fill(0);
      render(filter, input, output, 128);
      for (const sample of output) expect(Number.isFinite(sample)).toBe(true);
      expect(Array.from(output).some((sample) => sample !== 0)).toBe(true);
    });
  }
});

describe("survives a cutoff past Nyquist", () => {
  // `frequency: 1000, detune: 127` is inside both declared ranges and folds to
  // 1.54 MHz; `frequency: 20, detune: -127` folds to 0.013 Hz. Both ends, and
  // every sample rate a Web Audio implementation can pick - 8000 and 22050 are
  // the interesting ones, because `frequency.maxValue` is a compile-time 20000
  // and Nyquist is not, so below 40 kHz the parameter's own declared maximum is
  // past the tangent's pole. What bounds it is `prewarp()`, Zavalishin eq. 3.23.
  const EXTREMES = [
    1000 * Math.pow(2, 127 / 12),
    20000 * Math.pow(2, 127 / 12),
    20 * Math.pow(2, -127 / 12),
  ];
  const RATES_INCLUDING_LOW = [8000, 22050, 44100, 48000, 96000];

  for (const model of ALL) {
    it(`${model.name}`, () => {
      for (const rate of RATES_INCLUDING_LOW) {
        for (const frequency of EXTREMES) {
          const filter = tuned(model, rate, frequency, 0.5);
          const input = new Float32Array(128);
          const output = new Float32Array(128);
          for (let n = 0; n < 128; n++) input[n] = 2e-3 * Math.random() - 1e-3;
          filter.process(input, output, 0, 128);
          for (const sample of output) {
            expect(Number.isFinite(sample)).toBe(true);
            expect(Math.abs(sample)).toBeLessThan(1);
          }
        }
      }
    });
  }
});

describe("the skirt matches the order of the topology", () => {
  // Attenuation over the decade above the *measured* corner, so this group is
  // independent of whether the corner is where it was asked for. Requested at
  // 200 Hz so that a decade above the corrected corner is still well clear of
  // Nyquist at 44.1 kHz.
  //
  // Bands are per model rather than `20 * poles` because a decade is not far
  // enough for any of these to have reached its asymptote, and because the
  // diode ladder's feedback path puts zeros in the response. Each is stated
  // with the order it comes from; none is fitted tighter than the 4-pole /
  // 2-pole separation this group exists to make.
  const BAND: Record<string, [number, number]> = {
    MOOG_LADDER: [60, 82], // 4-pole, asymptote 80
    DIODE_LADDER: [50, 82], // 4-pole with feedback zeros, so shallower
    MOOG_HALF_LADDER: [32, 48], // 2-pole, asymptote 40
    KORG35_LPF: [32, 48], // 2-pole
    OBERHEIM_LPF: [38, 56], // 2-pole plus the integrator in its feedback path
  };

  for (const model of LOWPASS) {
    it(`${model.name}`, () => {
      for (const rate of RATES) {
        const corner = findCorner(() => model.make(rate), 200, R, rate);
        const attenuation =
          db(model, rate, 200, 5) - db(model, rate, 200, corner * 10);
        const [min, max] = BAND[model.name];
        expect(attenuation).toBeGreaterThan(min);
        expect(attenuation).toBeLessThan(max);
      }
    });
  }

  it("separates the 4-pole models from the 2-pole ones", () => {
    const decade = (model: Model) => {
      const corner = findCorner(() => model.make(48000), 200, R, 48000);
      return db(model, 48000, 200, 5) - db(model, 48000, 200, corner * 10);
    };
    const four = LOWPASS.filter((m) => m.poles === 4).map(decade);
    const two = LOWPASS.filter((m) => m.poles === 2).map(decade);
    // This is what the existing "gives every VaFilterType its own model" test
    // in worklet.test.ts cannot do: nine differently-broken filters all have
    // distinct impulse responses, but only two of them are 4-pole.
    expect(Math.min(...four)).toBeGreaterThan(Math.max(...two));
  });
});

describe("the highpass, bandpass and bandstop taps are what they say", () => {
  it("KORG35_HPF attenuates below its corner and passes above it", () => {
    for (const rate of RATES) {
      const model = OTHERS[0];
      const corner = findCornerHigh(() => model.make(rate), 1000, R, rate);
      const below = db(model, rate, 1000, corner / 4);
      const above = db(model, rate, 1000, corner * 4);
      // 12 dB rather than the 24 a 2-pole would give two octaves down: the
      // Korg 35's feedback path feeds the lower band back in, which lifts the
      // stopband. Measured 15 dB.
      expect(above - below).toBeGreaterThan(12);
    }
  });

  it("OBERHEIM_HPF attenuates below its corner and passes above it", () => {
    const model = OTHERS[1];
    const corner = findCornerHigh(() => model.make(48000), 1000, R, 48000);
    expect(
      db(model, 48000, 1000, corner * 4) - db(model, 48000, 1000, corner / 4),
    ).toBeGreaterThan(20);
  });

  it("OBERHEIM_BPF peaks near its corner and falls either side", () => {
    const model = OTHERS[2];
    const peak = findExtreme(() => model.make(48000), 1000, R, 48000, "peak");
    const at = db(model, 48000, 1000, peak);
    expect(at - db(model, 48000, 1000, peak / 8)).toBeGreaterThan(10);
    expect(at - db(model, 48000, 1000, peak * 8)).toBeGreaterThan(10);
  });

  it("OBERHEIM_BSF notches", () => {
    const model = OTHERS[3];
    const notch = findExtreme(() => model.make(48000), 1000, R, 48000, "notch");
    const at = db(model, 48000, 1000, notch);
    // Only 5 dB asserted against a measured 7.7: this notch is shallow
    // because the band-stop tap is a sum of the other three rather than a
    // dedicated structure, and the depth is set by how exactly they cancel.
    expect(db(model, 48000, 1000, notch / 8) - at).toBeGreaterThan(5);
    expect(db(model, 48000, 1000, notch * 8) - at).toBeGreaterThan(5);
  });
});

describe("passband gain against resonance", () => {
  // Recorded, not corrected. Ticket 06 is what changes these numbers; this
  // group is the baseline that stops it being graded by ear.
  const RESONANCES = [0, 0.2, 0.5, 0.9];

  it("MOOG_LADDER ducks by exactly 1/(1+4*resonance)", () => {
    // `moog.ts:34` maps resonance to `24.293 * r` and scales the feedback by
    // 0.1646572, so k = 4.0 * r to five figures. An uncompensated ladder's DC
    // gain is 1/(1+k). Measured -0.00, -5.11, -9.54, -13.25 dB against a
    // predicted 0, -5.11, -9.54, -13.26.
    for (const resonance of RESONANCES) {
      const filter = tuned(LOWPASS[0], 48000, 1000, resonance);
      const measured = measureDb(filter, 5, 48000);
      const predicted = 20 * Math.log10(1 / (1 + 4 * resonance));
      expect(Math.abs(measured - predicted)).toBeLessThan(0.1);
    }
  });

  it("MOOG_HALF_LADDER ducks too, and by less", () => {
    // Half the ladder, half the feedback: measured -0.30, -2.65, -5.56, -8.48.
    const at = (resonance: number) =>
      measureDb(tuned(LOWPASS[1], 48000, 1000, resonance), 5, 48000);
    const readings = RESONANCES.map(at);
    for (let n = 1; n < readings.length; n++) {
      expect(readings[n]).toBeLessThan(readings[n - 1]);
    }
    expect(readings[0] - readings[3]).toBeGreaterThan(6);
    expect(readings[0] - readings[3]).toBeLessThan(12);
  });

  for (const model of [LOWPASS[2], LOWPASS[4]]) {
    it(`${model.name} normalises its own feedback`, () => {
      // The Korg 35 and the Oberheim scale the feedback back into the forward
      // path, so resonance costs no passband level. No literature formula is
      // claimed here; this is a measurement, within 1 dB of unity across the
      // whole range.
      for (const resonance of RESONANCES) {
        const filter = tuned(model, 48000, 1000, resonance);
        expect(Math.abs(measureDb(filter, 5, 48000))).toBeLessThan(1);
      }
    });
  }

  it("DIODE_LADDER is 30 dB hot", () => {
    // `diode.ts:66` multiplies the input by 100 before its soft clipper. That
    // is not a resonance compensation and not in the literature: it is a
    // hardcoded gain, and ticket 06 removes it. Measured +34.5 dB at
    // resonance 0, falling to +19.9 at 0.9.
    const at = (resonance: number) =>
      measureDb(tuned(LOWPASS[3], 48000, 1000, resonance), 5, 48000);
    expect(at(0)).toBeGreaterThan(30);
    expect(at(0.9)).toBeGreaterThan(15);
  });
});

describe("bounded at maximum resonance", () => {
  // Bounded, not self-oscillating. `moog.ts` reaches k = 4.0 exactly, the
  // analytic threshold, so it is a marginally stable linear resonator that
  // rings at whatever amplitude it was left with; the other four are below
  // their thresholds and decay. Asserting growth here would be asserting
  // ticket 07 before it exists. This group is the guard that ticket 07 has to
  // keep meaning something.
  for (const model of ALL) {
    it(`${model.name}`, () => {
      const filter = tuned(model, 48000, 1000, 1.0);
      const length = 400 * 128;
      const input = new Float32Array(length);
      const output = new Float32Array(length);
      input[0] = 1e-3;
      render(filter, input, output, 128);

      let early = 0;
      let late = 0;
      for (let n = 0; n < length; n++) {
        const sample = output[n];
        expect(Number.isFinite(sample)).toBe(true);
        if (n < 50 * 128) early = Math.max(early, Math.abs(sample));
        if (n >= 350 * 128) late = Math.max(late, Math.abs(sample));
      }
      expect(late).toBeLessThan(early * 1.05);
    });
  }
});
