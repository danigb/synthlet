/**
 * An independent WSOLA, used only by the tests.
 *
 * A copy of the engine's own search would agree with it by construction and
 * prove nothing. This is deliberately a different shape: it searches every
 * shift at full rate with no decimation and no refinement pass, it renders a
 * whole signal into a plain array instead of streaming through a ring buffer,
 * and it allocates whatever it likes. It is written to be obviously correct
 * rather than fast, and it is the definition of what the shipped engine's
 * derived optimisations have to match.
 *
 * It also implements *both* similarity measures - the plain cross-correlation
 * of Driedger & Müller eq. 9 and the normalised one the engine actually uses -
 * so the tests can demonstrate why the engine deviates instead of asserting it.
 *
 * Not imported by `index.ts`, so `tsup` never bundles it. The precedent for a
 * non-test helper living in `src/` is `packages/synthlet/src/test-utils.ts` and
 * `packages/lookahead-limiter/src/true-peak-oracle.ts`.
 */

export type Measure = "plain" | "normalised";

export type OracleGeometry = {
  frame: number;
  synthesisHop: number;
  toleranceMax: number;
};

/** Geometry from the same config the engine takes, computed independently. */
export function oracleGeometry(
  sampleRate: number,
  frameMs: number,
  overlap: number,
  tolerance: number,
): OracleGeometry {
  let frame = Math.max(4, Math.round((frameMs * sampleRate) / 1000));
  if (frame % 2 !== 0) frame += 1;
  return {
    frame,
    synthesisHop: Math.max(1, Math.round(frame * (1 - overlap))),
    toleranceMax: Math.max(0, Math.round(tolerance * frame)),
  };
}

/** Mono read with zero-padding outside [start, end). */
export function makeReader(
  source: Float32Array[],
  start: number,
  end: number,
): (position: number) => number {
  return (position: number) => {
    if (position < start || position >= end) return 0;
    let sum = 0;
    for (const channel of source) sum += channel[position];
    return sum / source.length;
  };
}

/** Similarity of `template` against the frame at `at`, either measure. */
export function oracleCorrelation(
  read: (position: number) => number,
  template: Float32Array,
  at: number,
  measure: Measure,
): number {
  const values: number[] = [];
  for (let n = 0; n < template.length; n++) values.push(read(at + n));

  let dot = 0;
  for (let n = 0; n < template.length; n++) dot += template[n] * values[n];
  if (measure === "plain") return dot;

  let energy = 0;
  for (const value of values) energy += value * value;
  return energy > 1e-12 ? dot / Math.sqrt(energy) : 0;
}

/** Exhaustive search: every shift, full rate, no shortcuts. */
export function oracleBestShift(
  read: (position: number) => number,
  template: Float32Array,
  base: number,
  toleranceMax: number,
  measure: Measure = "normalised",
): { delta: number; score: number } {
  let delta = 0;
  let score = -Infinity;
  for (let d = -toleranceMax; d <= toleranceMax; d++) {
    const candidate = oracleCorrelation(read, template, base + d, measure);
    if (candidate > score) {
      score = candidate;
      delta = d;
    }
  }
  return { delta, score };
}

/**
 * Render a whole time-scaled signal in one pass.
 *
 * Same three steps as the engine, arranged completely differently: one flat
 * output array per channel, one flat window-sum array, normalised at the end.
 */
export function oracleStretch(
  source: Float32Array[],
  geometry: OracleGeometry,
  rate: number,
  start: number,
  end: number,
  measure: Measure = "normalised",
): Float32Array[] {
  const { frame, synthesisHop, toleranceMax } = geometry;
  const read = makeReader(source, start, end);

  const span = Math.max(0, end - start);
  const length = Math.ceil(span / Math.max(rate, 1e-6)) + 2 * frame;
  const outputs = source.map(() => new Float32Array(length));
  const sums = new Float32Array(length);

  const hann = new Float32Array(frame);
  const first = new Float32Array(frame);
  for (let n = 0; n < frame; n++) {
    hann[n] = 0.5 * (1 - Math.cos((2 * Math.PI * n) / frame));
    first[n] = n < frame / 2 ? 1 : hann[n];
  }

  const template = new Float32Array(frame);
  let idealPos = start;
  let adjustedPos = start;
  let writePos = 0;
  let m = 0;
  let tailEnd = 0;

  while (Math.round(idealPos) < end && writePos + frame <= length) {
    if (m === 0) {
      adjustedPos = Math.round(idealPos);
    } else {
      const templatePos = adjustedPos + synthesisHop;
      for (let n = 0; n < frame; n++) template[n] = read(templatePos + n);
      const base = Math.round(idealPos);
      adjustedPos =
        base +
        oracleBestShift(read, template, base, toleranceMax, measure).delta;
    }

    const shape = m === 0 ? first : hann;
    for (let c = 0; c < source.length; c++) {
      for (let n = 0; n < frame; n++) {
        const position = adjustedPos + n;
        if (position < start || position >= end) continue;
        outputs[c][writePos + n] += shape[n] * source[c][position];
      }
    }
    for (let n = 0; n < frame; n++) sums[writePos + n] += shape[n];

    tailEnd = writePos + frame;
    writePos += synthesisHop;
    idealPos += synthesisHop * rate;
    m++;
  }

  for (let c = 0; c < outputs.length; c++) {
    for (let i = 0; i < length; i++) {
      outputs[c][i] = sums[i] > 1e-9 ? outputs[c][i] / sums[i] : 0;
    }
  }
  return outputs.map((channel) => channel.subarray(0, tailEnd));
}
