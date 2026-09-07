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

After the hoist described below, and re-run for [ticket
06](../../../thoughts/tickets/lfo/06-a-rate-that-moves.md), which made
`frequency` a-rate:

| type           | k-rate | a-rate | delta | ratio | mod rate | cost |
| -------------- | -----: | -----: | ----: | ----: | -------: | ---: |
| None           |  0.039 |  0.926 | 0.887 | 23.69 |    0.996 | 7.6% |
| Sine           |  0.046 |  1.696 | 1.650 | 36.81 |    1.764 | 4.0% |
| Triangle       |  0.035 |  1.128 | 1.094 | 32.71 |    1.202 | 6.5% |
| RampUp         |  0.034 |  1.119 | 1.085 | 33.04 |    1.213 | 8.4% |
| RampDown       |  0.033 |  1.146 | 1.113 | 34.31 |    1.230 | 7.3% |
| Square         |  0.032 |  0.977 | 0.945 | 30.74 |    1.044 | 6.9% |
| ExpRampUp      |  0.074 |  2.250 | 2.176 | 30.44 |    2.301 | 2.3% |
| ExpRampDown    |  0.064 |  2.285 | 2.220 | 35.43 |    2.339 | 2.4% |
| ExpTriangle    |  0.060 |  2.287 | 2.227 | 37.96 |    2.345 | 2.5% |
| RandSampleHold |  0.033 |  1.045 | 1.012 | 31.83 |    1.143 | 9.4% |
| Impulse        |  0.032 |  1.014 | 0.982 | 31.94 |    1.109 | 9.4% |

µs per block. One block's budget at 48 kHz is 2667 µs.

The `a-rate` column is 25–40 % above its first measurement, and that is not the
rate change: the sample loop gained a gate detector for `sync` and a branch for
the depth envelope (lfo tickets 04 and 05) between the two runs. `mod rate` is
the same loop with a `frequency` that varies every sample, and `cost` is what
that branch costs against the hoisted increment.

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

### 3. A per-sample rate costs at most 9.4 %, and usually less

Ticket 06 of the lfo folder budgeted 40 % for the modulated path, on the grounds
that the hoisted increment is worth 34 % and giving all of it back would be the
worst case. It does not come to that: the branch is taken once per block, and the
per-sample arithmetic it enables is one multiply against a `gen()` call that
already costs far more. The dearest shapes in absolute terms — the `Exp*` family,
which do a `Math.log10` per sample — are the _cheapest_ in relative terms, at
2.3–2.5 %, for exactly that reason.

Every unmodulated patch pays **nothing**: Chrome hands length 1 both for an
unconnected parameter and for a connected constant, so the `length > 1` branch is
false and the increment is hoisted exactly as it was.

### 4. Hoisting is worth 34 %, and the ticket asked for it conditionally

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

Since ticket 06 the increment is hoisted **conditionally** — only when
`frequency` arrives as a single value, which is every patch that does not
modulate it. The other four hoists are unconditional, because `read()` still runs
once per block for the k-rate parameters.

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
