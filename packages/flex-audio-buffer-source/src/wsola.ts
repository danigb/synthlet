import type { EngineConfig, TimeStretchEngine } from "./engine";

/** A source reader: one mono sample, or 0 outside the region being played. */
export type ReadMono = (position: number) => number;

/**
 * Everything the similarity search needs besides the signals themselves: the
 * geometry, and the two scratch buffers it decimates into. Built once by
 * `configure` so the search allocates nothing.
 */
export type SearchScratch = {
  frame: number;
  toleranceMax: number;
  decimation: number;
  smallTemplate: Float32Array;
  smallRegion: Float32Array;
  coarseScores: Float32Array;
  fineScores: Float32Array;
};

const ENERGY_FLOOR = 1e-12;

/**
 * Shifts scoring within this fraction of the best are treated as equally good,
 * and the one closest to the ideal analysis position wins. See deviation 5.
 */
const TIE_TOLERANCE = 0.01;

/**
 * Of `count` scored candidates, the one closest to a zero shift among those
 * within `TIE_TOLERANCE` of the best score.
 *
 * `toShift(i)` maps a candidate index to the shift it represents.
 */
function leastShiftNearBest(
  scores: Float32Array,
  count: number,
  toShift: (index: number) => number,
) {
  let best = -Infinity;
  for (let i = 0; i < count; i++) if (scores[i] > best) best = scores[i];

  // Works for a negative best too: the threshold moves down, not up.
  const threshold = best - TIE_TOLERANCE * Math.abs(best);
  let chosen = 0;
  let chosenShift = Infinity;
  for (let i = 0; i < count; i++) {
    if (scores[i] < threshold) continue;
    const shift = Math.abs(toShift(i));
    if (shift < chosenShift) {
      chosenShift = shift;
      chosen = i;
    }
  }
  return toShift(chosen);
}

/**
 * Normalised cross-correlation of `template` against the frame at `at`.
 *
 * This is eq. 9 divided by the candidate's L2 norm - see deviation 1 in the
 * file header. Exported because the tests compare it against the oracle's
 * independently written version.
 */
export function normalisedCorrelation(
  read: ReadMono,
  template: Float32Array,
  frame: number,
  at: number,
) {
  let dot = 0;
  let energy = 0;
  for (let n = 0; n < frame; n++) {
    const value = read(at + n);
    dot += template[n] * value;
    energy += value * value;
  }
  return energy > ENERGY_FLOOR ? dot / Math.sqrt(energy) : 0;
}

/**
 * Step 2: the shift in [−Δmax, Δmax] whose frame best matches the template.
 *
 * Coarse pass on the decimated signals, then a full-rate refinement within ±D
 * of the coarse winner - the span the decimation could have blurred. See
 * deviation 4 in the file header: this is derived, and `wsola-oracle.ts` is
 * what defines whether it is right.
 *
 * Exported so the tests can drive it directly rather than inferring its
 * choices from rendered audio.
 */
export function findBestShift(
  read: ReadMono,
  template: Float32Array,
  base: number,
  scratch: SearchScratch,
) {
  const {
    frame,
    toleranceMax,
    decimation,
    smallTemplate,
    smallRegion,
    coarseScores,
    fineScores,
  } = scratch;
  if (toleranceMax === 0) return 0;

  // Box-filter and decimate both signals. The box filter matters: decimating
  // by picking every Dth sample would alias the correlation and send the
  // coarse pass to the wrong neighbourhood.
  const templateSteps = Math.ceil(frame / decimation);
  for (let j = 0; j < templateSteps; j++) {
    let sum = 0;
    for (let k = 0; k < decimation; k++) {
      const n = j * decimation + k;
      sum += n < frame ? template[n] : 0;
    }
    smallTemplate[j] = sum / decimation;
  }

  const regionSteps = Math.ceil((frame + 2 * toleranceMax) / decimation);
  for (let j = 0; j < regionSteps; j++) {
    let sum = 0;
    const from = base - toleranceMax + j * decimation;
    for (let k = 0; k < decimation; k++) sum += read(from + k);
    smallRegion[j] = sum / decimation;
  }

  const maxShift = Math.min(
    regionSteps - templateSteps,
    Math.floor((2 * toleranceMax) / decimation),
  );

  for (let s = 0; s <= maxShift; s++) {
    let dot = 0;
    let energy = 0;
    for (let j = 0; j < templateSteps; j++) {
      const value = smallRegion[s + j];
      dot += smallTemplate[j] * value;
      energy += value * value;
    }
    coarseScores[s] = energy > ENERGY_FLOOR ? dot / Math.sqrt(energy) : 0;
  }

  const coarse = leastShiftNearBest(
    coarseScores,
    maxShift + 1,
    (s) => s * decimation - toleranceMax,
  );

  const from = Math.max(-toleranceMax, coarse - decimation);
  const to = Math.min(toleranceMax, coarse + decimation);
  const count = to - from + 1;
  for (let i = 0; i < count; i++) {
    fineScores[i] = normalisedCorrelation(
      read,
      template,
      frame,
      base + from + i,
    );
  }
  return leastShiftNearBest(fineScores, count, (i) => from + i);
}

/**
 * WSOLA - waveform similarity overlap-add time-scaling.
 *
 * Re-derived from published algorithm descriptions:
 *
 * - J. Driedger and M. Müller, *A Review of Time-Scale Modification of Music
 *   Signals*, Applied Sciences 6(2):57, 2016, §4.1 - the statement this file
 *   implements. Equations 6-11 are cited by number at each step below.
 * - W. Verhelst and M. Roelands, *An Overlap-Add Technique Based on Waveform
 *   Similarity (WSOLA) for High Quality Time-Scale Modification of Speech*,
 *   Proc. ICASSP-93, pp. 554-557 - the origin of the algorithm.
 * - M. Roelands and W. Verhelst, *Waveform Similarity Based Overlap-Add (WSOLA)
 *   for Time-Scale Modification of Speech: Structures and Evaluation*,
 *   Proc. EUROSPEECH'93.
 *
 * No code from any third-party time-stretch implementation is present. This is
 * re-derivation with the chain recorded, *not* clean-room - see the note in
 * THIRD-PARTY-LICENSES.md, which says the same thing about the limiter and for
 * the same reason.
 *
 * The loop, per synthesis frame m (eq. numbers are Driedger & Müller's):
 *
 *   1  template:  read the natural progression x̃ₘ at pₘ + Hs           (eq. 7)
 *   2  search:    Δₘ₊₁ = argmax over Δ of similarity(x̃ₘ, x⁺ₘ₊₁, Δ)  (eqs. 8-10)
 *   3  overlap:   window the frame at (m+1)Ha + Δₘ₊₁, add at Hs        (eq. 11)
 *
 * with Ha = Hs × rate, so rate 0.5 advances the analysis half as fast as the
 * synthesis and the output comes out twice as long.
 *
 * FIVE THINGS THIS FILE DOES THAT THE SOURCES DO NOT
 *
 * 1. **Normalised cross-correlation, not eq. 9.** The paper's similarity
 *    measure is a plain cross-correlation, which is biased towards
 *    high-energy candidates: across a ±7.5 ms search window that spans an
 *    amplitude change, the argmax drifts to the loud end rather than the
 *    aligned one. Dividing by the candidate's L2 norm removes the bias. (The
 *    template's norm is constant across Δ, so it cannot affect the argmax and
 *    is not computed.) `wsola-oracle.ts` implements both measures so the tests
 *    can show the difference rather than assert it.
 *
 * 2. **Normalisation by the running window sum, not the COLA constant.**
 *    Eq. 11 divides the overlap-add by Σₙ w(r − nHs), which for a Hann window
 *    at 50% overlap is the constant 1. At the head of the signal only one
 *    frame covers the first N/2 samples, so dividing by that constant fades
 *    the onset in over half a frame - which is audible, and is the ticket's
 *    "no lookahead-latency hole" criterion failing quietly. Accumulating the
 *    actual window sum per output sample and dividing by *that* gives
 *    w(r)x(r)/w(r) = x(r) exactly at the edges, and makes `overlap` values
 *    that do not satisfy COLA correct rather than merely close.
 *
 * 3. **A rise-free first window.** The window sum alone is not enough at
 *    sample 0, where a Hann window is 0 and the normalisation would be 0/0.
 *    The first frame of a playback is therefore windowed by 1 over its first
 *    half and by the Hann taper over its second, so it overlap-adds with frame
 *    1 exactly as a full Hann would while leaving the onset untouched. This is
 *    what makes output sample 0 the clip's true first sample.
 *
 * 4. **A coarse-to-fine decimated similarity search.** The search runs on a
 *    box-filtered, D-times-decimated copy of both signals and is then refined
 *    at full rate within ±D of the coarse peak, which costs about D² less than
 *    searching at full rate. This is an ordinary multi-rate optimisation,
 *    derived here rather than taken: no source was used for it, and the
 *    patents in this area were deliberately not read. What makes it correct is
 *    `wsola-oracle.ts` - an independent brute-force full-rate search - not
 *    anyone else's implementation.
 *
 *    Its limit is worth stating plainly, because it is a real one. The search
 *    can only align structure it can still see after decimation: at the
 *    default 12 kHz `searchRate` that is content below 6 kHz. On broadband
 *    noise it therefore does *not* find the full-rate optimum - measured at
 *    about 0.44 of the exhaustive score - while at `searchRate = sampleRate`
 *    it reduces to the exhaustive search exactly. Both legs are asserted in
 *    `wsola.test.ts`. This is the right trade because the shift being missed
 *    on noise is a chance correlation of noise with itself at an arbitrary
 *    lag, not a structural alignment: white noise has no periodicity for
 *    WSOLA to preserve, and the periodicity of real material lives well below
 *    6 kHz. `searchRate` is the knob if a caller disagrees.
 *
 * 5. **Ties in the similarity search are broken towards the smallest shift.**
 *    Nothing in the sources says which shift to take when several score alike,
 *    and for periodic material several always do - the correlation surface of
 *    a 440 Hz tone has near-equal peaks every 100 samples, right across the
 *    ±331-sample tolerance window. Decimation flattens those peaks further
 *    (0.2% apart at a 12 kHz search rate), so a plain argmax picks essentially
 *    at random among them, and at rate 1 that alone costs about 40 dB of
 *    transparency: the engine wanders to a shift of +301 when +0 is exact.
 *    Since Δ is a *deviation* from the ideal analysis position, two shifts
 *    that align the waveform equally well are not equally good - the smaller
 *    one keeps playback where the rate says it should be and does not
 *    accumulate drift. Candidates within 1% of the best score are therefore
 *    treated as tied, and the one nearest zero wins. This is what makes rate 1
 *    transparent, and it is applied to the coarse and fine passes alike.
 *
 * Two conventions differ from the paper's notation without changing the maths:
 * frames are addressed from their left edge rather than their centre (r from 0
 * to N−1 instead of −N/2 to N/2−1), and reads outside the source region return
 * zero. The zero-padding is what makes the tail come out right: past the last
 * sample the numerator is 0 while the window sum is not, so the output is
 * silence rather than a fade.
 */
export function createWsolaEngine(): TimeStretchEngine {
  // Geometry, all set by configure().
  let channels = 0;
  let frame = 0; // N
  let synthesisHop = 0; // Hs
  let toleranceMax = 0; // Δmax
  let decimation = 1; // D

  // Buffers, all allocated by configure().
  let window = new Float32Array(0);
  let firstWindow = new Float32Array(0);
  let accumulator: Float32Array[] = [];
  let windowSum = new Float32Array(0);
  let monoTemplate = new Float32Array(0);
  let smallTemplate = new Float32Array(0);
  let smallRegion = new Float32Array(0);
  let capacity = 0;

  // Playback state, all set by reset().
  let source: Float32Array[] = [];
  let start = 0;
  let end = 0;
  let rate = 1;
  let idealPos = 0; // mHa, fractional: Ha need not be an integer
  let adjustedPos = 0; // pₘ = mHa + Δₘ
  let framesAdded = 0;
  let writePos = 0; // output position of the next synthesis frame
  let readPos = 0; // output position of the next sample to emit
  let exhausted = false;
  let tailEnd = 0; // output position past which everything is silence

  const WINDOW_SUM_FLOOR = 1e-9;
  let scratch: SearchScratch;

  /** One source sample, mixed to mono, or 0 outside the region. */
  function readMono(position: number) {
    if (position < start || position >= end) return 0;
    let sum = 0;
    for (let c = 0; c < channels; c++) sum += source[c][position];
    return sum / channels;
  }

  /** Steps 1-3 for one synthesis frame. */
  function addFrame() {
    if (framesAdded === 0) {
      adjustedPos = Math.round(idealPos);
    } else {
      // Step 1 (eq. 7): the natural progression of the previous frame is what
      // would have followed it had nothing been time-scaled, so it is what the
      // next frame has to look like for the overlap to be seamless.
      const templatePos = adjustedPos + synthesisHop;
      for (let n = 0; n < frame; n++) {
        monoTemplate[n] = readMono(templatePos + n);
      }
      // Step 2 (eqs. 8-10).
      const base = Math.round(idealPos);
      adjustedPos = base + findBestShift(readMono, monoTemplate, base, scratch);
    }

    // Step 3 (eq. 11), with the window sum accumulated rather than assumed.
    const shape = framesAdded === 0 ? firstWindow : window;
    for (let c = 0; c < channels; c++) {
      const channel = source[c];
      const target = accumulator[c];
      for (let n = 0; n < frame; n++) {
        const position = adjustedPos + n;
        if (position < start || position >= end) continue;
        target[(writePos + n) % capacity] += shape[n] * channel[position];
      }
    }
    for (let n = 0; n < frame; n++) {
      windowSum[(writePos + n) % capacity] += shape[n];
    }

    writePos += synthesisHop;
    idealPos += synthesisHop * rate;
    framesAdded++;

    if (Math.round(idealPos) >= end) {
      exhausted = true;
      // Everything the last frame could reach; past it the output is silence.
      tailEnd = writePos - synthesisHop + frame;
    }
  }

  return {
    configure(config: EngineConfig) {
      channels = Math.max(1, config.channels);
      // Even, so a 50% overlap lands on an exact integer hop.
      frame = Math.max(
        4,
        Math.round((config.frameMs * config.sampleRate) / 1000),
      );
      if (frame % 2 !== 0) frame += 1;
      synthesisHop = Math.max(1, Math.round(frame * (1 - config.overlap)));
      toleranceMax = Math.max(0, Math.round(config.tolerance * frame));
      decimation = Math.max(
        1,
        Math.round(config.sampleRate / Math.max(1, config.searchRate)),
      );

      window = new Float32Array(frame);
      firstWindow = new Float32Array(frame);
      for (let n = 0; n < frame; n++) {
        // Periodic Hann: w[n] + w[n + N/2] = 1, so a 50% overlap sums to unity
        // and the running window sum stays at 1 through the steady state.
        const value = 0.5 * (1 - Math.cos((2 * Math.PI * n) / frame));
        window[n] = value;
        firstWindow[n] = n < frame / 2 ? 1 : value;
      }

      // The live span is [readPos, readPos + N); the hop is margin.
      capacity = frame + synthesisHop;
      accumulator = [];
      for (let c = 0; c < channels; c++) {
        accumulator.push(new Float32Array(capacity));
      }
      windowSum = new Float32Array(capacity);

      monoTemplate = new Float32Array(frame);
      smallTemplate = new Float32Array(Math.ceil(frame / decimation) + 1);
      smallRegion = new Float32Array(
        Math.ceil((frame + 2 * toleranceMax) / decimation) + 1,
      );
      scratch = {
        frame,
        toleranceMax,
        decimation,
        smallTemplate,
        smallRegion,
        coarseScores: new Float32Array(
          Math.floor((2 * toleranceMax) / decimation) + 2,
        ),
        fineScores: new Float32Array(2 * decimation + 2),
      };
    },

    setRate(value: number) {
      rate = value;
    },

    reset(buffer: Float32Array[], from: number, to: number) {
      source = buffer;
      start = from;
      end = to;
      idealPos = from;
      adjustedPos = from;
      framesAdded = 0;
      writePos = 0;
      readPos = 0;
      exhausted = false;
      tailEnd = 0;
      for (let c = 0; c < channels; c++) accumulator[c]?.fill(0);
      windowSum.fill(0);
    },

    process(outputs: Float32Array[], offset: number, count: number) {
      const entry = readPos;
      for (let i = 0; i < count; i++) {
        // Output sample `readPos` is complete once every frame that can reach
        // it has been added - the last of those is frame floor(readPos / Hs).
        while (!exhausted && framesAdded * synthesisHop <= readPos) addFrame();

        const slot = readPos % capacity;
        const sum = windowSum[slot];
        for (let c = 0; c < outputs.length; c++) {
          const value =
            sum > WINDOW_SUM_FLOOR
              ? accumulator[Math.min(c, channels - 1)][slot] / sum
              : 0;
          outputs[c][offset + i] = value;
        }
        for (let c = 0; c < channels; c++) accumulator[c][slot] = 0;
        windowSum[slot] = 0;
        readPos++;
      }

      if (!exhausted) return count;
      return Math.max(0, Math.min(count, tailEnd - entry));
    },

    done() {
      return exhausted && readPos >= tailEnd;
    },
  };
}
