# @synthlet/granite

## 0.2.0

The engine is rewritten. granite was a stutter effect wearing a granular name —
four parameters, no grain duration, no pitch, no freeze, a 16-slot pool of fixed
200 ms buffers, and a phasor advanced once per render quantum, so at most one
grain could start per 128 samples. It is now a granular **delay**: a
tapped-delay-line granulator over `scripts/_delay.ts`, the third delay in the
library alongside `digital-delay` and `analog-delay`, split from them on what the
read head does.

### Breaking Changes

- **`speed`, `density` and `spread` are removed.** Nothing maps onto them.
  `speed` and `density` conflated the emission rate with the grain length, which
  are now the two independent parameters `rate` (0–2000 grains/s, against an old
  structural ceiling of 30) and `duration` (1–1000 ms, against a hard-coded 200).
  `spread` was a smear of the read position and is now three separate controls:
  `position`, `spray` and `panSpread`.
- **`wet` now defaults to 1**, where it defaulted to 0.5, so the module's own
  sound is what you hear first. 0 is an exact bypass, sample for sample.
- **No existing patch reproduces, and there is no compatibility mode.** This is
  not a conservative rewrite that kept the sound: the old module's defining
  characteristics were defects. Its Hann window was normalised by `length/sum`,
  which is ×2, so every grain was +6 dB before sixteen of them overlap-added; its
  per-grain high-pass state was never reset, so grain _n_'s tail leaked into
  grain _n+16_; and playback picked a random slot from the pool that might hold
  silence or arbitrarily stale audio. There is nothing there to preserve.

### Minor Changes

- **Eighteen parameters**, every one an `AudioParam` and every one k-rate. The
  new ones are `duration`, `durationSpread`, `position`, `spray`, `pitch`
  (±24 semitones), `pitchSpread`, `reverse`, `shape`, `pan`, `panSpread`,
  `level`, `levelSpread`, `jitter`, `intermittency`, `freeze` and `feedback`.
- **Truax's `(centre, spread)` control model.** Every per-grain quantity is a
  pair, drawn once at the grain's activation and never re-read. Every spread
  defaults to 0, where the module is deterministic and bit-identical to the
  module without that feature in it.
- **A real scheduler and a real pool.** A per-sample interonset counter sustains
  the full 2,000 grains/s, against a previous structural ceiling of
  `sampleRate/128`. 64 preallocated grains, a free-list, and a documented
  overflow policy: no free grain, no grain — never steal one that is playing.
- **`freeze` stops the write head**, so the last few seconds become a playable
  object, with a 100-sample raised-cosine fade on the release so the splice does
  not click.
- **`feedback` up to 0.95**, through a `tanh` saturator blended in by the setting
  and a one-pole high-pass whose corner rises with it. With `pitch` up it stacks
  transpositions.
- **Three construction options**: `maxGrains` (64), `bufferSeconds` (4) and
  `seed` (`0x9e3779b9`). Two nodes given the same seed produce the same cloud.
- **The first tests this package has had** — 70 of them, every threshold from a
  ticket's Success Criterion with the measured value beside it, and the three
  that could not be met as written recorded with their reason. See the README's
  "Measured quality".
- **Attribution.** `THIRD-PARTY-LICENSES.md` now records what this engine drew on
  — Bencina 2001, Truax 1986/1988/1994, Roads 2001 and Roads et al. 2021, and
  Mutable Instruments Clouds read as a worked example and re-derived. No
  third-party source was copied.

## 0.1.0

Initial release
