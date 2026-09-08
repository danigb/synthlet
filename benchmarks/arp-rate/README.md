# Arp rate benchmark

What one render quantum of `Arp` costs, on each of the two paths
`packages/arp/src/worklet.ts:30-40` has. Run for [ticket
01](../../../thoughts/tickets/arp/01-assert-the-sequence.md) of the arp folder,
which asks for the number to be recorded **before** tickets 03, 04 and 05 change
the engine.

```
node benchmarks/arp-rate/bench.mjs
```

Node 24 on Apple silicon, 48 kHz, 128-sample blocks, 600 s of audio per timed
run, median of 5. Zero setup beyond the workspace's own `esbuild`, which turns
`dsp.ts` into something node can import.

**Not comparable with [`../automation-rate/`](../automation-rate/README.md)'s
numbers.** That harness measures a real `AudioWorkletProcessor` inside Chrome's
`OfflineAudioContext`, with the graph, the parameter plumbing and the message
port around it. This one measures a plain function in node, as
[`../lfo-rate/`](../lfo-rate/README.md) does. The absolute figures belong to
different machines; the delta between runs of _this_ script is what transfers.

## This folder is not evidence of a performance problem

`Arp` costs **about a microsecond of a 2667 µs block — 0.03 % of one core.** No
user will ever notice this module, there is nothing here to optimise, and the
folder README says so in as many words. The benchmark exists because arp tickets
03 (an order), 04 (two random strategies) and 05 (a second octave mapping) all
add state to a function that is called once per sample on the a-rate path, and
the library has a convention of knowing what its changes cost. Read a later run
of this table against this one, not against zero.

## Results

Before ticket 01, which changes nothing an audio thread executes — the only
edit is an optional argument with a default.

| scale      | k-rate | a-rate idle | a-rate | a-rate ×64 |
| ---------- | -----: | ----------: | -----: | ---------: |
| TriadMajor |  0.025 |       0.733 |  0.789 |      2.912 |
| Major      |  0.025 |       0.663 |  0.724 |      2.974 |
| Chromatic  |  0.024 |       0.655 |  0.780 |      2.867 |

µs per block. One block's budget at 48 kHz is 2667 µs.

The four columns are four shapes the `trigger` parameter arrives in:

- **k-rate** — `trigger.length === 1`, which is what Chrome hands for an
  unconnected parameter _and_ for a connected constant. One call to the engine,
  then `output.fill`. This is the floor: 0.025 µs, twenty-five nanoseconds, one
  gate-detector call and a `fill`.
- **a-rate idle** — the split write with no trigger anywhere in the block: 128
  calls, every one of which hits the memoised frequency and returns. This is
  what a patch driven by a `Clock` pays on the great majority of its blocks, and
  it is **97 % of the a-rate cost**. The step itself is nearly free; the loop is
  the price.
- **a-rate** — the same, with one rising edge mid-block. One musical step.
- **a-rate ×64** — a trigger every other sample, so 64 steps in one block. Not a
  patch anybody writes; it is the ceiling, and it is still 0.1 % of budget.

The set size does not matter, which is the expected result: `getPitchClasses`
runs only when `scale` changes, and the pick is one array index either way.

## On the 0.405 µs figure

The folder README and ticket 01 both quote **0.405 µs/block** for the a-rate
path, measured while the research was written by porting `dsp.ts` verbatim into
a node script. This harness measures **0.72–1.15 µs/block** for the same work,
across runs on the same machine.

Recorded rather than tuned away, per the ticket's own instruction. Two things
account for it and neither is a regression:

1. **Run-to-run spread on this machine is about 40 %** — the two consecutive
   runs behind the table above gave 1.15 and 0.79 µs for the same cell. A
   µs-scale measurement of a nanosecond-scale function is dominated by whatever
   else the laptop is doing.
2. **The engine is reached through an imported closure here**, not pasted into
   the benchmark's own scope, so the call is not inlined into the loop the way a
   verbatim port's would be. That is the more faithful shape — `worklet.ts`
   calls it across a module boundary too.

The conclusion the number supports is unchanged at either figure: this module's
cost is three hundredths of one per cent of a block.
