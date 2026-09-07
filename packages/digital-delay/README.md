# @synthlet/digital-delay

> A stereo feedback delay whose loop filters, diffuses and saturates

Part of [Synthlet](https://github.com/danigb/synthlet)

Web Audio has a `DelayNode`, so the delay line itself is solved. What it cannot
do is put that line in a loop. The spec allows a cycle in the graph only if the
cycle contains a `DelayNode`, and that node's effective delay is clamped to at
least one render quantum — **128 samples, 2.90 ms at 44.1 kHz**. Below that
floor nothing is expressible: no flanger, no comb resonance, no tight slapback.
Above it, a hand-built `DelayNode → GainNode → DelayNode` loop still gives you a
bare scalar in the feedback path — no filter, no saturation, and no say in what
happens when you move the delay time while audio is in the line.

This is one worklet with one algorithm, eight continuous parameters and no
modes. Every parameter is an `AudioParam`, so every one is a CV destination.

**"Digital" here means only "the one that isn't analog."** It is a clean modern
delay, not a model of a PCM42 or an SDE-3000 — none of their converters,
filters or quirks are simulated. Its defining behaviour is that **changing
`time` preserves pitch**: the read head hands over to a second head and
crossfades rather than gliding. The other half — tape and bucket-brigade, where
moving the knob bends pitch because time and bandwidth are physically coupled —
is a different instrument with a different parameter surface, and it is
[`@synthlet/analog-delay`](https://github.com/danigb/synthlet/tree/main/packages/analog-delay).
If you came here wanting tape echo, that is the one.

## Install

```bash
npm install @synthlet/digital-delay
```

## Usage

```ts
import {
  DigitalDelay,
  registerDigitalDelayWorklet,
} from "@synthlet/digital-delay";

await registerDigitalDelayWorklet(audioContext);

const delay = DigitalDelay(audioContext, {
  time: 0.25, // seconds
  feedback: 0.5,
  mix: 0.3,
  tone: -0.3, // darken each repeat
  cross: 1, // ping-pong
  diffuse: 0.4,
});

source.connect(delay).connect(audioContext.destination);

delay.time.value = (60 / 120) * 0.75; // a dotted eighth at 120 BPM
```

There is no tempo-sync parameter. `time` is a number in seconds and an
`AudioParam`: work the beat division out, or drive it from a node. That is the
library's own thesis rather than a shortcut.

## Parameters

| Param      | Default | Min    | Max | Rate   | Meaning                                                                                               |
| ---------- | ------- | ------ | --- | ------ | ----------------------------------------------------------------------------------------------------- |
| `time`     | 0.25    | 0.0002 | 2   | k-rate | Delay time in seconds. The range spans flanger (0.2 ms) through comb resonance to a long echo         |
| `feedback` | 0.4     | 0      | 1.2 | k-rate | Loop gain. **Above 1 is intentional**: self-oscillation is a destination, bounded by the limiter      |
| `mix`      | 0.3     | 0      | 1   | k-rate | Dry/wet                                                                                               |
| `tone`     | 0       | −1     | 1   | k-rate | Tilt on the **feedback path**, not the output. Negative darkens each repeat, positive thins it        |
| `mod`      | 0       | 0      | 1   | k-rate | Depth of a 0.7 Hz, 3 ms excursion of the read pointer — vibrato, chorus or flange depending on `time` |
| `spread`   | 0       | 0      | 1   | k-rate | L/R time offset as a ratio. 0 is mono-compatible, 1 makes the right line twice the left               |
| `cross`    | 0       | 0      | 1   | k-rate | Feedback cross-feed. 0 is two independent lines, 1 is full ping-pong                                  |
| `diffuse`  | 0       | 0      | 1   | k-rate | Schroeder allpasses in the loop. 0 is discrete repeats, 1 is a wash                                   |

One construction option, `maxTime` (default 2 s), sizes the buffers. It is not
an `AudioParam` because it allocates: two lines at the default cost about 1 MB.

Four things the table cannot carry:

- **`spread` and `cross` are two parameters, not one.** They are independent
  axes — the L/R time relationship and the feedback matrix. Folded into a single
  "stereo" morph, the midpoint means nothing: at 0.7 you could not tell whether
  you had offset, cross-feed, or some of each.
- **`mod` is not an LFO on `time`.** Moving `time` sets a new _target_, which
  hands over to a second read head and preserves pitch by construction. `mod`
  moves the pointer _within_ the current head, which bends it. An `Lfo` into
  `time` gives you continuous handovers, not vibrato — a different, and also
  useful, effect.
- **The feedback path always has three things in it**, whatever `tone` says: the
  tilt, a high-pass whose corner rises with `feedback` so sub-bass cannot pile
  up, and a soft limiter so the loop cannot run away. The last two are stability
  rather than tone, and they are what make `feedback = 1.2` a musical limit
  cycle instead of a clip.
- **`diffuse` puts allpasses in the loop**, so above 0 the loop is 142 + 379
  samples longer than `time`. At 0 they are bypassed exactly.

## Measured quality

Each of these is an assertion in `src/dsp.test.ts`, with the measured value in
a comment beside its threshold.

| What                              | Measured                                                    |
| --------------------------------- | ----------------------------------------------------------- |
| Feedback below one render quantum | `time = 0.001` with `feedback = 0.7` combs at 979 Hz        |
| `feedback = 1.2` over 60 s        | peak 0.78, still oscillating, no NaN and no denormal stall  |
| Pitch through a `time` sweep      | median 440.4 Hz where a glide would read 733 Hz             |
| Clicks on a `time` sweep          | largest step 0.065, against 0.100 with nothing moving       |
| `tone = −1`                       | repeat centroid 11169 → 556 Hz over five repeats, monotone  |
| `tone = 0`                        | 1.2% drift over five repeats, from the stability high-pass  |
| Mono compatibility                | L and R are bit-identical at `spread = 0, cross = 0`        |
| `cross` decay-neutrality          | RT60 2.500 – 2.545 s across `cross` 0 → 1, a spread of 1.8% |
| `diffuse` echo density            | 0.0099 → 0.1903 across five settings, monotone, no step     |

## Attribution

Original, derived from published descriptions:

| What                           | Citation                                                                                                                |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| The rotation feedback matrix   | Schlecht & Habets, _On Lossless Feedback Delay Networks_, IEEE TSP 2017 — the N = 2 case of their characterisation      |
| Hermite fractional reads       | Niemitalo, _Polynomial Interpolators for High-Quality Resampling of Oversampled Audio_, 2001                            |
| Allpass diffusion              | Dattorro, _Effect Design Part 1: Reverberator and Other Filters_, JAES 1997                                             |
| Feedback high-pass and limiter | Mutable Instruments Clouds (`granular_processor.cc`) — `fc = 20 + 100·feedback²`, and the cubic `x(27 + x²)/(27 + 9x²)` |
| Delay-line structure           | Mutable Instruments `stmlib::DelayLine`                                                                                 |

See the repository's
[THIRD-PARTY-LICENSES.md](https://github.com/danigb/synthlet/blob/main/THIRD-PARTY-LICENSES.md).

## License

MIT © [Daniel Gómez Blasco](https://github.com/danigb)
