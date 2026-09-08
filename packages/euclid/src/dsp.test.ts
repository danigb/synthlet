import { createEuclid, euclid, GenerateFn } from "./dsp";
import { PARAMS } from "./params";

/**
 * The engine, driven directly.
 *
 * Runs in node with no `AudioWorkletProcessor` stub: `dsp.ts` imports nothing
 * from the worklet global scope. `worklet.test.ts` is where the stub lives.
 *
 * The first describe block is the generator held to the two results that define
 * a Euclidean rhythm - Morrill 2022's Lemma 2 ("exactly k notes") and Corollary
 * 2 ("gcd(k, N) occurrences of the minimal period") - plus a reference
 * Bjorklund built from a different construction entirely. Asserting the rhythm
 * rather than a pattern is what caught the float generator: it agreed with
 * Bjorklund up to rotation everywhere it was tested, and still produced 39
 * patterns inside the declared range that were not Euclidean rhythms.
 *
 * The second block is the net this module has never had: no setting inside the
 * declared range may produce a non-finite sample. Three separate paths used to,
 * all of them an out-of-range index feeding a multiply, and a `NaN` reaching a
 * destination silences that branch of the graph for the lifetime of the context
 * - so nothing throws, nothing warns, and the audio dies.
 */

/** One render quantum - the block size the processor is called with. */
const BLOCK = 128;

/** An unconnected a-rate parameter: one value, and it is 0. That is what
 * `reset` looks like in every test that is not about resetting. */
const NO_RESET = new Float32Array(1);

/** Samples per clock cycle in these tests: four blocks, so a block boundary is
 * never a step boundary by accident and a step can be entered halfway. */
const CYCLE = 4 * BLOCK;

/** The declared maximum of both `steps` and `beats`. Every sweep below runs to
 * it, because every value below it is reachable from a knob. */
const MAX = 100;

describe("euclid", () => {
  it("generates E(3, 8)", () => {
    // Three onsets over eight steps - the tresillo, and the one Euclidean
    // rhythm everybody can hum. `euclid` takes `steps` first.
    expect(euclid(8, 3)).toEqual([1, 0, 0, 1, 0, 0, 1, 0]);
  });

  it("has exactly `beats` onsets, at every declared setting", () => {
    // Morrill 2022, Lemma 2: "The Euclidean rhythm obtained from E(k, N)
    // contains exactly k notes." 5151 pairs.
    //
    // The float generator failed this for `beats: 0` at every `steps` - all 100
    // of them. It seeded its accumulator at -1, so step 0 always compared
    // unequal and always became an onset, and `E(0,8)` was [1,0,0,0,0,0,0,0].
    const wrong: string[] = [];
    for (let steps = 0; steps <= MAX; steps++)
      for (let beats = 0; beats <= steps; beats++) {
        const pattern = euclid(steps, beats);
        const onsets = pattern.reduce((a, b) => a + b, 0);
        if (pattern.length !== steps || onsets !== beats)
          wrong.push(`E(${beats},${steps}) -> ${onsets} of ${pattern.length}`);
      }
    expect(wrong).toEqual([]);
  });

  it("is silent at `beats: 0`", () => {
    // Lemma 2's own edge, and the one behaviour change here that is audible at
    // a small setting: zero beats is zero hits, not one on the downbeat.
    expect(euclid(8, 0)).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);

    // And through the engine, over eight steps of a running clock.
    const [generate, update] = createEuclid();
    update(8, 0, 0);
    const out = render(generate, ramp(), 8 * 4);
    expect(risingEdges(out)).toEqual([]);
    expect(out.every((v) => v === 0)).toBe(true);
  });

  it("repeats its minimal period gcd(beats, steps) times", () => {
    // Morrill 2022, Corollary 2: "Given a Euclidean rhythm R of length N which
    // contains k notes, gcd(k, N) is equal to the number of occurrences of the
    // minimal period of R."
    //
    // This is the assertion that catches float rounding directly, because a
    // pattern that is periodic by construction cannot survive an onset moving.
    // The float generator failed it at exactly 39 pairs in range.
    const wrong: string[] = [];
    for (let steps = 1; steps <= MAX; steps++)
      for (let beats = 1; beats <= steps; beats++) {
        const count = periodCount(euclid(steps, beats));
        if (count !== gcd(beats, steps))
          wrong.push(`E(${beats},${steps}) ${count} != ${gcd(beats, steps)}`);
      }
    expect(wrong).toEqual([]);
  });

  it("gives E(18,66) as six repetitions of an 11-pulse cell", () => {
    // Corollary 2's worked example, and the clearest of the 39. gcd(18,66) = 6,
    // so this is (4 4 3) six times. The float generator gave
    // 4 4 3 4 4 3 4 4 3 4 4 3 4 4 4 3 4 3 - four clean cells and then a pattern
    // with no repeating period at all.
    expect(intervals(euclid(66, 18))).toEqual([
      4, 4, 3, 4, 4, 3, 4, 4, 3, 4, 4, 3, 4, 4, 3, 4, 4, 3,
    ]);
  });

  it("is Bjorklund's rhythm, up to rotation", () => {
    // The property the morning audit established and this file must not lose.
    // `bjorklund` below is the recursive divide-with-remainder construction and
    // shares no line with `euclid`; the two agreeing is the strongest evidence
    // available that the module plays the rhythm it claims to.
    //
    // A necklace has no starting point, so rotation-equivalence is the right
    // relation - see `packages/euclid/README.md`. The exact tallies are pinned
    // rather than just `different: 0`, so a change that turned an identical
    // pair into a merely-rotated one cannot pass unnoticed.
    const tally = { identical: 0, rotation: 0, different: [] as string[] };
    for (let steps = 1; steps <= 32; steps++)
      for (let beats = 1; beats <= steps; beats++) {
        const ours = euclid(steps, beats);
        const theirs = bjorklund(steps, beats);
        if (same(ours, theirs)) tally.identical++;
        else if (isRotationOf(ours, theirs)) tally.rotation++;
        else tally.different.push(`E(${beats},${steps})`);
      }
    expect(tally).toEqual({ identical: 291, rotation: 237, different: [] });
  });

  it("leaves the named rhythms where they were", () => {
    // The headline patterns, pinned literally. None of them is in the affected
    // set - the smallest `steps` the float rounding ever reached is 44 - and
    // that is worth asserting rather than assuming, because ticket 04 builds a
    // named-rhythm table on exactly these values.
    const named: [number, number, string][] = [
      [3, 8, "10010010"], // tresillo
      [5, 8, "10101101"], // cinquillo
      [2, 5, "10010"],
      [4, 9, "100101010"],
      [5, 12, "100101001010"],
      [7, 12, "101010110101"],
      [5, 16, "1000100100100100"], // bossa
      [7, 16, "1001010100101010"], // samba
      [9, 16, "1010101011010101"],
      [11, 24, "100101010101001010101010"],
      [13, 24, "101010101010110101010101"],
      [4, 4, "1111"],
    ];
    for (const [beats, steps, expected] of named)
      expect(`E(${beats},${steps}) ${euclid(steps, beats).join("")}`).toBe(
        `E(${beats},${steps}) ${expected}`,
      );
  });

  it("fills every step when `beats` reaches or passes `steps`", () => {
    // `beats === steps` is Morrill's E(N, N), defined in the paper as all
    // notes. `beats > steps` is outside every published construction; "more
    // hits than places" is the reading taken, and it is what shipped.
    expect(euclid(8, 8)).toEqual([1, 1, 1, 1, 1, 1, 1, 1]);
    expect(euclid(8, 9)).toEqual([1, 1, 1, 1, 1, 1, 1, 1]);
    expect(euclid(8, 100)).toEqual([1, 1, 1, 1, 1, 1, 1, 1]);
  });

  it("has no steps at `steps: 0`", () => {
    expect(euclid(0, 0)).toEqual([]);
    expect(euclid(0, 3)).toEqual([]);
  });
});

describe("no way to emit NaN", () => {
  it("emits only finite samples, at every declared setting", () => {
    // The criterion the module has never had. `steps` x `beats` over the ends
    // and the middle of their range, times every interesting `rotation` and
    // `subdivision`: 768 settings, 200 blocks each.
    const VALUES = [0, 1, 2, 3, 8, 16, 99, 100];
    const ROTATIONS = [0, 1, 7, 100];
    const SUBDIVISIONS = [1, 4, 20];

    const broken: string[] = [];
    let checked = 0;
    for (const steps of VALUES)
      for (const beats of VALUES)
        for (const rotation of ROTATIONS)
          for (const subdivision of SUBDIVISIONS) {
            const [generate, update] = createEuclid();
            update(steps, beats, rotation);
            const out = render(generate, ramp(), 200, { subdivision });
            checked += out.length;
            if (!out.every(Number.isFinite))
              broken.push(
                `E(${beats},${steps}) rot ${rotation} /${subdivision}`,
              );
          }

    expect(broken).toEqual([]);
    // And it really did render: a sweep that renders nothing passes the above.
    expect(checked).toBe(8 * 8 * 4 * 3 * 200 * BLOCK);
  });

  it("emits only finite samples while being reset", () => {
    // The same sweep, smaller, with a reset gate firing once a block. `reset()`
    // aims at `pattern.length - 1`, which is -1 when there is no pattern.
    const resetting = new Float32Array(BLOCK);
    resetting.fill(1, 40, 80);

    for (const steps of [0, 1, 8, 100])
      for (const beats of [0, 1, 3, 100])
        for (const rotation of [0, 7]) {
          const [generate, update] = createEuclid();
          update(steps, beats, rotation);
          const out = render(generate, ramp(), 20, { reset: resetting });
          expect(out.every(Number.isFinite)).toBe(true);
        }
  });

  it("plays the tresillo on the declared defaults", () => {
    // `Euclid(ac, { clock })` - the README's own usage block, and nothing else
    // patched. It used to be `NaN` on every sample from block 0.
    //
    // Read out of PARAMS rather than written as 8 and 3, so this fails if the
    // defaults move rather than quietly asserting a rhythm nobody gets.
    const d = Object.fromEntries(
      PARAMS.map((p) => [p.name, p.defaultValue]),
    ) as Record<string, number>;

    const [generate, update] = createEuclid();
    update(d.steps, d.beats, d.rotation);
    const out = render(generate, ramp(), 8 * 4, {
      subdivision: d.subdivision,
      pulseWidth: d.pulseWidth,
    });

    // Steps 0, 3 and 6 of eight: E(3,8), the tresillo. One cycle per step at
    // `subdivision: 1`, so a step is CYCLE samples.
    expect(risingEdges(out)).toEqual([0, 3 * CYCLE, 6 * CYCLE]);
    expect(out.every(Number.isFinite)).toBe(true);
  });

  it("emits only finite samples when `steps` shrinks, at every offset", () => {
    // E(5,16) -> E(3,8) with `current` left pointing past the new end. The
    // offset matters and so does the position within the step: the first
    // version of this test switched on a step boundary, where the very next
    // sample is a wrap and `% pattern.length` clamps `current` for free, and
    // reported clean at all 16 offsets.
    for (let offset = 0; offset < 16; offset++)
      for (let within = 0; within < 4; within++) {
        const [generate, update] = createEuclid();
        const clock = ramp();
        update(16, 5, 0);
        render(generate, clock, offset * 4 + within);

        update(8, 3, 0);
        // The remainder of the step first - no wrap in it, so nothing reduces
        // `current` - then four whole steps.
        const out = render(generate, clock, 4 - within + 16);
        expect(out.every(Number.isFinite)).toBe(true);
      }
  });

  it("is silent, not NaN, after a reset with `steps: 0`", () => {
    const [generate, update, reset] = createEuclid();
    update(0, 0, 0);
    reset();
    expect(render(generate, ramp(), 8).every((v) => v === 0)).toBe(true);
  });

  it("outputs exactly zero at `steps: 0`", () => {
    // Not merely finite: the honest reading of "a pattern with no steps" is no
    // output. `steps: 0` is a declared minimum and stays reachable.
    const [generate, update] = createEuclid();
    update(0, 0, 0);
    expect(render(generate, ramp(), 8).every((v) => v === 0)).toBe(true);

    // And on the k-rate clock path, which is a separate branch of `generate`.
    const [kGenerate, kUpdate] = createEuclid();
    kUpdate(0, 0, 0);
    const out = new Float32Array(BLOCK);
    for (let b = 0; b < 8; b++) {
      kGenerate(out, Float32Array.of((b % 4) / 4), 1, 0.5, NO_RESET);
      expect(Array.from(out).every((v) => v === 0)).toBe(true);
    }
  });

  it("counts `steps`, `beats` and `rotation` in integers", () => {
    // They arrive from an `AudioParam` as floats. Uncoerced, `steps: 8.9` is a
    // nine-step pattern, `beats: 3.9` puts four onsets in E(3,8), and
    // `rotation: 2.9` returns a seven-step pattern from an eight-step one.
    const exact = renderWith(8, 3, 2);
    expect(renderWith(8.9, 3.9, 2.9)).toEqual(exact);
    expect(renderWith(8.1, 3.1, 2.1)).toEqual(exact);

    function renderWith(steps: number, beats: number, rotation: number) {
      const [generate, update] = createEuclid();
      update(steps, beats, rotation);
      return render(generate, ramp(), 8 * 4);
    }
  });
});

/**
 * A per-sample phase ramp, a block at a time, keeping its phase across calls -
 * so a test can render up to an instant, change a parameter and carry on
 * without the ramp jumping back to 0.
 */
function ramp(samplesPerCycle = CYCLE) {
  let phase = 0;
  return () => {
    const clock = new Float32Array(BLOCK);
    for (let i = 0; i < BLOCK; i++) {
      clock[i] = phase;
      phase += 1 / samplesPerCycle;
      if (phase >= 1) phase -= 1;
    }
    return clock;
  };
}

function render(
  generate: GenerateFn,
  nextClock: () => Float32Array,
  blocks: number,
  params: {
    subdivision?: number;
    pulseWidth?: number;
    reset?: Float32Array;
  } = {},
) {
  const out: number[] = [];
  const output = new Float32Array(BLOCK);
  for (let b = 0; b < blocks; b++) {
    generate(
      output,
      nextClock(),
      params.subdivision ?? 1,
      params.pulseWidth ?? 0.5,
      params.reset ?? NO_RESET,
    );
    out.push(...output);
  }
  return out;
}

function risingEdges(values: number[]) {
  return values.flatMap((v, i) => (v > 0 && !(values[i - 1] > 0) ? [i] : []));
}

/**
 * Bjorklund's algorithm, as in Toussaint 2005 - the recursive
 * divide-with-remainder construction that gave Euclidean rhythms their name.
 *
 * Ported verbatim from
 * `thoughts/research/2026-09-07_clock-euclid-arp-harness/verify.mjs`, where the
 * module's rotation-equivalence claim was first established. It shares no line
 * with `euclid`, which is the whole point of having it here: two independent
 * constructions agreeing on 528 rhythms is evidence, one construction checked
 * against itself is not.
 */
function bjorklund(steps: number, beats: number): number[] {
  if (beats <= 0 || steps <= 0 || beats > steps)
    return new Array(Math.max(steps, 0)).fill(beats >= steps ? 1 : 0);
  let a = Array.from({ length: beats }, () => [1]);
  let b = Array.from({ length: steps - beats }, () => [0]);
  while (b.length > 1) {
    const m = Math.min(a.length, b.length);
    const nextA: number[][] = [];
    const nextB: number[][] = [];
    for (let i = 0; i < m; i++) nextA.push(a[i].concat(b[i]));
    if (a.length > m) for (let i = m; i < a.length; i++) nextB.push(a[i]);
    else for (let i = m; i < b.length; i++) nextB.push(b[i]);
    a = nextA;
    b = nextB;
    if (a.length <= 1) break;
  }
  return a.concat(b).flat();
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

/** How many times the pattern's minimal period occurs in it - the quantity
 * Morrill's Corollary 2 equates with `gcd(beats, steps)`. */
function periodCount(pattern: number[]) {
  const n = pattern.length;
  for (let period = 1; period <= n; period++) {
    if (n % period) continue;
    if (pattern.every((v, i) => v === pattern[i % period])) return n / period;
  }
  return 1;
}

/** The pattern as its inter-onset intervals, wrapping round the cycle: the way
 * a rhythm is written down when the question is where the hits fall relative to
 * each other rather than to the bar. */
function intervals(pattern: number[]) {
  const onsets = pattern.flatMap((v, i) => (v ? [i] : []));
  return onsets.map((at, i) =>
    i + 1 < onsets.length
      ? onsets[i + 1] - at
      : pattern.length - at + onsets[0],
  );
}

function same(a: number[], b: number[]) {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

function isRotationOf(a: number[], b: number[]) {
  return b.some((_, i) => same(a, b.slice(i).concat(b.slice(0, i))));
}
