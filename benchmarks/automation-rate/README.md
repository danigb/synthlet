# Automation-rate benchmark

What it costs to **declare** an `AudioParam`, separately from what it costs to
**use** one — and whether `a-rate` is more expensive than `k-rate`.

Run for [ticket 00](https://github.com/danigb/synthlet) of the automation-rate
work. Results below are Chrome 152 on Apple silicon, and are committed alongside
as `results-chrome152.json` and `results-probe-chrome152.json`.

```
node benchmarks/automation-rate/run-chrome.mjs --out results.json
node benchmarks/automation-rate/run-chrome.mjs --probe          # param delivery
```

Zero dependencies: a small static server, Chrome's remote-debugging endpoint, and
Node's global `WebSocket` (Node ≥ 22). For Firefox or Safari, serve this directory
and open `index.html` or `probe.html` by hand.

## Method

Everything renders through `OfflineAudioContext`, so there is no audio device, no
`SharedArrayBuffer`, no COOP/COEP, and no reliance on `performance` existing in
`AudioWorkletGlobalScope` (it is not specified there). Each cell renders 10 s of
audio five times; the median is reported.

The headline unit is **µs per node per render quantum** — wall-clock time divided
by node count and block count. Multiply by 375 to get µs/second at 48 kHz; one
block's budget is 2667 µs.

Every processor does **identical DSP work** and reads only what the case says. The
primary matrix declares 0/2/8/16 params and reads **two** in every case, so the
difference is the cost of declaring, not of using.

## Results — Chrome 152

### Declaring a parameter costs ~0.30 µs/node/block, and the rate is free

| declared | k-rate | a-rate |
| -------: | -----: | -----: |
|        0 |   1.51 |      — |
|        2 |   2.06 |   2.09 |
|        8 |   3.81 |   3.86 |
|       16 |   6.57 |   6.40 |

Linear at **0.275 / 0.287 / 0.316 µs per param** for 2 / 8 / 16. **k-rate and
a-rate are indistinguishable** — every pair is within run-to-run noise (±3 %),
in both directions. Holds at 1, 8 and 32 instances.

### Reading a parameter is 5× cheaper than declaring it

Declaring 16 and reading 2 costs 6.40–6.57; reading all 16 costs 7.21–7.41. So
~0.06 µs per param read against ~0.30 to declare. **The cost is in the plumbing,
not in your loop.**

### Chrome collapses constants, not just absent automation

`probe.js` reports the delivered array length _and_ whether values vary within the
block:

| connected to the param   | k-rate | a-rate  |
| ------------------------ | ------ | ------- |
| nothing                  | 1      | 1       |
| `ConstantSourceNode`     | 1      | **1**   |
| `OscillatorNode` 5 Hz    | 1      | **128** |
| `OscillatorNode` 1000 Hz | 1      | **128** |
| scheduled ramp           | 1      | **128** |

The spec only permits length 1 "if no automation is scheduled during this render
quantum". Chrome goes further: it collapses a _constant sum_, so an a-rate param
fed by a `ConstantSourceNode` still arrives as length 1. Only a genuinely varying
value forces 128.

**The k-rate column is the finding.** An oscillator connected to a k-rate param
delivers one value per block with zero within-block spread — the modulator is
decimated to 375 Hz and there is no way for the processor to recover it.

### k-rate saves nothing when a node is connected

| 16 params, read 16     | k-rate |    a-rate |
| ---------------------- | -----: | --------: |
| ← `ConstantSourceNode` |  10.05 |     10.44 |
| ← `OscillatorNode`     |  15.47 | **15.11** |

With a real modulator connected, a-rate is _not_ more expensive — the cost is
dominated by rendering and summing the upstream nodes, which happens either way.
k-rate throws the result away afterwards.

### Change detection removes 24 % of a coefficient recompute

A `Math.tan` per sample driven by an a-rate param:

|                 | unguarded |  guarded |
| --------------- | --------: | -------: |
| constant param  |      2.69 | **2.05** |
| automated param |      2.84 |     2.85 |

When the value is static the guard removes a quarter of the processor's cost. When
it genuinely changes every sample the guard cannot help, and correctly costs the
same. Automating all 16 a-rate params costs +12 % over the same processor
unautomated (8.09 vs 7.21).

## What this settles

- **`karplus-strong/src/params.ts:22-23` is right**: _"A host with nothing
  connected still hands the processor one value per block, which costs exactly
  what k-rate did."_ Measured: identical within noise.
- **`granite`'s "16 × 128 floats per block"** is the spec-legal worst case, not
  what Chrome does. Its k-rate-everywhere decision is defensible, but not for that
  reason — declaring a-rate would have cost nothing there.
- **Parameter count dominates parameter rate.** 0 → 16 params is a 4.4× increase
  in per-node cost; k-rate → a-rate is 0 %.

Scaled to this library at 48 kHz: `karplus-strong` (15 params, one node) spends
~6.0 µs/block, 0.23 % of a core, purely on plumbing. A `MonoSynth` voice — seven
worklet nodes, ~40 params — spends ~22.6 µs/block; **eight voices ≈ 180 µs/block,
6.8 % of one core** before any DSP runs. Real, worth knowing, not alarming.

## Caveats

- **One engine, one machine.** Chrome 152, Apple silicon. Firefox was not
  installed; Safari was not run. The `MAY` in the spec means another engine is
  permitted to always deliver 128, which would change the first conclusion.
- **`OfflineAudioContext`, not realtime.** No deadline pressure and no
  dropped-quantum count. The realtime factor predicts glitching; it does not
  reproduce scheduler behaviour under load.
- **Absolute numbers are small.** These processors do almost no DSP, so plumbing
  is a large share of a small total. In a real module the same absolute µs is a
  smaller fraction.
- **Not a reproduction of Primozic's result.** His post reports 5.9 ms → 2.3 ms
  cutting 544 params to 96, which implies a per-param cost ~25× what is measured
  here. Different processors, different Chrome, and his figure is a profiling-window
  total rather than a per-block cost — so the _direction_ reproduces and the
  magnitude does not. Do not quote his numbers as if they were these.
