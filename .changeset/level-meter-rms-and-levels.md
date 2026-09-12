---
"@synthlet/level-meter": minor
---

Add RMS, and `getLevels()` — an accessor that knows the channel count and
answers in dB. `getPeaks()` is deprecated.

**The meter had no average.** `getRms()` was removed in 0.2.0 because it
returned an all-zero `Float32Array` forever; the removal was right and the hole
it left was never filled. Peak alone does not say how loud something is, which
is the question people actually have when they look at a meter.

RMS is a one-pole on the mean square, with its own time constant — 0.6 s to
99 % of a step, K-Meter's average meter, and **not** the peak's release, which
answers a different question. Derived from `sampleRate`, so it settles in the
same time at 44.1, 48 and 96 kHz. One square root per block per channel, not
per sample. Overridable as `rmsMs`. A full-scale sine reads −3.01 dB RMS
against 0 dB peak; silence reads exactly `-Infinity`, because the state is
flushed to zero — again for the reading, not for speed.

**And the accessor made the caller guess.** `getPeaks()` returned a live view of
`maxChannels` entries — 16 by default — and never said how many were live, so
the README's own example had to pass the number separately:
`ui.render(meter.getPeaks(), 2)`. The library knew; it just never wrote it down.

```ts
const levels = meter.getLevels();
levels.channelCount; // 2, from the source
levels.peak(0); // dBFS, -Infinity for silence
levels.hold(0);
levels.rms(0);
levels.clipped(0);
levels.clearClip();
levels.snapshot(); // a plain object, when one has to be kept
```

The same object on every call and allocation-free, so a renderer reads it once
per animation frame without producing garbage. Everything is in dB, because
every consumer converted anyway and having each of them re-derive the
`-Infinity` case is how floor bugs get written; the raw view stays linear.
`truePeak()`, `momentary` and `shortTerm` read `NaN` while their measurement is
off — "not measured" and "silent" are different answers.

`version` advances when the readings change and not when they do not, so a
`useSyncExternalStore` or a Svelte store has something to compare.

`getPeaks()` is kept, marked `@deprecated`, and still returns one linear peak per
slot — it is the only accessor the package has ever had and it is in the
published README. It goes in the next release.

No VU, PPM or K-System scales. They are ballistics presets over the same two
numbers, they need IEC standards nobody owns, and the perceptual question they
reach for is answered properly by loudness. Peak and RMS need no standard to be
correct.
