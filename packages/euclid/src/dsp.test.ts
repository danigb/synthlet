import { createEuclid, euclid, GenerateFn } from "./dsp";
import { PARAMS } from "./params";

/**
 * The engine, driven directly.
 *
 * Runs in node with no `AudioWorkletProcessor` stub: `dsp.ts` imports nothing
 * from the worklet global scope. `worklet.test.ts` is where the stub lives.
 *
 * The second describe block is the net this module has never had: no setting
 * inside the declared range may produce a non-finite sample. Three separate
 * paths used to, all of them an out-of-range index feeding a multiply, and a
 * `NaN` reaching a destination silences that branch of the graph for the
 * lifetime of the context - so nothing throws, nothing warns, and the audio
 * dies.
 */

/** One render quantum - the block size the processor is called with. */
const BLOCK = 128;

/** An unconnected a-rate parameter: one value, and it is 0. That is what
 * `reset` looks like in every test that is not about resetting. */
const NO_RESET = new Float32Array(1);

/** Samples per clock cycle in these tests: four blocks, so a block boundary is
 * never a step boundary by accident and a step can be entered halfway. */
const CYCLE = 4 * BLOCK;

describe("euclid", () => {
  it("generates E(3, 8)", () => {
    // Three onsets over eight steps - the tresillo, and the one Euclidean
    // rhythm everybody can hum. `euclid` takes `steps` first.
    expect(euclid(8, 3)).toEqual([1, 0, 0, 1, 0, 0, 1, 0]);
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
