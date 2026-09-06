# @synthlet/wavetable-oscillator

## 0.2.0

### Breaking Changes

- `baseFrequency` is removed. `frequency` now means Hz, derived correctly at
  every table length; before this release it was up to 423 cents flat at the
  shipped defaults
- `morphFrequency` and the built-in morph phasor are removed. `morph` is a new
  a-rate parameter, `0`–`1`, that selects a wavetable position directly — an
  `Lfo` connected to it replaces the internal phasor at any rate and any shape
- `frequency` and `detune` are now a-rate and `frequency` is bipolar: a
  negative value runs the read pointer backwards, which is through-zero FM

### Minor Changes

- The oscillator generates its own wavetable set at construction and is
  audible immediately, with no network fetch
- `setHarmonics` builds a wavetable from harmonic magnitude spectra
- Mipmapped, band-limited tables: one level per octave, crossfaded between
  levels
- Imported wavetables are conditioned on load — DC removal, canonical phase
  alignment, loudness matching
- The WAV loader is rewritten: chunk-aware parsing, float and
  `WAVE_FORMAT_EXTENSIBLE` support, an overridable `catalog`, and rejections
  instead of silent corruption
- `phase` construction option and `sync` (hard sync, band-limited, two samples
  of latency)
- Stochastic mode: `segments`, `pitchChaos`, `pitchSpread`, `ampChaos`,
  `ampSpread`, and the `pitchPerSegment` construction option

## 0.1.0

- Initial release
