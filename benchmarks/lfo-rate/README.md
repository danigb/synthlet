# LFO generator rate benchmark

What `generateAudioRate` costs against `generateControlRate`, for every
`LfoType`. Run for [ticket
01](../../../thoughts/tickets/automation-rate/01-give-the-lfo-a-signal.md) of the
automation-rate folder, which asked for this measurement before deciding whether
the `audioRate` argument survives.

```
node benchmarks/lfo-rate/bench.mjs
```

Node 24 on Apple silicon, 48 kHz, 128-sample blocks, 10 s per cell, median of 5.
Zero setup beyond the workspace's own `esbuild`, which turns `dsp.ts` into
something node can import.

**Not comparable with [`../automation-rate/`](../automation-rate/README.md)'s
numbers.** That harness measures a real `AudioWorkletProcessor` inside Chrome's
`OfflineAudioContext`, with the graph, the parameter plumbing and the message
port around it. This one measures a plain function in node. The absolute figures
belong to different machines; the ratio and the delta are what transfer.

## Results

After the hoist described below:

| type           | k-rate | a-rate | delta | ratio |
| -------------- | -----: | -----: | ----: | ----: |
| None           |  0.036 |  0.692 | 0.656 | 19.41 |
| Sine           |  0.038 |  1.568 | 1.531 | 41.73 |
| Triangle       |  0.031 |  0.868 | 0.836 | 27.70 |
| RampUp         |  0.027 |  0.812 | 0.786 | 30.25 |
| RampDown       |  0.026 |  0.838 | 0.812 | 31.63 |
| Square         |  0.027 |  0.704 | 0.677 | 25.75 |
| ExpRampUp      |  0.060 |  1.654 | 1.594 | 27.55 |
| ExpRampDown    |  0.054 |  1.668 | 1.613 | 30.82 |
| ExpTriangle    |  0.051 |  1.721 | 1.670 | 33.88 |
| RandSampleHold |  0.026 |  0.790 | 0.765 | 30.93 |
| Impulse        |  0.027 |  0.789 | 0.761 | 28.85 |

µs per block. One block's budget at 48 kHz is 2667 µs.

## Three findings

### 1. The extrapolation was optimistic by about 3×

[The benchmark note](../../../thoughts/tickets/automation-rate/benchmark-results.md#01--give-the-lfo-a-signal)
predicted `generateAudioRate` would add **0.3–0.6 µs** on an `Lfo`'s ~2.7 µs
baseline — 10–20 % — by pricing `gen()` from ticket 00's `Math.tan` figure of
~5 ns a call.

Measured: **0.66 to 1.67 µs**, so 25–60 % of that baseline. The sine is the
worst per call because `Math.sin` is not cheap; the exponential shapes are worst
overall because `concaveTransform` does a `Math.log10` and two comparisons per
sample. Nothing here is 5 ns.

The extrapolation was explicitly labelled as one, and this is the measurement it
asked for.

### 2. And it is still nothing

The worst shape costs **1.67 µs of a 2667 µs block — 0.06 % of one core.** Eight
voices carrying one `ExpTriangle` LFO each is **0.5 %**. There is no patch in
this library where the audio-rate generator is the thing to worry about, and the
ticket's argument does not depend on the number being small anyway: a 344 Hz
staircase on a pitch parameter is wrong at any price.

### 3. Hoisting is worth 34 %, and the ticket asked for it conditionally

`generateAudioRate` read `gen`, `$gain`, `$offset` and `$frequency` from the
closure on every one of its 128 iterations, and `phase` twice. All five are
fixed for the block — `read()` runs once, before the loop, and every parameter
the LFO declares is k-rate. Lifting them into locals:

```
plain    1.119 us/block
hoisted  0.734 us/block   -34.4%
```

measured on an isolated copy of the two loop shapes. The arithmetic is identical
— `dt * $frequency` is the same product every iteration — so the output is
bit-identical, which `packages/lfo/src/dsp.test.ts` asserts sample-for-sample
against the block-constant generator run one sample at a time.

The ticket's checklist said to hoist _"if profiling shows the indirect call
matters; leave it alone if it does not"_. 34 % matters.

## What this does not settle

**The `audioRate` argument stays.** The benchmark note asked this ticket to flip
the burden of proof and expect to delete it. The numbers do not support deleting
it as confidently as the note expected — the generator now costs roughly what an
`Lfo`'s entire parameter surface costs, rather than a fifth of it — but they do
not support keeping a control-rate _mode_ either, because 0.06 % of a core is not
a mode anyone would choose.

So the argument survives as [the README's decision
table](../../../thoughts/tickets/automation-rate/README.md#decisions-this-folder-makes)
already had it: in place, unexposed, and `generateControlRate` reachable and
tested through it. Deleting a function's argument is a different diff from making
the LFO sound right, and this ticket is the second one.
