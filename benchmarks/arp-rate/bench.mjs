// What one block of `Arp` costs, on each of the two paths `worklet.ts` has.
//
// `worklet.ts:30-40` branches on `trigger.length > 1`. The a-rate path calls
// the engine once per sample - 128 calls, of which at most one changes the
// note and the rest hit the frequency cache. The k-rate path calls it once and
// `fill`s the block. They are different loops, so they get different rows.
//
// Node and not Chrome, like `benchmarks/lfo-rate/`: `dsp.ts` touches nothing
// from `AudioWorkletGlobalScope`, so there is no reason to pay for a browser.
// The absolute numbers are therefore *not* comparable with
// `benchmarks/automation-rate/`, which measures a real processor inside an
// `OfflineAudioContext`.
//
//   node benchmarks/arp-rate/bench.mjs
//
// Needs esbuild (a workspace devDependency) to turn `dsp.ts` into something
// node can import.
//
// This folder exists because arp tickets 03, 04 and 05 all add state to a
// module that is read once per sample, and the library has a convention of
// knowing what its changes cost. It does not exist because `Arp` is slow: see
// the README.

import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const SAMPLE_RATE = 48000;
const BLOCK = 128;
// Ten minutes of *audio* per timed run, not ten seconds of wall clock: at
// 0.4 us a block, ten seconds of audio is two milliseconds of work, which is
// under the noise floor of everything else on the machine. This is the number
// that makes the rows repeatable.
const SECONDS = 600;
const REPEATS = 9;

const BASE_NOTE = 60;
const OCTAVES = 4;
// Passed explicitly, so the row measures the traversal the module ships with
// rather than the argument default.
let MODE = 0; // ArpMode.Up, resolved from the enum once the bundle is loaded

const root = resolve(import.meta.dirname, "../..");
const dir = mkdtempSync(join(tmpdir(), "arp-bench-"));

try {
  const bundle = join(dir, "dsp.mjs");
  execFileSync(
    "npx",
    [
      "esbuild",
      join(root, "packages/arp/src/dsp.ts"),
      "--bundle",
      "--format=esm",
      "--outfile=" + bundle,
    ],
    { cwd: root, stdio: ["ignore", "ignore", "inherit"] },
  );

  const { createArpeggiator, ArpScale, ArpMode } = await import(
    pathToFileURL(bundle).href
  );

  MODE = ArpMode.Up;

  const blocks = Math.round((SAMPLE_RATE * SECONDS) / BLOCK);
  const output = new Float32Array(BLOCK);

  /** No trigger at all: what a block between two steps costs. */
  const idle = new Float32Array(BLOCK);
  /** One rising edge, mid-block: the shape a `Clock` at any musical rate gives. */
  const oneEdge = new Float32Array(BLOCK);
  oneEdge.fill(1, 64, 96);
  /** A trigger every other sample: 64 steps in one block, the worst case. */
  const alternating = Float32Array.from({ length: BLOCK }, (_, i) => i & 1);

  /**
   * The two loops, as separate functions so each gets its own JIT state: a
   * single loop with a branch on the path measures the second shape against
   * feedback collected from the first, and the difference is larger than the
   * difference being measured.
   */
  function runARate(arp, trigger, scale) {
    for (let i = 0; i < blocks; i++) {
      for (let s = 0; s < BLOCK; s++) {
        output[s] = arp(trigger[s], BASE_NOTE, scale, OCTAVES, MODE);
      }
    }
  }

  function runKRate(arp, trigger, scale) {
    for (let i = 0; i < blocks; i++) {
      output.fill(arp(trigger[0], BASE_NOTE, scale, OCTAVES, MODE));
    }
  }

  /**
   * Microseconds per block, median of `REPEATS` runs.
   *
   * Chrome hands length 1 both for an unconnected parameter and for a
   * connected constant, so the k-rate row is what every patch that sets
   * `trigger` as a value takes, and the a-rate row is what every patch that
   * *connects* a gate takes.
   */
  function measure(run, trigger, scale) {
    const times = [];
    for (let repeat = 0; repeat < REPEATS; repeat++) {
      const arp = createArpeggiator();
      const start = process.hrtime.bigint();
      run(arp, trigger, scale);
      times.push(Number(process.hrtime.bigint() - start) / 1000 / blocks);
    }
    times.sort((a, b) => a - b);
    return times[REPEATS >> 1];
  }

  // Untimed passes so the JIT has seen every shape before anything counts.
  for (let i = 0; i < 3; i++) {
    measure(runARate, oneEdge, ArpScale.TriadMajor);
    measure(runKRate, oneEdge, ArpScale.TriadMajor);
  }

  const scales = [
    ["TriadMajor", ArpScale.TriadMajor],
    ["Major", ArpScale.Major],
    ["Chromatic", ArpScale.Chromatic],
  ];

  const rows = [];
  for (const [name, scale] of scales) {
    rows.push({
      scale: name,
      kRate: measure(runKRate, oneEdge, scale),
      idle: measure(runARate, idle, scale),
      aRate: measure(runARate, oneEdge, scale),
      worst: measure(runARate, alternating, scale),
    });
  }

  const pad = (s, n) => String(s).padStart(n);
  console.log(
    `${SECONDS}s of audio per run, median of ${REPEATS}, ${SAMPLE_RATE} Hz, ${BLOCK}-sample blocks`,
  );
  console.log("us/block: what one render quantum of Arp costs\n");
  console.log("| scale      | k-rate | a-rate idle | a-rate | a-rate x64 |");
  console.log("| ---------- | ------ | ----------- | ------ | ---------- |");
  for (const r of rows) {
    console.log(
      `| ${r.scale.padEnd(10)} | ${pad(r.kRate.toFixed(3), 6)} | ${pad(
        r.idle.toFixed(3),
        11,
      )} | ${pad(r.aRate.toFixed(3), 6)} | ${pad(r.worst.toFixed(3), 10)} |`,
    );
  }

  const budget = (BLOCK / SAMPLE_RATE) * 1e6;
  const worst = rows.reduce((a, b) => (a.aRate > b.aRate ? a : b));
  console.log(
    `\none block's budget at ${SAMPLE_RATE} Hz is ${budget.toFixed(0)} us.`,
  );
  console.log(
    `worst a-rate row: ${worst.scale}, ${worst.aRate.toFixed(3)} us/block =` +
      ` ${((worst.aRate / budget) * 100).toFixed(3)}% of it.`,
  );
} finally {
  rmSync(dir, { recursive: true, force: true });
}
