import {
  buildPlane,
  BUILT_IN_SHAPES,
  buildWavetable,
  DEFAULT_WAVETABLE_LENGTH,
  defaultWavetable,
} from "./wavetable-builder";
import {
  alignPhases,
  conditionWavetable,
  normalizeRms,
  removeDc,
} from "./wavetable-conditioner";
import type { Wavetable } from "./wavetable-loader";

/**
 * What conditioning promises, as numbers.
 *
 * The load-bearing test is "two planes 180° apart no longer null": that is the
 * failure Bristow-Johnson (AES 101, 1996) §1 names, that the audit priced at a
 * full null, and that the real wavedit catalogue exhibits — `SYNLP10` loses
 * 5.7 dB on an average crossfade and 11.1 dB on its worst, measured in
 * `thoughts/research/2026-09-05_wavedit-phase-alignment/`. Everything else here
 * is either a consequence of the same rewrite or a guard on the loudness step,
 * which is the one that is a product decision rather than a fact about the data.
 *
 * The instrument is `wavetable-builder.test.ts`'s: a direct DFT over exactly one
 * period, which is exact to float precision because a plane *is* one period, and
 * which needs no window and so no argument about sidelobes.
 */

const LEN = DEFAULT_WAVETABLE_LENGTH;

/** Exact magnitude and phase of every harmonic of one period. */
function spectrum(plane: ArrayLike<number>, count = plane.length / 2) {
  const len = plane.length;
  const magnitude = new Float64Array(count + 1);
  // Relative to sine phase, so 0 is `sin` and π is `-sin` — canonical phase's
  // own two values.
  const phase = new Float64Array(count + 1);
  for (let h = 1; h <= count; h++) {
    let re = 0;
    let im = 0;
    for (let k = 0; k < len; k++) {
      const angle = (2 * Math.PI * h * k) / len;
      re += plane[k] * Math.cos(angle);
      im += plane[k] * Math.sin(angle);
    }
    re = (2 * re) / len;
    im = (2 * im) / len;
    magnitude[h] = Math.hypot(re, im);
    phase[h] = Math.atan2(re, im);
  }
  return { magnitude, phase };
}

/** One plane from a magnitude series at an arbitrary per-harmonic phase. */
function buildAtPhase(
  harmonics: number[],
  phase: (h: number) => number,
  length = LEN,
) {
  const plane = new Float32Array(length);
  for (let i = 0; i < harmonics.length; i++) {
    const h = i + 1;
    const a = harmonics[i];
    if (a === 0) continue;
    const w = (2 * Math.PI * h) / length;
    const p = phase(h);
    for (let k = 0; k < length; k++) plane[k] += a * Math.sin(w * k + p);
  }
  return plane;
}

/** The planes of a table, as separate arrays. */
function planesOf({ data, length }: Wavetable) {
  const out: Float32Array[] = [];
  for (let at = 0; at + length <= data.length; at += length) {
    out.push(data.slice(at, at + length));
  }
  return out;
}

const table = (planes: Float32Array[]): Wavetable => {
  const length = planes[0].length;
  const data = new Float32Array(planes.length * length);
  planes.forEach((plane, p) => data.set(plane, p * length));
  return { data, length };
};

const mean = (plane: ArrayLike<number>) => {
  let sum = 0;
  for (let k = 0; k < plane.length; k++) sum += plane[k];
  return sum / plane.length;
};

const rms = (plane: ArrayLike<number>) => {
  let sum = 0;
  for (let k = 0; k < plane.length; k++) sum += plane[k] * plane[k];
  return Math.sqrt(sum / plane.length);
};

const peak = (plane: ArrayLike<number>) => {
  let max = 0;
  for (let k = 0; k < plane.length; k++)
    max = Math.max(max, Math.abs(plane[k]));
  return max;
};

/** A 50/50 crossfade, which is what the morph does at position 0.5. */
const crossfade = (a: ArrayLike<number>, b: ArrayLike<number>) =>
  Float64Array.from({ length: a.length }, (_, k) => 0.5 * a[k] + 0.5 * b[k]);

/** The level 0 planes of the built-in table, without its pyramid. */
function generatedBase(): Wavetable {
  const built = defaultWavetable(LEN);
  return {
    data: built.data.slice(0, BUILT_IN_SHAPES.length * LEN),
    length: LEN,
  };
}

/** Phase is circular: -π and +π are the same angle. */
const phaseError = (a: number, b: number) =>
  Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));

const dB = (ratio: number) => 20 * Math.log10(ratio);
const spreadDb = (planes: Float32Array[]) => {
  const levels = planes.map(rms).filter((r) => r > 0);
  return dB(Math.max(...levels) / Math.min(...levels));
};

// ---------------------------------------------------------------------------

describe("removeDc", () => {
  it("brings a plane's mean to zero and leaves its harmonics where they were", () => {
    const plane = buildPlane([1, 0.5, 0.25], LEN);
    const before = spectrum(plane, 8);
    for (let k = 0; k < LEN; k++) plane[k] += 0.37;

    expect(removeDc(plane)).toBeCloseTo(0.37, 6);
    expect(mean(plane)).toBeCloseTo(0, 7);

    // DC is the h = 0 bin and nothing else, so no harmonic moved.
    const after = spectrum(plane, 8);
    for (let h = 1; h <= 8; h++) {
      expect(after.magnitude[h]).toBeCloseTo(before.magnitude[h], 6);
      // A harmonic that is not there has no phase to compare.
      if (before.magnitude[h] < 1e-6) continue;
      expect(phaseError(after.phase[h], before.phase[h])).toBeLessThan(1e-6);
    }
  });

  it("leaves a plane that has no offset exactly alone", () => {
    const plane = buildPlane([1, 0.5], LEN);
    const before = Array.from(plane);
    expect(removeDc(plane)).toBe(0);
    expect(Array.from(plane)).toEqual(before);
  });
});

describe("alignPhases", () => {
  it("preserves every harmonic magnitude", () => {
    // Success criterion 2. Alignment is a phase rewrite and nothing else.
    const harmonics = [1, 0.8, 0.6, 0.4, 0.3, 0.2, 0.15, 0.1];
    const plane = buildAtPhase(harmonics, (h) => h * 0.937);
    const before = spectrum(plane, 16);

    alignPhases(plane);

    const after = spectrum(plane, 16);
    for (let h = 1; h <= harmonics.length; h++) {
      const error = Math.abs(after.magnitude[h] - before.magnitude[h]);
      expect(error / before.magnitude[h]).toBeLessThan(0.001);
    }
  });

  it("puts every harmonic at the canonical phase", () => {
    const plane = buildAtPhase([1, 0.8, 0.6, 0.4], (h) => h * 0.937);
    alignPhases(plane);

    // 0 on odd harmonics, π on even ones - `canonicalPhase`, measured.
    const { phase } = spectrum(plane, 4);
    expect(phaseError(phase[1], 0)).toBeLessThan(1e-5);
    expect(phaseError(phase[2], Math.PI)).toBeLessThan(1e-5);
    expect(phaseError(phase[3], 0)).toBeLessThan(1e-5);
    expect(phaseError(phase[4], Math.PI)).toBeLessThan(1e-5);
  });

  it("puts the plane's first sample at exactly zero", () => {
    // Every surviving term is in sine phase and `sin(0) === 0`, so this is the
    // invariant `buildPlane` has, now shared by imported planes: the loop seam
    // is quiet whatever arrived.
    const plane = buildAtPhase([1, 0.8, 0.6], (h) => 1.1 * h + 0.4);
    for (let k = 0; k < LEN; k++) plane[k] += 0.25;

    alignPhases(plane);
    expect(plane[0]).toBe(0);
  });

  it("removes DC on its own, because a constant has no sine-phase form", () => {
    const plane = buildAtPhase([1, 0.5], (h) => h);
    for (let k = 0; k < LEN; k++) plane[k] += 0.4;

    alignPhases(plane);
    expect(mean(plane)).toBeCloseTo(0, 7);
  });

  it("drops the Nyquist harmonic, which has none either", () => {
    // sin(2π·(L/2)·k/L) === sin(πk) === 0 at every integer k. A plane that is
    // nothing but the alternation is nothing after alignment - and no
    // interpolating reader could have reproduced it anyway.
    const plane = Float32Array.from({ length: LEN }, (_, k) =>
      k % 2 === 0 ? 1 : -1,
    );
    alignPhases(plane);
    expect(peak(plane)).toBeCloseTo(0, 6);
  });

  it("leaves a generated plane where it already is", () => {
    // The planes `buildPlane` makes are canonical by construction, so the
    // rewrite has nothing to do. Float32 in, float64 analysis, float32 out.
    const plane = buildPlane([1, 0.5, 0.25, 0.125], LEN);
    const before = Array.from(plane);
    alignPhases(plane);
    for (let k = 0; k < LEN; k++) {
      expect(Math.abs(plane[k] - before[k])).toBeLessThan(1e-6);
    }
  });
});

describe("the crossfade the alignment exists to protect", () => {
  it("rescues two planes 180 degrees apart from the null", () => {
    // **The regression this module exists to prevent.** The audit's table:
    // 0° costs nothing, 90° costs 3 dB, 180° is a null. Two planes of the same
    // spectrum in opposite phase cancel completely at morph = 0.5, and a level
    // meter is the only thing that notices.
    const harmonics = [1, 0.6, 0.35, 0.2];
    const a = buildAtPhase(harmonics, () => 0);
    const b = buildAtPhase(harmonics, () => Math.PI);

    expect(peak(crossfade(a, b))).toBeLessThan(1e-5);

    const [ca, cb] = planesOf(conditionWavetable(table([a, b])));
    const mixed = spectrum(crossfade(ca, cb), 8);
    const first = spectrum(ca, 8);
    const second = spectrum(cb, 8);
    for (let h = 1; h <= harmonics.length; h++) {
      const want = 0.5 * (first.magnitude[h] + second.magnitude[h]);
      expect(Math.abs(mixed.magnitude[h] - want) / want).toBeLessThan(0.01);
    }
  });

  it("makes a mismatched pair a spectral interpolation, JAES Eq. 7", () => {
    // Two planes with different spectra *and* different phase conventions:
    // after conditioning, the crossfade's magnitude at morph = 0.5 is the mean
    // of the two planes' magnitudes, to within the ticket's 1 %.
    const a = buildAtPhase([1, 0.5, 0.25, 0.12, 0.06], (h) => 0.7 * h);
    const b = buildAtPhase([0.3, 0.9, 0.2, 0.6, 0.4], (h) => 2.3 * h + 1.1);

    const before = spectrum(crossfade(a, b), 8);
    const [ca, cb] = planesOf(conditionWavetable(table([a, b])));
    const after = spectrum(crossfade(ca, cb), 8);
    const first = spectrum(ca, 8);
    const second = spectrum(cb, 8);

    let worstBefore = 0;
    for (let h = 1; h <= 5; h++) {
      const raw = spectrum(a, 8).magnitude[h];
      const other = spectrum(b, 8).magnitude[h];
      const want = 0.5 * (raw + other);
      worstBefore = Math.max(
        worstBefore,
        Math.abs(before.magnitude[h] - want) / want,
      );

      const target = 0.5 * (first.magnitude[h] + second.magnitude[h]);
      expect(Math.abs(after.magnitude[h] - target) / target).toBeLessThan(0.01);
    }
    // The pair really was mismatched: without conditioning the same test fails
    // by a wide margin, which is what makes the assertion above mean something.
    expect(worstBefore).toBeGreaterThan(0.1);
  });
});

describe("normalizeRms", () => {
  it("brings 12 dB of spread to within 0.5 dB", () => {
    // Success criterion 3. A morph knob should change timbre and hold level.
    const gains = [1, 0.5, 0.25, 1 / Math.pow(10, 12 / 20)];
    const planes = gains.map((g) => {
      const plane = buildPlane([1, 0.5, 0.25], LEN);
      for (let k = 0; k < LEN; k++) plane[k] *= g;
      return plane;
    });
    expect(spreadDb(planes)).toBeCloseTo(12, 1);

    const { data, length } = table(planes);
    normalizeRms(data, length);
    expect(spreadDb(planesOf({ data, length }))).toBeLessThan(0.5);
  });

  it("keeps the whole table below full scale, with one shared trim", () => {
    // The quiet plane comes up to meet the loud one, which can push a peak past
    // 1; one trim for the table brings it back. Per-plane would undo the match.
    const sine = buildPlane([1], LEN);
    const saw = buildPlane(
      Array.from({ length: 32 }, (_, i) => 1 / (i + 1)),
      LEN,
    );
    for (let k = 0; k < LEN; k++) saw[k] /= peak(saw);

    const { data, length } = table([sine, saw]);
    const gains = normalizeRms(data, length);

    expect(peak(data)).toBeLessThanOrEqual(1);
    expect(peak(data)).toBeCloseTo(1, 5);
    expect(spreadDb(planesOf({ data, length }))).toBeLessThan(0.01);
    // Both gains moved: the match, then the shared trim.
    expect(gains[0]).toBeLessThan(1);
    expect(gains[1]).toBeGreaterThan(gains[0]);
  });

  it("leaves a silent plane silent", () => {
    // `303` is 42 planes of digital silence out of 64, and no gain makes
    // silence loud. Unity, and no NaN.
    const { data, length } = table([
      buildPlane([1], LEN),
      new Float32Array(LEN),
    ]);
    const gains = normalizeRms(data, length);

    expect(gains[1]).toBe(1);
    expect(peak(data.subarray(LEN))).toBe(0);
    for (const sample of data) expect(Number.isFinite(sample)).toBe(true);
  });

  it("caps a boost at 30 dB", () => {
    // Past the cap a plane is a deliberate gap, and matching it would amplify a
    // quantization floor rather than a sound. The worst real spread measured in
    // the catalogue is 28.89 dB, so the cap does not bind on any of them.
    const quiet = buildPlane([1], LEN);
    for (let k = 0; k < LEN; k++) quiet[k] *= 0.001; // 60 dB down

    const { data, length } = table([buildPlane([1], LEN), quiet]);
    const gains = normalizeRms(data, length);

    expect(gains[1]).toBeCloseTo(Math.pow(10, 30 / 20), 3);
  });

  it("takes an explicit target", () => {
    const { data, length } = table([buildPlane([1], LEN)]);
    normalizeRms(data, length, 0.25);
    expect(rms(data)).toBeCloseTo(0.25, 5);
  });

  it("returns unity for a table that is silence throughout", () => {
    const { data, length } = table([
      new Float32Array(LEN),
      new Float32Array(LEN),
    ]);
    expect(Array.from(normalizeRms(data, length))).toEqual([1, 1]);
  });
});

describe("conditionWavetable", () => {
  const messy = () =>
    table([
      buildAtPhase([1, 0.5, 0.3], (h) => 0.8 * h),
      buildAtPhase([0.2, 0.1, 0.05], (h) => 2.1 * h + 0.5),
    ]).data.map((x, i) => x + (i < LEN ? 0.3 : -0.15));

  const messyTable = (): Wavetable => ({ data: messy(), length: LEN });

  it("runs all three steps by default", () => {
    const conditioned = conditionWavetable(messyTable());
    const planes = planesOf(conditioned);

    for (const plane of planes) {
      expect(plane[0]).toBe(0);
      expect(mean(plane)).toBeCloseTo(0, 6);
    }
    expect(spreadDb(planes)).toBeLessThan(0.01);
    expect(peak(conditioned.data)).toBeLessThanOrEqual(1);
  });

  it("switches every step off independently", () => {
    const input = messyTable();

    const none = conditionWavetable(input, {
      removeDc: false,
      alignPhases: false,
      normalize: false,
    });
    expect(Array.from(none.data)).toEqual(Array.from(input.data));

    // DC only: the offsets are reported, the phases are not touched.
    const dcOnly = conditionWavetable(input, {
      alignPhases: false,
      normalize: false,
    });
    expect(dcOnly.offsets[0]).toBeCloseTo(0.3, 5);
    expect(dcOnly.offsets[1]).toBeCloseTo(-0.15, 5);
    expect(planesOf(dcOnly)[0][0]).not.toBe(0);
    expect(Array.from(dcOnly.gains)).toEqual([1, 1]);

    // Phase only: alignment removes the offset itself, so the mean is 0 while
    // nothing was reported as removed.
    const phaseOnly = conditionWavetable(input, {
      removeDc: false,
      normalize: false,
    });
    expect(Array.from(phaseOnly.offsets)).toEqual([0, 0]);
    expect(planesOf(phaseOnly)[0][0]).toBe(0);
    expect(mean(planesOf(phaseOnly)[0])).toBeCloseTo(0, 6);
    expect(spreadDb(planesOf(phaseOnly))).toBeGreaterThan(1);

    // Loudness only: the planes match in level and keep their own phases.
    const levelOnly = conditionWavetable(input, {
      removeDc: false,
      alignPhases: false,
    });
    expect(spreadDb(planesOf(levelOnly))).toBeLessThan(0.01);
    expect(levelOnly.gains[1]).toBeGreaterThan(1);
  });

  it("does not touch the table it was given", () => {
    const input = messyTable();
    const before = Array.from(input.data);
    conditionWavetable(input);
    expect(Array.from(input.data)).toEqual(before);
  });

  it("reports offsets and gains that undo the reversible steps", () => {
    // The phase rewrite is not reversible - that is why it has a switch - but
    // the two that are can be run backwards from what is returned.
    const input = messyTable();
    const out = conditionWavetable(input, { alignPhases: false });
    const planes = planesOf(out);

    for (let p = 0; p < planes.length; p++) {
      for (let k = 0; k < LEN; k++) {
        const restored = planes[p][k] / out.gains[p] + out.offsets[p];
        expect(Math.abs(restored - input.data[p * LEN + k])).toBeLessThan(1e-5);
      }
    }
  });

  it("refuses a table that already carries a pyramid", () => {
    // Conditioning after mipmapping would rewrite and re-gain every level
    // independently of the plane they were all resynthesised from.
    expect(() => conditionWavetable(buildWavetable([[1], [1, 0.5]]))).toThrow(
      /before building its mipmap pyramid/,
    );
  });

  it("returns a table it cannot split into planes unchanged", () => {
    const data = Float32Array.from([1, 2, 3]);
    const out = conditionWavetable({ data, length: 8 });
    expect(Array.from(out.data)).toEqual([1, 2, 3]);
    expect(out.levels).toBe(1);
  });
});

describe("a generated table", () => {
  it("is unchanged by the DC and phase steps, within 1e-6", () => {
    // Success criterion 4. Generated planes are canonical, DC-free and
    // peak-normalized by construction, so the two steps that are *facts about
    // the data* have nothing to do to them.
    const base = generatedBase();
    const out = conditionWavetable(base, { normalize: false });

    let worst = 0;
    for (let i = 0; i < base.data.length; i++) {
      worst = Math.max(worst, Math.abs(out.data[i] - base.data[i]));
    }
    expect(worst).toBeLessThan(1e-6);
    // Nothing to remove: every generated plane already has a zero mean, down to
    // the rounding of a 128-term sum.
    for (const offset of out.offsets)
      expect(Math.abs(offset)).toBeLessThan(1e-9);
  });

  it("is moved by the loudness step, by exactly its RMS spread", () => {
    // The one step that is *not* a no-op on a generated table, because peak and
    // RMS normalization cannot both hold: peak-1.0 planes with different crest
    // factors are matched in RMS only by changing their relative levels, which
    // is the entire content of the step.
    //
    // `normalizePeak` is the generated path's loudness rule and `normalizeRms`
    // is the imported path's; `setWavetable` picks by whether a pyramid is
    // present, so they never both run over the same table.
    const base = generatedBase();
    const planes = planesOf(base);

    // sine 0.7071, triangle 0.7123, sawtooth 0.4918, square 0.7842 at peak 1.
    expect(spreadDb(planes)).toBeCloseTo(4.05, 2);
    expect(rms(planes[0])).toBeCloseTo(0.7071, 4);
    expect(rms(planes[2])).toBeCloseTo(0.4918, 4);

    const out = conditionWavetable(base);
    expect(spreadDb(planesOf(out))).toBeLessThan(0.01);
    expect(peak(out.data)).toBeLessThanOrEqual(1);
  });

  it("keeps its crossfade a spectral interpolation either way", () => {
    // Whatever the loudness step does, the phase constraint the whole package
    // rests on is untouched: the built-in planes were already canonical.
    const conditioned = planesOf(conditionWavetable(generatedBase()));
    const spectra = conditioned.map((plane) => spectrum(plane, 32));

    for (let p = 0; p + 1 < conditioned.length; p++) {
      const mixed = spectrum(crossfade(conditioned[p], conditioned[p + 1]), 32);
      for (let h = 1; h <= 32; h++) {
        const want =
          0.5 * (spectra[p].magnitude[h] + spectra[p + 1].magnitude[h]);
        if (want < 1e-4) continue;
        expect(Math.abs(mixed.magnitude[h] - want) / want).toBeLessThan(0.01);
      }
    }
  });
});
