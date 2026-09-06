---
"@synthlet/wavetable-oscillator": minor
---

Hard sync: a band-limited `sync` gate, and two samples of latency.

New `sync` parameter, `0…1`, default 0, **a-rate**. A rising edge restarts the
table read at the `phase` construction option, at the sub-sample instant the
gate crossed zero. It is a-rate where every other gate in the library is k-rate
because a reset rounded to a render quantum is 2.9 ms of jitter at 44.1 kHz.

```ts
const master = PolyblepOscillator(ac, { frequency: 110 });
const slave = WavetableOscillator(ac, { frequency: 275, sync: master });
```

**Breaking: the node now has two samples of output latency** — 45.4 µs at
44.1 kHz, the same as `@synthlet/polyblep-oscillator`, so the library's two
oscillators stay aligned with each other. It is paid whether or not anything is
connected to `sync`, because a latency that changed when a cable was plugged in
would step the output mid-note. A caller using the DSP unit directly with no
`sync` input keeps the zero-latency path, bit for bit.

The latency buys the correction, and it was measured before it was taken rather
than copied from the sibling package. A reset is a step _and_ a corner in the
output, both band-limited with the shared 4-point B-spline BLEP and BLAMP
kernels. Alias SNR with a sawtooth master into a mipmapped sawtooth slave:

| master  | ratio | naive reset | corrected   |
| ------- | ----- | ----------- | ----------- |
| 110 Hz  | 1.5   | 32.0 dB     | **49.6 dB** |
| 110 Hz  | 2.73  | 29.6 dB     | **53.9 dB** |
| 440 Hz  | 1.5   | 20.9 dB     | **52.9 dB** |
| 440 Hz  | 2.73  | 18.6 dB     | **49.7 dB** |
| 1760 Hz | 1.5   | 14.3 dB     | **46.8 dB** |
| 1760 Hz | 2.73  | 11.6 dB     | **40.1 dB** |

17.6 to 33.9 dB, within 0.5 to 14.8 dB of an 8× oversampled reference. Both
kernels are needed: at the classic half-integer sync ratios a wavetable reset
has _no_ step at all — a sawtooth's value half a cycle in equals its value at
zero — and the entire gain is the corner correction's.

The reset is deliberately **not** run through the 64-sample declick the morph
and table swaps use. Above `sampleRate / 64` the ramp never finishes between
edges and stops being a declick: at a 1760 Hz master it takes the peak from 0.96
to 0.32 and leaves the alias SNR at 14.4 dB.
