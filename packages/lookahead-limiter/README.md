# @synthlet/lookahead-limiter

> A true-peak brickwall limiter for a master bus

Part of [Synthlet](https://github.com/danigb/synthlet)

The last node before the destination. It looks ahead by a couple of
milliseconds, so it can bring the gain down _before_ a peak arrives rather than
reacting after it, and it measures peaks on a 4× oversampled reconstruction —
so a signal that never exceeds full scale sample-by-sample, but overshoots
between samples, is still caught.

## Install

```bash
npm i @synthlet/lookahead-limiter
```

Or `npm i synthlet` for every module at once.

## Usage

```ts
import {
  registerLookaheadLimiterWorklet,
  LookaheadLimiter,
} from "@synthlet/lookahead-limiter";

const ac = new AudioContext();
await registerLookaheadLimiterWorklet(ac);

const limiter = LookaheadLimiter(ac, {
  threshold: -1, // dBTP ceiling
  release: 168, // ms, 10-90% recovery
  gain: 6, // dB of drive, applied *before* the detector
  lookahead: 2, // ms - construction-time, sizes the delay line
});

source.connect(limiter).connect(ac.destination);

limiter.threshold.value = -3; // an AudioParam: automatable
limiter.latencySamples; // 102 at 48 kHz with 2 ms of lookahead
```

## Parameters

| Parameter   | Type                  | Unit                 | Range     | Default |
| ----------- | --------------------- | -------------------- | --------- | ------- |
| `threshold` | `AudioParam` (a-rate) | dBTP                 | −24 … 0   | −1      |
| `release`   | `AudioParam` (k-rate) | ms (10-90% recovery) | 10 … 1000 | 168     |
| `gain`      | `AudioParam` (a-rate) | dB (input drive)     | −12 … 24  | 0       |
| `lookahead` | construction option   | ms                   | 0.5 … 5   | 2       |
| `meter`     | construction option   | boolean              | —         | `false` |

Three things the table cannot carry:

- **`gain` is a drive, not a makeup gain.** It is applied before both the
  detector and the delay line. A makeup gain multiplies the output _after_ the
  ceiling is enforced, which would destroy the guarantee outright — so there
  isn't one.
- **`release` is the 10-90% recovery span**, not a time constant. A limiter
  labelled under the "sum of the two time constants" convention takes about
  1.7× longer to recover than its number says; this one does not.
- **Automating `threshold` downward** takes `lookahead` samples to reach the
  smoothed gain, though the arithmetic backstop reads the current value, so the
  hard bound holds instantly.

Below the threshold the limiter is a bit-exact passthrough, delayed — not
"almost unity". A channel that appears mid-stream starts from a zero-filled
delay line, so it fades in over `latencySamples`.

## Showing the gain reduction

A limiter that is working well is one you cannot hear working, which makes the
demo of one hard to read and the effect of `gain` hard to judge. `meter: true`
publishes how hard it is working:

```ts
const limiter = LookaheadLimiter(ac, { threshold: -1, meter: true });

limiter.getLevels().gainReduction; // dB: 0 doing nothing, -6 took 6 dB off
const stop = limiter.subscribe((levels) => draw(levels.gainReduction));
```

The reading is the block's largest reduction — `20·log10` of the smallest gain
applied in it — which is what "how hard is it working _now_" means at 60 Hz. The
gain is already computed per sample, so the cost of exposing it is one compare
per sample and one post per frame.

**It is the same contract `@synthlet/level-meter` publishes**, from the same
`scripts/_levels.ts` copied into both packages: a versioned slot layout, shared
memory where the page allows it and `postMessage` where it does not, a
monotonic `version`, and a `subscribe` that fires at most once per animation
frame. So the meter's canvas renderer draws this with no adapter —

```ts
import { LevelMeterUI } from "@synthlet/level-meter";

new LevelMeterUI({ mode: "reduction", minDb: -20 }).attach(canvas, limiter);
```

— and a React hook written with `useSyncExternalStore` against one reads the
other unchanged.

**Off by default.** Nearly free is not free, a limiter sits at the end of every
master chain, and most of them have nothing attached to read this. With
`meter: false` the processor allocates nothing for it and never touches the
port.

## Latency

`latencySamples` is the lookahead window plus the detector's group delay (6
samples), and `latencyTime` is the same figure in seconds. Web Audio has no
automatic delay compensation, so if any dry signal is mixed in parallel with
the limiter it must be delayed by this much by hand:

```ts
const dry = new DelayNode(ac, { delayTime: limiter.latencyTime });
```

## Credits

Original, re-derived from published algorithm descriptions:

- Hämäläinen, [_Smoothing of the Control Signal without Clipped Output in
  Digital Peak
  Limiters_](https://www.dafx.de/paper-archive/2002/papers/DAFX02_Hamalainen_smoothing_control_signal.pdf),
  DAFx-02, §3.5 — the gain-smoothing structure.
- [ITU-R BS.1770-4](https://www.itu.int/rec/R-REC-BS.1770), Annex 2 — true-peak
  measurement. The detection here is BS.1770-_style_ 4× true-peak: the
  interpolator is a 48-tap Hann-windowed sinc, **not** the ITU reference
  coefficients, and its accuracy is measured rather than inherited (within
  ±0.1 dB from 60 Hz to 10 kHz at 48 kHz, ±0.35 dB from there to 20 kHz — the
  wider bound near Nyquist is the 4× grid, which every BS.1770 4× detector
  shares).

The release cascade is in neither source; it is derived from five requirements
recorded in `src/dsp.ts`.

See the repository's
[THIRD-PARTY-LICENSES.md](https://github.com/danigb/synthlet/blob/main/THIRD-PARTY-LICENSES.md).

## License

MIT © [danigb](https://github.com/danigb)
