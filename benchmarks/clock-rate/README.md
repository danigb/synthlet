# Clock render rate benchmark

What rendering the clock **per sample** costs against the **block fill** it
replaced. Run for [ticket
03](../../../thoughts/tickets/clock/03-a-phase-that-moves-every-sample.md) of the
clock folder, which asked for the number before merging: that is the one change
in the folder with a real cost, because `phaseOut.fill(v)` is a memset and a loop
with an add, a compare and a `gatePulse` per sample is not. Re-run for [ticket
06](../../../thoughts/tickets/clock/06-bars-and-downbeats.md), which added two
more outputs.

```
node benchmarks/clock-rate/bench.mjs
```

Node 24 on Apple silicon, 48 kHz, 128-sample blocks, 10 s per cell, median of 5.
Zero setup beyond the workspace's own `esbuild`, which turns `dsp.ts` into
something node can import. The "block fill" column is that expression
transcribed into the benchmark, since it no longer exists in the package.

**Not comparable with [`../automation-rate/`](../automation-rate/README.md)'s
numbers**, for the same reason [`../lfo-rate/`](../lfo-rate/README.md) is not:
that harness measures a real `AudioWorkletProcessor` inside Chrome's
`OfflineAudioContext`, with the graph and the parameter plumbing around it. This
one measures a plain function in node.

## Results

Measured after ticket 06, which added the bar phase and the downbeat gate, so
the "per sample" column is a four-output generator.

| case                 | block fill | per sample | delta | ratio |
| -------------------- | ---------: | ---------: | ----: | ----: |
| phase+gate, bpm 0    |      0.054 |      1.032 | 0.977 | 18.99 |
| phase+gate, bpm 120  |      0.053 |      0.823 | 0.770 | 15.61 |
| phase+gate, bpm 1000 |      0.058 |      0.884 | 0.826 | 15.24 |
| phase only, bpm 0    |      0.031 |      1.032 | 1.001 | 33.69 |
| phase only, bpm 120  |      0.028 |      0.669 | 0.642 | 24.21 |
| phase only, bpm 1000 |      0.029 |      0.664 | 0.635 | 22.53 |
| all four, bpm 0      |      0.049 |      1.031 | 0.982 | 21.19 |
| all four, bpm 120    |      0.052 |      1.134 | 1.081 | 21.61 |
| all four, bpm 1000   |      0.053 |      1.143 | 1.091 | 21.69 |

µs per block. One block's budget at 48 kHz is 2667 µs.

Before the bar outputs existed, with a loop split in two on whether the gate was
wanted, the same measurement read **+0.23 µs** worst case. Four outputs and one
loop with four hoisted flags is +1.09.

## What it says

**The worst case is +1.09 µs on a 2667 µs block — 0.04 % of one core.** A patch
with eight clocks in it pays a third of a percent. The ratio is 15–30×, which
sounds like a lot and is a fair description of the arithmetic: the old code did
one `fill` and about six operations per block, the new one does four writes and
a handful of comparisons per sample. Both numbers are true and only the absolute
one is a cost.

Three details worth not misreading:

- **`bpm: 0` rows are dominated by a JIT artifact**, not by tempo. They are the
  first cell measured for each output-count shape and absorb the recompile,
  which is why they read the same 1.03 µs in all three. The neighbouring
  `bpm: 120` and `bpm: 1000` cells, measured with the shape already warm, are
  the honest figure for each column.
- **Tempo costs almost nothing** once warm — 0.823 vs 0.884 µs at 120 and 1000
  BPM — because the only thing a faster clock does is cross the `pulseWidth`
  threshold and the wrap more often, making two branches less predictable.
- **The bar phase is a divide per sample and that divide is free.** A/B on
  isolated copies of the two loop bodies: 0.9244 µs/block with the divide,
  0.9269 with a hoisted reciprocal. `../lfo-rate/` kept its hoist because it was
  worth 34 %; this one is worth nothing, and `dsp.ts` says so where the divide
  is, so nobody adds the state back by reflex.

## What it does not settle

Nothing about whether the change is worth making. A 172-step staircase where the
README promises a ramp is wrong at any price, and the argument in the ticket is
about a 2.90 ms skew between two outputs of the same node, not about µs. The
number is here so that "it costs something" is a measurement rather than a
worry.
