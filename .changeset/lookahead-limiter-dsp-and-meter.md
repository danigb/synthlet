---
"@synthlet/lookahead-limiter": minor
---

A `./dsp` subpath, and a gain reduction readout.

**`@synthlet/lookahead-limiter/dsp`** publishes the pure core — `createLimiter`,
`createTruePeakDetector`, `latencySamples` and the true-peak constants — with no
worklet globals anywhere in it. `@synthlet/level-meter` is its first consumer:
its true-peak measurement is this package's 48-tap interpolator rather than a
second implementation, so the limiter's ceiling and the meter's reading agree
**by construction**. Two detectors disagreeing by 0.2 dB is a worse outcome
than 48 multiply-accumulates.

**`{ meter: true }`** reports how hard the limiter is working. A limiter that is
working well is one you cannot hear working, which is what made the effect of
`gain` hard to judge and the demo hard to read:

```ts
const limiter = LookaheadLimiter(ac, { threshold: -1, meter: true });

limiter.getLevels().gainReduction; // dB: 0 doing nothing, -6 took 6 dB off
limiter.subscribe((levels) => draw(levels.gainReduction));
```

The reading is the block's largest reduction — `20·log10` of the smallest gain
applied in it — which is what "how hard is it working _now_" means at 60 Hz. The
gain was already computed per sample and `dsp.ts` already handed it back through
`gainOut`, so metering reads that number rather than recomputing it: no change to
the DSP at all, one compare per sample, one post per frame.

It travels over the transport `@synthlet/level-meter` publishes, shared by copy
as `scripts/_levels.ts`: a versioned slot layout, shared memory where the page
is cross-origin isolated and `postMessage` where it is not, a monotonic
`version`, and a `subscribe` that fires at most once per animation frame. So the
meter's canvas renderer draws this with no adapter —

```ts
new LevelMeterUI({ mode: "reduction", minDb: -20 }).attach(canvas, limiter);
```

— and a React hook written with `useSyncExternalStore` against one reads the
other unchanged. `limiter.transport` says which half is carrying it, and is
`undefined` while the meter is off, because then nothing is.

**Off by default**, for the same reason `truePeak` and `loudness` are next door:
a limiter sits at the end of every master chain and most of them have nothing
attached to read this, so a processor posting at 60 Hz to nobody is waste. With
`meter: false` nothing is allocated for it and the port is never touched.

Nothing about the limiting changed. `threshold`, `release`, `gain`, `lookahead`
and `latencySamples` behave exactly as before, and an unmetered limiter hands its
processor byte-for-byte the options it always did.
