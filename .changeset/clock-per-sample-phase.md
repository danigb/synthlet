---
"@synthlet/clock": minor
---

Render the phase and the gate per sample, from one accumulator.

The clock used to advance its phase by a whole render quantum and fill the block
with a single number, so the "0…1 rising ramp" was a 172-step staircase at 120 BPM
and 44.1 kHz and every edge was quantised to 2.90 ms. Three things follow from the
fix, all measured:

- **jitter drops from one render quantum to one sample** — deviation from ideal
  beat time is now ≤ 23 µs, against 2.90 ms, with no cumulative drift either way;
- **`Clock.gate` and a `Euclid` on the same clock land on the same sample.** They
  were 128 samples apart, so a kick and a hat layered from one clock flammed;
- **fast subdivisions stop dropping steps.** 600 BPM × subdivision 20 gave 579 of
  800 hits and 1000 BPM × 20 gave 76 of 1333; both are now exact.

The phase is `[0, 1)` and no longer emits a one-block plateau at exactly `1.0`.
Anything reading that plateau as a beat marker should read `.gate` instead, which
is the supported way and predates this change.

Costs +0.23 µs per block worst case — under 0.01 % of one core. See
`benchmarks/clock-rate/`.
