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
  measure,
  measureDb,
  render,
} from "./test-utils";
import { SELF_OSCILLATION_RESONANCE } from "./saturate";

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

// The two ladders self-oscillate; the other seven do not. Kept as a list
// rather than a flag on `Model` because it is a statement about ticket 07's
// scope - the Korg 35 stays linear by decision, and the diode ladder and the
// Oberheim already have a saturator that ticket 06 made drivable.
const SCREAMS = ["MOOG_LADDER", "MOOG_HALF_LADDER"];

function tuned(
  model: Model,
  sampleRate: number,
  frequency: number,
  resonance = R,
  drive = 1,
) {
  const filter = model.make(sampleRate);
  filter.update(frequency, resonance, drive);
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
      filter.update(1000, 0.5, 1);
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

describe("passband gain does not move with resonance", () => {
  // The defect this replaces: `MOOG_LADDER` measured exactly 1/(1+4*resonance)
  // at DC, so opening the resonance turned the volume down - -5.1 dB at 0.2 and
  // -13.3 dB at 0.9 - and the Oberheim band-pass did the same thing upwards,
  // its peak gain rising from 0.707 to 28.6. Every filter people compare these
  // to applies makeup gain; this one applied none.
  //
  // The makeup is per topology and every one of them was measured before it was
  // written: `1 + k` for the two ladders, where the files' own constants make k
  // exactly 4r and 2r (Huovilainen 2004, Zavalishin section 5); nothing for the
  // Korg 35 and three of the four Oberheim taps, which normalise their own
  // feedback and measure flat to 3e-4; `1/Q` for the Oberheim band-pass; and
  // for the diode ladder a solve of its own DC steady state, because its slope
  // moves with the cutoff and there is no closed form in resonance alone.
  const RESONANCES = [0, 0.2, 0.5, 0.9, 1.0];

  // The two ladders self-oscillate above `THRESHOLD_AT_RESONANCE`, and a
  // filter generating a full-scale tone at its cutoff cannot be asked what its
  // passband gain is: the demodulator would be reading the oscillation, not
  // the probe. They are measured over the range where the question means
  // something, which is everything below the threshold.
  const range = (model: Model) =>
    SCREAMS.includes(model.name)
      ? RESONANCES.filter((r) => r < 0.95)
      : RESONANCES;

  // Where each model's passband is. The band-stop passes DC, so 5 Hz reads it
  // like a lowpass; the two highpasses are read at the top.
  const PROBE: Record<string, number> = {
    MOOG_LADDER: 5,
    MOOG_HALF_LADDER: 5,
    KORG35_LPF: 5,
    KORG35_HPF: 20000,
    DIODE_LADDER: 5,
    OBERHEIM_LPF: 5,
    OBERHEIM_HPF: 20000,
    OBERHEIM_BSF: 5,
  };

  for (const model of ALL.filter((m) => m.name !== "OBERHEIM_BPF")) {
    it(`${model.name}`, () => {
      for (const resonance of range(model)) {
        const filter = tuned(model, 48000, 1000, resonance);
        const db = measureDb(filter, PROBE[model.name], 48000);
        // 0.1 dB, against a measured spread of under 0.005 dB. The tolerance
        // is loose because it is a claim about the makeup being right, not
        // about the arithmetic being reproducible.
        expect(Math.abs(db)).toBeLessThan(0.1);
      }
    });
  }

  it("OBERHEIM_BPF", () => {
    // Read at the peak rather than at DC, because a bandpass has no DC
    // passband, and found on a log grid rather than assumed - the peak moves
    // with resonance.
    const model = ALL.find((m) => m.name === "OBERHEIM_BPF")!;
    for (const resonance of RESONANCES) {
      let peak = 0;
      for (let n = 0; n <= 40; n++) {
        const probe = 100 * Math.pow(100, n / 40);
        const filter = tuned(model, 48000, 1000, resonance);
        peak = Math.max(peak, measure(filter, probe, 48000).amplitude);
      }
      // 0.5 dB rather than 0.1: the grid has 40 steps over two decades, so it
      // lands beside the peak rather than on it, and the miss grows with the
      // sharpness of the peak. Against the 32 dB this group replaces.
      expect(Math.abs(20 * Math.log10(peak))).toBeLessThan(0.5);
    }
  });
});

describe("drive", () => {
  // `diode.ts` clipped `100 * input[i]` with no way to turn it down, so above
  // an input of about 0.01 the output fundamental was constant and only the
  // zero crossings survived: a distortion box with a filter after it, and the
  // filter's own character inaudible underneath. Known upstream as
  // faustlibraries #214, open since February 2025.
  const DIODE = ALL.find((m) => m.name === "DIODE_LADDER")!;

  it("DIODE_LADDER is clean at drive 1", () => {
    const at = (amplitude: number) =>
      measure(tuned(DIODE, 48000, 1000, 0.5, 1), 200, 48000, { amplitude })
        .amplitude;
    const small = at(1e-3);
    // A 0.5-amplitude sine, which used to sit at a constant 0.265 whatever
    // went in. Within 1 dB of the small-signal gain is the assertion that its
    // fundamental tracks the input.
    expect(20 * Math.log10(at(0.5) / small)).toBeGreaterThan(-1);
  });

  it("DIODE_LADDER at drive 100 is the fuzzbox it used to be", () => {
    // Not nostalgia: it is the check that `drive` reaches the saturator rather
    // than being an output gain in front of it. Above 0.01 in, the output
    // fundamental stops moving.
    const out = [0.01, 0.1, 0.5, 1.0].map(
      (amplitude) =>
        amplitude *
        measure(tuned(DIODE, 48000, 1000, 0.5, 100), 200, 48000, { amplitude })
          .amplitude,
    );
    expect(Math.max(...out.slice(1)) / Math.min(...out.slice(1))).toBeLessThan(
      1.02,
    );
    expect(out[0]).toBeLessThan(out[1]);
  });

  for (const name of ["MOOG_LADDER", "MOOG_HALF_LADDER", "KORG35_LPF"]) {
    it(`${name} is exactly drive times its unity output`, () => {
      // These three contain no clipper and no tanh by the library's design, so
      // `drive` can only be input gain here. Ticket 07 is what gives the two
      // ladders something to drive into.
      const model = ALL.find((m) => m.name === name)!;
      const unity = measure(
        tuned(model, 48000, 1000, 0.5, 1),
        200,
        48000,
      ).amplitude;
      for (const drive of [0.5, 2, 10]) {
        const driven = measure(
          tuned(model, 48000, 1000, 0.5, drive),
          200,
          48000,
        ).amplitude;
        expect(driven / unity).toBeCloseTo(drive, 3);
      }
    });
  }
});

describe("self-oscillation", () => {
  // The feature this package exists for and did not have. A linear ladder has
  // one loop gain for every amplitude, so it can only decay, hold, or diverge;
  // `resonance: 1.0` landed on k = 4.0 exactly, the analytic threshold, and it
  // *held* - a marginally stable resonator ringing at whatever the last
  // impulse left it with, one rounding error either side of silence and
  // divergence. A saturating feedback path makes the loop gain fall as the
  // amplitude grows, so the oscillation settles at an amplitude of its own.
  const settled = (
    model: Model,
    frequency: number,
    resonance: number,
    sampleRate = 48000,
  ) => {
    const filter = tuned(model, sampleRate, frequency, resonance);
    const length = 800 * 128;
    const input = new Float32Array(length);
    const output = new Float32Array(length);
    input[0] = 1e-3; // one tick, to leave silence
    render(filter, input, output, 128);
    return output;
  };

  const peak = (output: Float32Array, from: number, to: number) => {
    let worst = 0;
    for (let n = from; n < to; n++)
      worst = Math.max(worst, Math.abs(output[n]));
    return worst;
  };

  for (const name of SCREAMS) {
    const model = ALL.find((m) => m.name === name)!;

    it(`${name} settles at a stable non-zero amplitude at maximum resonance`, () => {
      const output = settled(model, 1000, 1.0);
      const middle = peak(output, 600 * 128, 700 * 128);
      const late = peak(output, 700 * 128, output.length);
      expect(late).toBeGreaterThan(0.1);
      expect(late).toBeLessThan(2);
      expect(late / middle).toBeGreaterThan(0.98);
      expect(late / middle).toBeLessThan(1.02);
    });

    it(`${name} is silent below the threshold`, () => {
      // Below `SELF_OSCILLATION_RESONANCE` the filter is the linear one it
      // always was, and one tick of input decays to nothing. This is the half
      // of the claim that stops "it oscillates" meaning "it never stops".
      const output = settled(model, 1000, SELF_OSCILLATION_RESONANCE - 0.05);
      expect(peak(output, 700 * 128, output.length)).toBeLessThan(1e-9);
    });

    it(`${name} oscillates at a frequency that tracks the cutoff`, () => {
      // Counted from zero crossings of the settled tail, which needs no
      // reference response and no assumption about the waveform.
      for (const request of [200, 1000, 4000]) {
        const output = settled(model, request, 1.0);
        const from = 700 * 128;
        let crossings = 0;
        for (let n = from + 1; n < output.length; n++) {
          if (output[n - 1] < 0 && output[n] >= 0) crossings++;
        }
        const measured = (crossings * 48000) / (output.length - from);
        // The same band the corner group states for this model, for the same
        // reason: a resonant peak sits where the topology puts it, not where
        // the request does.
        expect(measured / request).toBeGreaterThan(0.7);
        expect(measured / request).toBeLessThan(1.4);
      }
    });
  }

  for (const model of ALL.filter((m) => !SCREAMS.includes(m.name))) {
    it(`${model.name} does not`, () => {
      // The scope of ticket 07, asserted: the Korg 35 stays linear by
      // decision, and the diode ladder and the Oberheim have a saturator in a
      // different place that does not put them over their own threshold.
      const output = settled(model, 1000, 1.0);
      expect(peak(output, 700 * 128, output.length)).toBeLessThan(
        peak(output, 0, 100 * 128) * 1.05,
      );
    });
  }
});

describe("bounded at maximum resonance", () => {
  // Written before the nonlinearity rather than after it, because the natural
  // way for a self-oscillating filter to fail is to sound right at one setting
  // and diverge at another, and this is the group that catches that.
  //
  // "Bounded" here is an absolute claim, not a relative one: a self-oscillating
  // ladder is *supposed* to grow, so `late < early` cannot be asked of it. What
  // can be asked of every model is that no sample leaves a stated range, and of
  // the two ladders that the amplitude *settles* - which is what separates a
  // note from a divergence and from a decay.
  const BOUND = 4;

  for (const model of ALL) {
    it(`${model.name}`, () => {
      const filter = tuned(model, 48000, 1000, 1.0);
      const length = 400 * 128;
      const input = new Float32Array(length);
      const output = new Float32Array(length);
      input[0] = 1e-3;
      render(filter, input, output, 128);

      const peak = (from: number, to: number) => {
        let worst = 0;
        for (let n = from; n < to; n++) {
          expect(Number.isFinite(output[n])).toBe(true);
          worst = Math.max(worst, Math.abs(output[n]));
        }
        return worst;
      };

      const early = peak(0, 50 * 128);
      const middle = peak(300 * 128, 350 * 128);
      const late = peak(350 * 128, length);
      expect(Math.max(early, late)).toBeLessThan(BOUND);

      if (SCREAMS.includes(model.name)) {
        // Settled: the last 50 blocks agree with the 50 before them. A
        // divergence fails this, and so does a decay.
        expect(late).toBeGreaterThan(1e-4);
        expect(late / middle).toBeGreaterThan(0.95);
        expect(late / middle).toBeLessThan(1.05);
      } else {
        expect(late).toBeLessThan(early * 1.05);
      }
    });
  }

  it.each(ALL.map((m) => m.name))(
    "%s stays bounded under a full-range sweep with a full-scale input",
    (name) => {
      // Maximum resonance, a full-scale input, and a cutoff moving every
      // sample across the whole declared range - the combination that a filter
      // tuned by ear at one setting will not have been tried at. Rendered a
      // sample at a time, which is what the worklet's segment renderer does on
      // a genuine a-rate sweep.
      const model = ALL.find((m) => m.name === name)!;
      const filter = model.make(48000);
      const length = 200 * 128;
      const input = new Float32Array(128);
      const output = new Float32Array(128);

      // A deterministic full-scale noise, so the bound below is a fact about
      // the filter rather than about this run's random numbers.
      let seed = 0x9e3779b9;
      const noise = () => {
        seed = (seed * 1664525 + 1013904223) >>> 0;
        return seed / 2147483648 - 1;
      };

      for (let block = 0; block < length / 128; block++) {
        for (let n = 0; n < 128; n++) input[n] = noise();
        for (let n = 0; n < 128; n++) {
          // Two octaves per block, wrapping: fast enough that the operating
          // point never settles.
          const phase = ((block * 128 + n) / 997) % 1;
          filter.update(20 + 19980 * phase, 1.0, 1);
          filter.process(input, output, n, n + 1);
        }
        for (const sample of output) {
          expect(Number.isFinite(sample)).toBe(true);
          // Deliberately loose: this asserts against divergence, not against
          // loudness. A full-scale white noise at maximum resonance already
          // carries 5x of makeup gain and 20-odd dB of resonant peak, so a
          // peak in the hundreds is legitimate here and 1e21 - which is what
          // an unbounded prewarp gave - is not.
          expect(Math.abs(sample)).toBeLessThan(1e3);
        }
      }
    },
  );
});
