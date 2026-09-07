// What the LFO's audio-rate generator costs against its block-constant one.
//
// Ticket 01 of the automation-rate folder flips `worklet.ts` to
// `createLfo(sampleRate, true)`, and the benchmark note asks this ticket to
// measure the generator side directly: ticket 00 measured the *parameter* side
// (an `Lfo` declares four, so ~1.2 us/node/block) and extrapolated the
// generator side from `Math.tan` at ~5 ns a call.
//
// Node and not Chrome, unlike `benchmarks/automation-rate/`: `dsp.ts` touches
// nothing from `AudioWorkletGlobalScope`, so there is no reason to pay for a
// browser. The absolute numbers are therefore *not* comparable with ticket
// 00's - different engine, no audio graph around them. The ratio is the point.
//
//   node benchmarks/lfo-rate/bench.mjs
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

const root = resolve(import.meta.dirname, "../..");
const dir = mkdtempSync(join(tmpdir(), "lfo-bench-"));

try {
  const bundle = join(dir, "dsp.mjs");
  execFileSync(
    "npx",
    [
      "esbuild",
      join(root, "packages/lfo/src/dsp.ts"),
      "--bundle",
      "--format=esm",
      "--outfile=" + bundle,
    ],
    { cwd: root, stdio: ["ignore", "ignore", "inherit"] },
  );

  const { createLfo, LfoType } = await import(pathToFileURL(bundle).href);

  const blocks = Math.round((SAMPLE_RATE * SECONDS) / BLOCK);
  const output = new Float32Array(BLOCK);

  /** Microseconds per block, median of `REPEATS` runs. */
  function measure(audioRate, type) {
    const params = {
      type: [type],
      frequency: [5],
      gain: [1],
      offset: [0],
    };
    const times = [];
    for (let run = 0; run < REPEATS; run++) {
      const generate = createLfo(SAMPLE_RATE, audioRate);
      const start = process.hrtime.bigint();
      for (let i = 0; i < blocks; i++) generate(output, params);
      times.push(Number(process.hrtime.bigint() - start) / 1000 / blocks);
    }
    times.sort((a, b) => a - b);
    return times[REPEATS >> 1];
  }

  // One untimed pass so the JIT has seen both shapes before anything counts.
  for (const audioRate of [false, true]) measure(audioRate, LfoType.Sine);

  const rows = [];
  for (const name of Object.keys(LfoType).filter((k) => isNaN(Number(k)))) {
    const type = LfoType[name];
    const k = measure(false, type);
    const a = measure(true, type);
    rows.push({ type: name, kRate: k, aRate: a, ratio: a / k, delta: a - k });
  }

  const pad = (s, n) => String(s).padStart(n);
  console.log(
    `${SECONDS}s per cell, median of ${REPEATS}, ${SAMPLE_RATE} Hz, ${BLOCK}-sample blocks`,
  );
  console.log("us/block: what one call to the generator costs\n");
  console.log("| type            | k-rate | a-rate |  delta | ratio |");
  console.log("| --------------- | ------ | ------ | ------ | ----- |");
  for (const r of rows) {
    console.log(
      `| ${r.type.padEnd(15)} | ${pad(r.kRate.toFixed(3), 6)} | ${pad(
        r.aRate.toFixed(3),
        6,
      )} | ${pad(r.delta.toFixed(3), 6)} | ${pad(r.ratio.toFixed(2), 5)} |`,
    );
  }

  const worst = rows.reduce((a, b) => (a.delta > b.delta ? a : b));
  console.log(
    `\nworst case: ${worst.type}, +${worst.delta.toFixed(3)} us/block.`,
  );
  console.log(
    "Ticket 00 put an Lfo's parameter plumbing at ~2.7 us/node/block, so",
  );
  console.log("read the delta against that, not against zero.");
} finally {
  rmSync(dir, { recursive: true, force: true });
}
