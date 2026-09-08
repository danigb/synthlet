---
"@synthlet/level-meter": minor
---

Measure true peak, with `lookahead-limiter`'s own interpolator. Opt-in:
`{ truePeak: true }` on the meter and on `analyze()`.

The meter reported sample peak, and **sample peak is not what clips**.
Inter-sample peaks — the overshoot of the reconstructed waveform _between_
samples — commonly run 0.5 to 3 dB above sample peak on limited material, which
is why every streaming delivery spec is written in dBTP, and why a track that
never exceeds 0 dBFS on a sample meter can still clip a converter or a lossy
encoder. A meter that cannot show it cannot answer "am I clipping", which is the
most common reason anyone looks at a meter at all.

Nothing new was written. `createTruePeakDetector` comes from
`@synthlet/lookahead-limiter/dsp` — a 48-tap Hann-windowed sinc in 4 phases,
already validated against an independent 8× oracle at ±0.1 dB from 60 Hz to
10 kHz. Sharing it means the limiter and the meter agree **by construction**;
two implementations disagreeing by 0.2 dB is a worse outcome than 48
multiply-accumulates. The meter's reading is asserted equal to the detector's
own on the same signal.

True peak lands in the layout slot reserved for it, with the sample peak's
ballistics — instant attack, the same `releaseDbPerSecond` release — and state of
its own. Sample peak stays reported alongside: they are different numbers and
anyone checking a delivery spec needs both. `TRUE_PEAK_CEILING_DBTP` is exported
for renderers, because −1 dBTP is the EBU R 128 ceiling everyone is checking
against and it should not be hardcoded in every UI.

**Why it is opt-in, measured** over 5 minutes of 48 kHz stereo:

```
  truePeak: false    207 ms    1.84 us/block    1449x realtime
  truePeak: true    2188 ms   19.45 us/block     137x realtime
```

**10.6×** — it costs more than everything else in the meter put together, and
more than the entire loudness path. With `truePeak: false` nothing new runs:
no detector is allocated and the reserved slot is not written.

**The two meter-specific optimisations were measured and neither was taken.**
Best of five over 60 s of 48 kHz stereo, per detector call:

```
                       loud     quiet    sparse
  shipped (modulo)     1.00x    1.00x     1.00x
  walking index        0.88x    0.97x     1.19x
  + "cannot win" bound 0.58x    0.85x     1.88x
```

Replacing the ring's modulo with a decrementing index is **slower** on the loud
material people actually meter — V8 handles the constant modulus better than the
branch handles the loop. The `windowMax · Σ|taps|` early-out is rigorous and
costs one window scan, and it only pays on material that is mostly near-silence:
it loses 42 % on loud audio. Neither goes into the shared module, so
`lookahead-limiter`'s DSP is unchanged.

Also not taken: ryukau's SOCP-optimised 7-tap filter at ~7× less cost, and 8×
oversampling offline. "dBTP" conventionally means the 4× estimate, and an
offline number that disagreed with the realtime one would be a support burden
dressed as precision.
