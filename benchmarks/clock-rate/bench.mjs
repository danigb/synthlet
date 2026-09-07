// What rendering the clock's phase per sample costs against the block fill it
// replaces.
//
// Clock ticket 03 turns `phaseOut.fill(v)` - a memset - into a loop with an
// add, a compare and a `gatePulse` per sample. That is the one change in the
// clock folder with a real cost, and `clock` had no benchmark at all, so the
// ticket asked for the number rather than an assurance.
//
// Node and not Chrome, like `benchmarks/lfo-rate/`: `dsp.ts` touches nothing
// from `AudioWorkletGlobalScope`, so there is no reason to pay for a browser.
//
//   node benchmarks/clock-rate/bench.mjs
//
// Needs esbuild (a workspace devDependency) to turn `dsp.ts` into something
// node can import.

import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const SAMPLE_RATE = 48000;
const BLOCK = 128;
const SECONDS = 10;
const REPEATS = 5;

/** The block fill this ticket replaced, transcribed from the shipped engine. */
function createBlockFillClock(sampleRate) {
  let bpm = 120;
  let increment = bpm / 60 / sampleRate;
  let phase = 0;
  return (phaseOut, gateOut, nextBpm, pulseWidth) => {
    if (nextBpm !== bpm) {
      bpm = nextBpm;
      increment = bpm / 60 / sampleRate;
    }
    let nextPhase = phase + phaseOut.length * increment;
    if (nextPhase > 1) nextPhase -= 1;
    phaseOut.fill(nextPhase < phase ? 1 : phase);
    if (gateOut) {
      gateOut.fill(increment > 0 && nextPhase < pulseWidth ? 1 : 0);
    }
    phase = nextPhase;
  };
}

const root = resolve(import.meta.dirname, "../..");
const dir = mkdtempSync(join(tmpdir(), "clock-bench-"));

try {
  const bundle = join(dir, "dsp.mjs");
  execFileSync(
    "npx",
    [
      "esbuild",
      join(root, "packages/clock/src/dsp.ts"),
      "--bundle",
      "--format=esm",
      "--outfile=" + bundle,
    ],
    { cwd: root, stdio: ["ignore", "ignore", "inherit"] },
  );

  const { createClock } = await import(pathToFileURL(bundle).href);

  const blocks = Math.round((SAMPLE_RATE * SECONDS) / BLOCK);
  const phaseOut = new Float32Array(BLOCK);
  const gateOut = new Float32Array(BLOCK);

  /** Microseconds per block, median of `REPEATS` runs. */
  function measure(factory, bpm, withGate) {
    const times = [];
    for (let run = 0; run < REPEATS; run++) {
      const generate = factory(SAMPLE_RATE);
      const gate = withGate ? gateOut : undefined;
      const start = process.hrtime.bigint();
      for (let i = 0; i < blocks; i++) generate(phaseOut, gate, bpm, 0.5);
      times.push(Number(process.hrtime.bigint() - start) / 1000 / blocks);
    }
    times.sort((a, b) => a - b);
    return times[REPEATS >> 1];
  }

  // One untimed pass so the JIT has seen both shapes before anything counts.
  for (const factory of [createBlockFillClock, createClock]) {
    measure(factory, 120, true);
  }

  const rows = [];
  for (const withGate of [true, false]) {
    for (const bpm of [0, 120, 1000]) {
      const before = measure(createBlockFillClock, bpm, withGate);
      const after = measure(createClock, bpm, withGate);
      rows.push({
        label: `${withGate ? "phase+gate" : "phase only"}, bpm ${bpm}`,
        before,
        after,
        delta: after - before,
        ratio: after / before,
      });
    }
  }

  const pad = (s, n) => String(s).padStart(n);
  console.log(
    `${SECONDS}s per cell, median of ${REPEATS}, ${SAMPLE_RATE} Hz, ${BLOCK}-sample blocks`,
  );
  console.log("us/block: what one call to the generator costs\n");
  console.log(
    "| case                  | block fill | per sample |  delta | ratio |",
  );
  console.log(
    "| --------------------- | ---------- | ---------- | ------ | ----- |",
  );
  for (const r of rows) {
    console.log(
      `| ${r.label.padEnd(21)} | ${pad(r.before.toFixed(3), 10)} | ${pad(
        r.after.toFixed(3),
        10,
      )} | ${pad(r.delta.toFixed(3), 6)} | ${pad(r.ratio.toFixed(2), 5)} |`,
    );
  }

  const worst = rows.reduce((a, b) => (a.delta > b.delta ? a : b));
  const budget = (1e6 * BLOCK) / SAMPLE_RATE;
  console.log(
    `\nworst case: ${worst.label}, +${worst.delta.toFixed(3)} us/block.`,
  );
  console.log(
    `One block's budget at ${SAMPLE_RATE} Hz is ${budget.toFixed(0)} us, so that is ` +
      `${((100 * worst.delta) / budget).toFixed(3)}% of one core.`,
  );
} finally {
  rmSync(dir, { recursive: true, force: true });
}
