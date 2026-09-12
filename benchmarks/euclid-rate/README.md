# Euclid render rate benchmark

What the `Euclid` engine's per-sample loop costs, in the three places the
`euclid` ticket folder made a claim about it and deferred the number.

Run for [ticket 09](../../../thoughts/tickets/euclid/09-euclid-gets-a-page.md),
which owns `benchmarks/` for that folder, and standing behind three earlier
tickets that each measured this loop and each deferred publishing: [ticket
05](../../../thoughts/tickets/euclid/05-the-rests.md) (`.rests` costs nothing),
[ticket 06](../../../thoughts/tickets/euclid/06-a-fan-of-rotations.md) (the
fan's three extra outputs cost nothing either) and [ticket
07](../../../thoughts/tickets/euclid/07-two-small-ones.md) (replacing
`while (c > 1) c -= 1` with `x - Math.floor(x)` is several times faster). All
three deferred for the same reason: the next ticket changed the same loop. This
is the last one, so the loop is final.

```
node benchmarks/euclid-rate/bench.mjs
```

Node 24 on Apple silicon, 48 kHz, 128-sample blocks, 10 s of audio per cell,
median of 5, **load average 6.45 on 14 cores**. Zero setup beyond the
workspace's own `esbuild`, which turns `dsp.ts` into something node can import.
The `while` loop column is the pre-07 expression transcribed into the benchmark,
since it no longer exists in the package; `bench.mjs` gives the command that
diffs the transcription against `ad3be6b^`.

**It refuses to run on a busy machine.** Above half a core of load average it
exits non-zero and says so, and prints the load it did run at in the header
above the table. That guard exists because ticket 06 measured this loop at load
average 60 with other agents building in the same checkout, had to throw the
table away, and could only leave the warning in prose — where the next person to
quote the numbers would not see it. `EUCLID_BENCH_FORCE=1` overrides.

**Not comparable with [`../automation-rate/`](../automation-rate/README.md)'s
numbers**, for the same reason [`../clock-rate/`](../clock-rate/README.md) and
[`../lfo-rate/`](../lfo-rate/README.md) are not: that harness measures a real
`AudioWorkletProcessor` inside Chrome's `OfflineAudioContext`, with the graph and
the parameter plumbing around it. This one measures a plain function in node.

## Results

### The phase reduction (ticket 07)

| what is timed          | subdivision | `while` loop | `wrapPhase` | speedup |
| ---------------------- | ----------: | -----------: | ----------: | ------: |
| the expression alone   |           1 |        0.137 |       0.080 |    1.7x |
| the expression alone   |           4 |        0.186 |       0.090 |    2.1x |
| the expression alone   |          20 |        0.390 |       0.091 |    4.3x |
| the step loop round it |           1 |        0.489 |       0.474 |    1.0x |
| the step loop round it |           4 |        0.585 |       0.451 |    1.3x |
| the step loop round it |          20 |        0.702 |       0.475 |    1.5x |

µs per block. One block's budget at 48 kHz is 2667 µs.

### Ticket 07's own harness, re-run

2e+7 iterations of the expression over a computed float, median of 5, in ms.

| subdivision | `while` loop | `wrapPhase` | speedup |
| ----------- | -----------: | ----------: | ------: |
| 1           |         40.7 |        14.2 |    2.9x |
| 4           |         46.7 |        13.6 |    3.4x |
| 20          |         80.4 |        13.7 |    5.9x |

### Output buffers (tickets 05 and 06)

| outputs      | spread 0 | spread 4 |
| ------------ | -------: | -------: |
| 1, hits only |    0.958 |    1.019 |
| 2, + rests   |    1.088 |    1.056 |
| 5, + the fan |    1.642 |    1.640 |

µs per block, `E(5,16)` at `subdivision: 4`.

### Swing (ticket 08)

| swing | µs/block |
| ----- | -------: |
| 1     |    1.636 |
| 2     |    1.629 |
| 3     |    1.635 |

`E(5,16)` at `subdivision: 4` on all five outputs.

## What it says

**07's 5.8x is real, and it is not a claim about the module.** Under the
ticket's own harness — the expression over a computed float, 2e7 iterations —
this machine reproduces it: **5.9x at `subdivision: 20`**, against the ticket's
5.8x and the 7.9x the implementation reported. The spread between those three is
the input distribution, not the change: a `while` loop that subtracts until it
is under 1 costs whatever the scaled phase happens to be, so a fixed input near
the top of the range measures a worst case and a sweep of the ramp measures an
average. `wrapPhase` is flat at 13.4–14.2 ms in every cell, which is the actual
point of it.

**Inside the engine's per-sample step that becomes 1.5x, and 0.23 µs/block.**
Three framings, each adding fixed cost that both columns pay:

| framing                              | speedup at `subdivision: 20` |
| ------------------------------------ | ---------------------------- |
| the expression over a computed float | 5.9x                         |
| the expression reading the block     | 4.3x                         |
| the step loop it sits in             | 1.5x                         |

None of them is wrong and only the last one is what a patch pays. The saving in
microseconds barely moves across the three — the reduction costs what it costs —
and the _ratio_ falls because a `Float32Array` read, a compare, a store, a
pattern index and a `gatePulse` did not get any faster. **0.23 µs on a 2667 µs
block is 0.009 % of one core**, which is the honest size of ticket 07's
performance argument. Its other half — that the loop left `1.0` standing where a
wrap should read `0` — is a correctness argument and does not need a number.

**Five outputs cost +0.68 µs/block over one — 0.026 % of one core.** That is the
whole of tickets 05 and 06 together: `.rests` is +0.13 and the fan's three
channels are another +0.55. A patch with eight `Euclid`s in it pays a fifth of a
percent of one core for twenty-four extra gate outputs. The claim those two
tickets made was "nearly free" and this is what nearly free measures as.

**06's anomaly does not reproduce on an idle machine.** Its table had `spread: 0`
coming out ~1.1 µs _slower_ than `spread: 4`, which nobody could explain; at load
6.45 the two are 1.642 and 1.640 — the same number. It was the load. That is the
guard's whole justification, found by the guard.

**`swing` is free, and `swing: 1` is not a special case that skips work.**
1.636 / 1.629 / 1.635 µs across the three settings — a 0.007 µs span, well inside
run-to-run noise, and `swing: 1` is not the fastest cell. `dsp.ts` computes
`swingPoint`, `paired` and `shortStep` once per block whatever the setting and
takes the same branch through `stepPhase` every time, so there is nothing for a
straight pattern to skip; the package README's claim that `swing: 1` is
_bit-identical_ to no swing is a claim about the arithmetic, asserted in
`dsp.test.ts` over 46 million samples, and this is the separate claim that it
also costs the same.

## What it does not settle

**This is a plain function in node.** There is no audio graph around it, no
parameter plumbing, no output-buffer allocation and no worklet message port. The
browser's cost of handing `process()` five zero-filled 128-sample buffers every
block, and of the four idle `GainNode`s `index.ts` hangs off outputs 1–4 whether
or not anyone connects them, is **not in any number above**. Ticket 06 flagged
that and it is the one thing these figures cannot be stretched to cover: they say
the _engine_ is cheap, not that the node is.

**Nothing about whether any of the three changes was worth making.** 07's
argument is a phase of exactly 1 read as low; 05's and 06's are that the rests
and the fan are reachable from no second node at any rotation. Those are
correctness and design arguments and none of them is settled by microseconds. The
numbers are here so that "it costs something" is a measurement rather than a
worry — and, this time, so that a number the folder published twice can be
reconciled instead of chosen between.

**Run-to-run spread is about ±5 %** on the µs/block cells at this load, which is
larger than the swing column's entire span and smaller than every delta the
paragraphs above draw a conclusion from. Re-run it before quoting a difference
below 0.1 µs.
