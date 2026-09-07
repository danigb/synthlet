# Clock render rate benchmark

What rendering the clock's phase **per sample** costs against the **block fill**
it replaced. Run for [ticket
03](../../../thoughts/tickets/clock/03-a-phase-that-moves-every-sample.md) of the
clock folder, which asked for the number before merging: this is the one change
in that folder with a real cost, because `phaseOut.fill(v)` is a memset and a
loop with an add, a compare and a `gatePulse` per sample is not.

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

| case                 | block fill | per sample | delta | ratio |
| -------------------- | ---------: | ---------: | ----: | ----: |
| phase+gate, bpm 0    |      0.053 |      0.190 | 0.137 |  3.60 |
| phase+gate, bpm 120  |      0.052 |      0.224 | 0.172 |  4.32 |
| phase+gate, bpm 1000 |      0.058 |      0.270 | 0.212 |  4.64 |
| phase only, bpm 0    |      0.028 |      0.245 | 0.217 |  8.63 |
| phase only, bpm 120  |      0.028 |      0.133 | 0.105 |  4.75 |
| phase only, bpm 1000 |      0.028 |      0.132 | 0.104 |  4.73 |

µs per block. One block's budget at 48 kHz is 2667 µs.

## What it says

**The worst case is +0.23 µs on a 2667 µs block — under 0.01 % of one core.**
A patch with eight clocks in it pays under a tenth of a percent. The ratio is
4–5×, which sounds like a lot and is a fair description of the arithmetic: the
old code did one `fill` and about six operations per block, the new one does
about five operations per sample. Both numbers are true and only the absolute
one is a cost.

Two details worth not misreading:

- **`bpm: 0` in the phase-only row is a JIT artifact.** It is the first cell
  measured after the call shape changes (`gateOut` becomes `undefined`), and it
  absorbs the recompile. It reproduces run to run because the order does. The
  neighbouring `bpm: 120` and `bpm: 1000` cells, measured with the same shape
  already warm, are the honest figure for that column.
- **Tempo costs a little in the gated rows** — 0.19 µs stopped, 0.27 µs at
  1000 BPM — because a faster clock crosses the `pulseWidth` threshold and the
  wrap more often, so the two branches are less predictable. A stopped clock
  takes neither.

## What it does not settle

Nothing about whether the change is worth making. A 172-step staircase where the
README promises a ramp is wrong at any price, and the argument in the ticket is
about a 2.90 ms skew between two outputs of the same node, not about µs. The
number is here so that "it costs something" is a measurement rather than a
worry.
