import {
  BUILT_IN_SHAPES,
  buildPlane,
  buildWavetable,
  builtInHarmonics,
  canonicalPhase,
  DEFAULT_WAVETABLE_LENGTH,
  defaultWavetable,
  normalizePeak,
  shapeHarmonics,
} from "./wavetable-builder";

/**
 * What the builder promises, as numbers.
 *
 * The load-bearing one is "the crossfade is a spectral interpolation": Serra,
 * Rubine & Dannenberg JAES 1990 Eq. 7 holds only while corresponding harmonics
 * across planes share a phase, and this file is what makes that a fact about the
 * package rather than an intention. Every other assertion here is a consequence
 * of the same construction rule.
 *
 * The instrument is a direct DFT over exactly one period rather than
 * `_spectrum.ts`'s windowed FFT. A plane *is* one period, so the DFT is exact to
 * float precision — a single harmonic reads 1.00000000 with 6.6e-9 in every
 * other bin — and a window would smear a 1 % budget into an argument about
 * sidelobes.
 */

const LEN = DEFAULT_WAVETABLE_LENGTH;

/**
 * Exact per-harmonic magnitudes of one period. `out[h]` is the amplitude of
 * harmonic `h`, in the same units as the amplitudes handed to `buildPlane`.
 */
function harmonicMagnitudes(
  plane: ArrayLike<number>,
  count = plane.length / 2,
) {
  const len = plane.length;
  const out = new Float64Array(count + 1);
  for (let h = 1; h <= count; h++) {
    let re = 0;
    let im = 0;
    for (let k = 0; k < len; k++) {
      const angle = (2 * Math.PI * h * k) / len;
      re += plane[k] * Math.cos(angle);
      im -= plane[k] * Math.sin(angle);
    }
    out[h] = (2 * Math.hypot(re, im)) / len;
  }
  return out;
}

/** The largest absolute difference between neighbours, seam excluded. */
function largestInteriorStep(plane: ArrayLike<number>) {
  let max = 0;
  for (let k = 0; k < plane.length - 1; k++) {
    max = Math.max(max, Math.abs(plane[k + 1] - plane[k]));
  }
  return max;
}

const plane = (shape: (typeof BUILT_IN_SHAPES)[number], len = LEN) =>
  buildPlane(shapeHarmonics(shape, len / 2), len);

// ---------------------------------------------------------------------------

describe("canonical phase", () => {
  it("is 0 on odd harmonics and pi on even ones", () => {
    // Serra et al. JAES §3.4.3. Ticket 07 aligns imported tables to this same
    // function, which is why it is exported rather than inlined as a sign.
    expect([1, 2, 3, 4, 5].map(canonicalPhase)).toEqual([
      0,
      Math.PI,
      0,
      Math.PI,
      0,
    ]);
  });

  it("puts every plane's first sample at exactly zero", () => {
    // Every harmonic is in sine phase, so `sin(0)` and `sin(0 + pi)` are both 0
    // whatever the spectrum. This is the exact form of Serra et al.'s "the
    // waveform... close to zero at the beginning and at the end of the table",
    // and unlike the derivative half it holds for every input, not only for the
    // smooth analysed spectra they were describing.
    for (const shape of BUILT_IN_SHAPES) expect(plane(shape)[0]).toBe(0);
    expect(buildPlane([1, 1, 1, 1, 1, 1, 1, 1], 32)[0]).toBe(0);
  });

  it("moves the sawtooth's discontinuity off the loop seam", () => {
    // The alternating half of the rule, measured. A `1/n` series with every
    // phase at 0 is `sum sin(2*pi*h*k/L)/h`, whose jump sits exactly on k = 0 -
    // the point the reader wraps through - so its seam is a full-scale step.
    // Alternating the sign moves the jump to the middle of the table.
    const canonical = plane("sawtooth");
    normalizePeak(canonical);

    const allSinePhase = new Float32Array(LEN);
    for (let h = 1; h <= LEN / 2; h++) {
      for (let k = 0; k < LEN; k++) {
        allSinePhase[k] += Math.sin((2 * Math.PI * h * k) / LEN) / h;
      }
    }
    normalizePeak(allSinePhase);

    const seam = (p: Float32Array) => Math.abs(p[0] - p[p.length - 1]);
    expect(seam(canonical)).toBeCloseTo(0.0067, 4);
    expect(seam(allSinePhase)).toBeCloseTo(1.0, 4);
  });

  it("loops without introducing a step the waveform does not already have", () => {
    // Success criterion 5, in the only form that is true of every spectrum. The
    // ticket asks for endpoints "within 0.02 of each other", which no rule can
    // deliver: a 256-sample sine steps 0.0245 per sample while being perfectly
    // continuous, and a square's discontinuity is intrinsic - it has no even
    // harmonics, so the alternating sign is a no-op on it and one of its two
    // jumps lands on the seam wherever the origin is put. What canonical phase
    // does guarantee is that the seam is an ordinary step for that waveform.
    for (const shape of BUILT_IN_SHAPES) {
      const p = plane(shape);
      normalizePeak(p);
      const seam = Math.abs(p[0] - p[LEN - 1]);
      expect(seam).toBeLessThanOrEqual(largestInteriorStep(p) + 1e-6);
    }
  });
});

describe("buildPlane", () => {
  it("puts a single harmonic in exactly one bin, at unit amplitude", () => {
    const magnitudes = harmonicMagnitudes(buildPlane([1], LEN));
    expect(Math.abs(magnitudes[1] - 1)).toBeLessThan(0.005);
    for (let h = 2; h < magnitudes.length; h++) {
      expect(magnitudes[h]).toBeLessThan(1e-6);
    }
  });

  it("places a harmonic where it was asked for", () => {
    const magnitudes = harmonicMagnitudes(
      buildPlane([0, 0, 0, 0, 0, 0.5], LEN),
    );
    expect(magnitudes[6]).toBeCloseTo(0.5, 6);
    expect(magnitudes[1]).toBeLessThan(1e-6);
  });

  it("keeps a 1/n spectrum falling as 1/n", () => {
    const harmonics = shapeHarmonics("sawtooth", LEN / 2);
    const magnitudes = harmonicMagnitudes(buildPlane(harmonics, LEN));
    for (let h = 1; h <= 32; h++) {
      const ratio = (magnitudes[h] * h) / magnitudes[1];
      expect(Math.abs(ratio - 1)).toBeLessThan(0.01);
    }
  });

  it("reads a negative amplitude as a magnitude", () => {
    // A sign is a phase, and phase is this module's guarantee rather than the
    // caller's: honouring it here is exactly what breaks Eq. 7 below.
    expect(Array.from(buildPlane([1, -0.5], 64))).toEqual(
      Array.from(buildPlane([1, 0.5], 64)),
    );
  });

  it("refuses more harmonics than the table can hold", () => {
    // Harmonic h > length/2 folds back inside the data itself, where nothing
    // downstream can reach it.
    expect(() => buildPlane(new Float32Array(129), 256)).toThrow(/at most 128/);
    expect(() => buildPlane(new Float32Array(128), 256)).not.toThrow();
  });

  it("refuses a length that is not a power of two, or below 2", () => {
    for (const length of [0, 1, 3, 100, 255, 2.5, NaN]) {
      expect(() => buildPlane([1], length)).toThrow(/power of two/);
    }
  });

  it("refuses a non-finite amplitude rather than poisoning the plane", () => {
    expect(() => buildPlane([1, NaN], 64)).toThrow(/Harmonic 2/);
    expect(() => buildPlane([Infinity], 64)).toThrow(/Harmonic 1/);
  });

  it("is silent for an empty or all-zero spectrum", () => {
    expect(Array.from(buildPlane([], 32)).every((v) => v === 0)).toBe(true);
    expect(normalizePeak(buildPlane([0, 0], 32))).toBe(0);
  });
});

describe("buildWavetable", () => {
  it("packs planes in the layout the reader indexes", () => {
    // `interpolateLinear2d` reads `buffer[plane * len + index]` and `set()`
    // counts planes as `data.length / len`, so the packing is not a choice.
    const spectra = [[1], [1, 0.5], [1, 0.5, 0.25]];
    const { data, length } = buildWavetable(spectra, 64);
    expect(length).toBe(64);
    expect(data.length).toBe(3 * 64);

    for (let p = 0; p < spectra.length; p++) {
      const expected = buildPlane(spectra[p], 64);
      normalizePeak(expected);
      expect(Array.from(data.subarray(p * 64, (p + 1) * 64))).toEqual(
        Array.from(expected),
      );
    }
  });

  it("normalizes every plane to peak 1", () => {
    const { data, length } = buildWavetable(builtInHarmonics(LEN), LEN);
    for (let p = 0; p * length < data.length; p++) {
      const peak = Math.max(
        ...Array.from(data.subarray(p * length, (p + 1) * length), Math.abs),
      );
      expect(peak).toBeCloseTo(1, 6);
    }
  });

  it("defaults to the same length as loadWavetable", () => {
    expect(buildWavetable([[1]]).length).toBe(256);
  });

  it("refuses a table with no planes", () => {
    // `set()` would compute `planes = 0` and `agen()` would zero-fill: a silent
    // oscillator, which is the bug this whole ticket closes.
    expect(() => buildWavetable([], 64)).toThrow(/at least one plane/);
  });
});

describe("the built-in table", () => {
  // THE CONSTRAINT THIS MODULE EXISTS FOR. Serra et al. JAES Eq. 7: a linear
  // crossfade of two waveforms equals a linear crossfade of their harmonic
  // magnitudes if and only if corresponding harmonics share a phase. When they
  // do not, the crossfade dips - the audit measured 0.924 at 45 degrees, 0.707
  // at 90, a null at 180 - and Serra et al. report the phase half is heard as a
  // frequency shift, which no level measurement would catch.
  //
  // The budget is the ticket's 1 %. The measured worst case over all three
  // adjacent pairs is 0.004 %, at harmonic 59 of sine -> triangle.
  it.each(
    BUILT_IN_SHAPES.slice(0, -1).map((shape, i) => [
      shape,
      BUILT_IN_SHAPES[i + 1],
    ]),
  )("crossfades %s -> %s by magnitude, not by luck", (left, right) => {
    const a = plane(left);
    const b = plane(right);
    normalizePeak(a);
    normalizePeak(b);

    const mid = Float32Array.from({ length: LEN }, (_, k) =>
      // morph = 0.5, which is where a phase disagreement is largest.
      Math.fround(0.5 * a[k] + 0.5 * b[k]),
    );

    const magnitudesA = harmonicMagnitudes(a);
    const magnitudesB = harmonicMagnitudes(b);
    const magnitudesMid = harmonicMagnitudes(mid);

    for (let h = 1; h < magnitudesMid.length; h++) {
      const expected = (magnitudesA[h] + magnitudesB[h]) / 2;
      // Below this the harmonic is not present in either plane and the ratio is
      // float noise over float noise.
      if (expected < 1e-4) continue;
      expect(Math.abs(magnitudesMid[h] - expected) / expected).toBeLessThan(
        0.01,
      );
    }
  });

  it("is four spectra: sine, triangle, sawtooth, square", () => {
    expect(BUILT_IN_SHAPES).toEqual(["sine", "triangle", "sawtooth", "square"]);
    const [sine, triangle, sawtooth, square] = builtInHarmonics(LEN);
    for (const spectrum of [sine, triangle, sawtooth, square]) {
      expect(spectrum.length).toBe(LEN / 2);
    }

    const at = (spectrum: Float32Array, h: number) => spectrum[h - 1];
    expect(Array.from(sine.subarray(0, 4))).toEqual([1, 0, 0, 0]);
    expect(at(triangle, 3)).toBeCloseTo(1 / 9, 6);
    expect(at(triangle, 4)).toBe(0);
    expect(at(sawtooth, 4)).toBeCloseTo(1 / 4, 6);
    expect(at(square, 3)).toBeCloseTo(1 / 3, 6);
    expect(at(square, 4)).toBe(0);

    // Three planes of rising brightness plus the odd-harmonic counterpart of the
    // sawtooth. Not a monotone series - a square carries *less* total
    // high-frequency energy than a sawtooth, having only half the harmonics -
    // but it is the set a musician expects a default wavetable to hold, and any
    // ordering is phase-compatible because the phase does not come from the
    // spectrum.
    const brightness = (spectrum: Float32Array) => {
      let weighted = 0;
      let total = 0;
      for (let i = 0; i < spectrum.length; i++) {
        weighted += (i + 1) * spectrum[i];
        total += spectrum[i];
      }
      return weighted / total;
    };
    expect(brightness(sine)).toBeLessThan(brightness(triangle));
    expect(brightness(triangle)).toBeLessThan(brightness(sawtooth));
  });

  it("is one shared, memoized table per length", () => {
    // `postCreate` runs per node, and the default size is 131072 sine
    // evaluations - a per-voice cost in a polyphonic patch if it were not
    // cached. `postMessage` structured-clones, so sharing is safe.
    expect(defaultWavetable()).toBe(defaultWavetable(256));
    expect(defaultWavetable(512)).not.toBe(defaultWavetable(256));
    expect(defaultWavetable().data.length).toBe(4 * 256);
    expect(defaultWavetable().length).toBe(256);
  });

  it("is not silent", () => {
    // Success criterion 1's precondition, at the level of the data.
    const { data } = defaultWavetable();
    expect(Math.max(...Array.from(data, Math.abs))).toBeCloseTo(1, 6);
  });

  it("is a truncation away from a mipmap level", () => {
    // Ticket 06 gets a band-limited level by evaluating the same rule over fewer
    // harmonics, with no FFT and no filter design. This is that property.
    const full = shapeHarmonics("sawtooth", 128);
    const truncated = shapeHarmonics("sawtooth", 16);
    expect(Array.from(truncated)).toEqual(Array.from(full.subarray(0, 16)));
  });
});
