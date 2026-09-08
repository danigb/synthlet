// What the Euclid engine's per-sample loop costs, in the three places the
// `euclid` ticket folder made a claim about it and deferred the number here.
//
// Ticket 05 (`.rests`), ticket 06 (the fan) and ticket 07 (`wrapPhase`) all
// asserted something about this loop's cost and all three deferred the
// measurement to ticket 09, each for the same reason: the next ticket changed
// the same loop. This is the last one, so the loop is final.
//
// Node and not Chrome, like `benchmarks/clock-rate/` and `benchmarks/lfo-rate/`:
// `dsp.ts` touches nothing from `AudioWorkletGlobalScope`, so there is no
// reason to pay for a browser.
//
//   node benchmarks/euclid-rate/bench.mjs
//
// Needs esbuild (a workspace devDependency) to turn `dsp.ts` into something
// node can import.

import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { cpus, loadavg, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const SAMPLE_RATE = 48000;
const BLOCK = 128;
const SECONDS = 10;
const REPEATS = 5;

const LOAD = loadavg()[0];
const CORES = cpus().length;

// Ticket 06's planner had to write "the machine was under heavy concurrent load
// (load average 60+, other agents building in the same checkout)... re-run on an
// idle machine before quoting a number", and then throw the table away:
// `spread: 0` had come out ~1.1 us *slower* than `spread: 4` for no reason
// anyone found. Neither of the two existing benchmarks records load at all, so
// that warning could only live in prose next to the numbers it invalidated.
//
// A benchmark that cannot tell you it was measured on a busy machine publishes
// that kind of number silently. This one refuses, and prints the load it did
// run at in the header so the figure and its conditions travel together.
if (LOAD > CORES * 0.5 && !process.env.EUCLID_BENCH_FORCE) {
  console.error(
    `Load average is ${LOAD.toFixed(1)} on ${CORES} cores. These numbers would ` +
      `not be worth publishing. Close the other work, or set ` +
      `EUCLID_BENCH_FORCE=1 to measure anyway.`,
  );
  process.exit(1);
}

/**
 * The phase reduction ticket 07 replaced, transcribed from the engine as it
 * stood before it. It no longer exists in the package, exactly as
 * `benchmarks/clock-rate/bench.mjs` transcribes `createBlockFillClock`.
 *
 * Byte-checkable against the commit that replaced it:
 *
 *   git show ad3be6b^:packages/euclid/src/dsp.ts | sed -n '77,82p'
 *
 * which is
 *
 *   function step(clock: number, subdivision: number, pulseWidth: number) {
 *     let currentClock = clock * subdivision;
 *     while (currentClock > 1) currentClock -= 1;
 *     const gate = currentClock < prevClock;
 *     prevClock = currentClock;
 *
 * The four lines below are those four, and only those four. This measures the
 * *reduction*, not the pre-07 engine: that engine had one output, no `spread`
 * and no `swing`, so running it whole against today's would measure four
 * tickets and hand the total to one of them. `prevClock` is a closure variable
 * and the boundary count is returned, so nothing here folds away.
 */
function createSubtractionLoop() {
  let prevClock = 0;
  return (clock, subdivision) => {
    let boundaries = 0;
    for (let i = 0; i < clock.length; i++) {
      let currentClock = clock[i] * subdivision;
      while (currentClock > 1) currentClock -= 1;
      const gate = currentClock < prevClock;
      prevClock = currentClock;
      if (gate) boundaries++;
    }
    return boundaries;
  };
}

/** The same four lines with the shipped `wrapPhase` in place of the loop. */
function createWrapPhaseLoop(wrapPhase) {
  let prevClock = 0;
  return (clock, subdivision) => {
    let boundaries = 0;
    for (let i = 0; i < clock.length; i++) {
      const currentClock = wrapPhase(clock[i] * subdivision);
      const gate = currentClock < prevClock;
      prevClock = currentClock;
      if (gate) boundaries++;
    }
    return boundaries;
  };
}

/**
 * The same two reductions with nothing else around them, in three framings,
 * because the answer to "how much faster is `wrapPhase`" depends entirely on
 * which one you ask - and the folder has published two different numbers
 * without saying which.
 *
 * `"a scalar loop"` is ticket 07's own harness: the expression over a computed
 * float, nothing read from memory, which is what produced 5.8x in the ticket
 * and 7.9x on the implementation machine. `"a block of samples"` is the same
 * expression reading the `Float32Array` the engine actually reads. `"the step
 * loop"` adds the comparison and the `prevClock` store that the reduction sits
 * inside.
 *
 * Every added fixed cost is paid by both columns, so the ratio falls each time
 * even though the saving in microseconds does not move. Publishing only the
 * first is how a real 5.8x becomes a reader's belief that the module got 5.8x
 * faster; publishing only the last would hide that the expression itself is
 * several times cheaper, which is why it was changed. Both are here.
 *
 * The accumulator is returned so V8 cannot drop the body.
 */
/** Ticket 07's own harness: `ITERATIONS` of the expression over a computed
 * float, nothing read from memory, timed in milliseconds for the whole run. */
const ITERATIONS = 2e7;

function scalarSubtraction(subdivision) {
  let sum = 0;
  for (let i = 0; i < ITERATIONS; i++) {
    let currentClock = ((i % 4096) / 4096) * subdivision;
    while (currentClock > 1) currentClock -= 1;
    sum += currentClock;
  }
  return sum;
}

function scalarWrapPhase(wrapPhase, subdivision) {
  let sum = 0;
  for (let i = 0; i < ITERATIONS; i++)
    sum += wrapPhase(((i % 4096) / 4096) * subdivision);
  return sum;
}

function isolatedSubtraction(clock, subdivision) {
  let sum = 0;
  for (let i = 0; i < clock.length; i++) {
    let currentClock = clock[i] * subdivision;
    while (currentClock > 1) currentClock -= 1;
    sum += currentClock;
  }
  return sum;
}

function isolatedWrapPhase(wrapPhase) {
  return (clock, subdivision) => {
    let sum = 0;
    for (let i = 0; i < clock.length; i++)
      sum += wrapPhase(clock[i] * subdivision);
    return sum;
  };
}

const root = resolve(import.meta.dirname, "../..");
const dir = mkdtempSync(join(tmpdir(), "euclid-bench-"));

try {
  const bundle = join(dir, "dsp.mjs");
  execFileSync(
    "npx",
    [
      "esbuild",
      join(root, "packages/euclid/src/dsp.ts"),
      "--bundle",
      "--format=esm",
      "--outfile=" + bundle,
    ],
    { cwd: root, stdio: ["ignore", "ignore", "inherit"] },
  );

  const { createEuclid, wrapPhase } = await import(pathToFileURL(bundle).href);

  const blocks = Math.round((SAMPLE_RATE * SECONDS) / BLOCK);
  const NO_RESET = new Float32Array(1);
  const buffers = Array.from({ length: 5 }, () => [new Float32Array(BLOCK)]);

  // The clock ramp, rendered once and outside every timed loop. Tickets 05 and
  // 06 both did this in their throwaway harnesses and it is the difference
  // between measuring the engine and measuring the harness: a ramp built per
  // block is an allocation and 128 divides that the engine never does.
  // One clock cycle per 32 blocks, so a boundary falls inside a block rather
  // than on its edge, and the block index cycles through the whole ramp.
  const RAMP_BLOCKS = 32;
  const ramp = Array.from({ length: RAMP_BLOCKS }, (_, b) =>
    Float32Array.from(
      { length: BLOCK },
      (_, i) =>
        ((b * BLOCK + i) % (RAMP_BLOCKS * BLOCK)) / (RAMP_BLOCKS * BLOCK),
    ),
  );

  /** Microseconds per block, median of `REPEATS` runs. */
  function median(run) {
    const times = [];
    for (let repeat = 0; repeat < REPEATS; repeat++) {
      const call = run();
      const start = process.hrtime.bigint();
      for (let i = 0; i < blocks; i++) call(ramp[i % RAMP_BLOCKS]);
      times.push(Number(process.hrtime.bigint() - start) / 1000 / blocks);
    }
    times.sort((a, b) => a - b);
    return times[REPEATS >> 1];
  }

  const reduction = (factory, subdivision) => () => {
    const loop = factory();
    return (clock) => loop(clock, subdivision);
  };

  const engine =
    ({
      steps = 16,
      beats = 5,
      rotation = 0,
      spread = 0,
      subdivision = 4,
      swing = 1,
      outputs = 5,
    }) =>
    () => {
      const [generate, update] = createEuclid();
      update(steps, beats, rotation);
      const out = buffers.slice(0, outputs);
      return (clock) =>
        generate(out, clock, subdivision, swing, 0.5, spread, NO_RESET);
    };

  // One untimed pass per shape before anything counts, as `clock-rate` does,
  // so no cell absorbs a recompile the way that benchmark's `bpm: 0` column
  // does. Every shape below appears here.
  for (const subdivision of [1, 4, 20]) {
    median(reduction(createSubtractionLoop, subdivision));
    median(reduction(() => createWrapPhaseLoop(wrapPhase), subdivision));
    median(reduction(() => isolatedSubtraction, subdivision));
    median(reduction(() => isolatedWrapPhase(wrapPhase), subdivision));
  }
  for (const outputs of [1, 2, 5])
    for (const spread of [0, 4]) median(engine({ outputs, spread }));
  for (const swing of [1, 2, 3]) median(engine({ swing }));

  const pad = (s, n) => String(s).padStart(n);
  const budget = (1e6 * BLOCK) / SAMPLE_RATE;

  console.log(
    `${SECONDS}s per cell, median of ${REPEATS}, ${SAMPLE_RATE} Hz, ` +
      `${BLOCK}-sample blocks, load average ${LOAD.toFixed(2)} on ${CORES} cores`,
  );
  console.log("us/block: what one call costs\n");

  // 1. Ticket 07: the phase reduction, on its own.
  console.log("### The phase reduction (ticket 07)\n");
  console.log(
    "| what is timed          | subdivision | `while` loop | `wrapPhase` | speedup |",
  );
  console.log(
    "| ---------------------- | ----------: | -----------: | ----------: | ------: |",
  );
  const speedups = [];
  for (const [what, slow, fast] of [
    [
      "the expression alone",
      () => isolatedSubtraction,
      () => isolatedWrapPhase(wrapPhase),
    ],
    [
      "the step loop round it",
      createSubtractionLoop,
      () => createWrapPhaseLoop(wrapPhase),
    ],
  ]) {
    for (const subdivision of [1, 4, 20]) {
      const before = median(reduction(slow, subdivision));
      const after = median(reduction(fast, subdivision));
      speedups.push({
        what,
        subdivision,
        before,
        after,
        ratio: before / after,
      });
      console.log(
        `| ${what.padEnd(22)} | ${pad(subdivision, 11)} | ${pad(before.toFixed(3), 12)} | ` +
          `${pad(after.toFixed(3), 11)} | ${pad((before / after).toFixed(1) + "x", 7)} |`,
      );
    }
  }

  // 1b. The same claim under ticket 07's own harness, so the folder's two
  // published numbers can be reconciled rather than picked between.
  console.log("\n### Ticket 07's own harness, re-run\n");
  console.log(
    `${ITERATIONS.toExponential(0)} iterations of the expression over a computed float, ` +
      `median of ${REPEATS}, in ms.\n`,
  );
  console.log("| subdivision | `while` loop | `wrapPhase` | speedup |");
  console.log("| ----------- | -----------: | ----------: | ------: |");
  const scalar = [];
  for (const subdivision of [1, 4, 20]) {
    const ms = (f) => {
      const times = [];
      for (let repeat = 0; repeat < REPEATS; repeat++) {
        const start = process.hrtime.bigint();
        f();
        times.push(Number(process.hrtime.bigint() - start) / 1e6);
      }
      times.sort((a, b) => a - b);
      return times[REPEATS >> 1];
    };
    const before = ms(() => scalarSubtraction(subdivision));
    const after = ms(() => scalarWrapPhase(wrapPhase, subdivision));
    scalar.push({ subdivision, before, after, ratio: before / after });
    console.log(
      `| ${pad(subdivision, 11)} | ${pad(before.toFixed(1), 12)} | ` +
        `${pad(after.toFixed(1), 11)} | ${pad((before / after).toFixed(1) + "x", 7)} |`,
    );
  }

  // 2. Tickets 05 and 06: what the extra output buffers cost.
  console.log("\n### Output buffers (tickets 05 and 06)\n");
  console.log("| outputs        | spread 0 | spread 4 |");
  console.log("| -------------- | -------: | -------: |");
  const LABELS = { 1: "1, hits only", 2: "2, + rests", 5: "5, + the fan" };
  const outputRows = [];
  for (const outputs of [1, 2, 5]) {
    const cells = [0, 4].map((spread) => median(engine({ outputs, spread })));
    outputRows.push({ outputs, cells });
    console.log(
      `| ${LABELS[outputs].padEnd(14)} | ${pad(cells[0].toFixed(3), 8)} | ` +
        `${pad(cells[1].toFixed(3), 8)} |`,
    );
  }

  // 3. Ticket 08: swing.
  console.log("\n### Swing (ticket 08)\n");
  console.log("| swing | us/block |");
  console.log("| ----- | -------: |");
  const swingRows = [];
  for (const swing of [1, 2, 3]) {
    const cost = median(engine({ swing }));
    swingRows.push({ swing, cost });
    console.log(`| ${pad(swing, 5)} | ${pad(cost.toFixed(3), 8)} |`);
  }

  const best = (what) =>
    speedups
      .filter((r) => r.what === what)
      .reduce((a, b) => (a.ratio > b.ratio ? a : b));
  const bestAlone = best("the expression alone");
  const bestInLoop = best("the step loop round it");
  const oneOutput = outputRows.find((r) => r.outputs === 1);
  const fiveOutputs = outputRows.find((r) => r.outputs === 5);
  const fanCost = Math.max(
    ...[0, 1].map((i) => fiveOutputs.cells[i] - oneOutput.cells[i]),
  );
  const swingCost =
    Math.max(...swingRows.map((r) => r.cost)) -
    Math.min(...swingRows.map((r) => r.cost));

  console.log(
    `\nOne block's budget at ${SAMPLE_RATE} Hz is ${budget.toFixed(0)} us.\n`,
  );
  console.log(
    `Under 07's harness the expression is ` +
      `${scalar.reduce((a, b) => (a.ratio > b.ratio ? a : b)).ratio.toFixed(1)}x faster ` +
      `at subdivision 20. Reading a block instead of a computed float it is ` +
      `${bestAlone.ratio.toFixed(1)}x at subdivision ${bestAlone.subdivision}; ` +
      `the engine's step loop round it is ` +
      `${bestInLoop.ratio.toFixed(1)}x, saving ` +
      `${(bestInLoop.before - bestInLoop.after).toFixed(3)} us/block, ` +
      `${((100 * (bestInLoop.before - bestInLoop.after)) / budget).toFixed(3)}% of one core.`,
  );
  console.log(
    `Five output buffers cost +${fanCost.toFixed(3)} us/block over one, ` +
      `${((100 * fanCost) / budget).toFixed(3)}% of one core.`,
  );
  console.log(
    `Swing spans ${swingCost.toFixed(3)} us/block across swing 1-3, ` +
      `${((100 * swingCost) / budget).toFixed(3)}% of one core.`,
  );
} finally {
  rmSync(dir, { recursive: true, force: true });
}
