---
"@synthlet/ad": patch
"@synthlet/adsr": patch
"@synthlet/arp": patch
"@synthlet/clip-amp": patch
"@synthlet/lfo": patch
"@synthlet/noise": patch
"@synthlet/param": patch
"@synthlet/polyblep-oscillator": patch
"@synthlet/state-variable-filter": patch
---

Fix parameter ranges. Now that `X.descriptors` is public, every `minValue` and
`maxValue` is a hint to whoever builds a UI, and several were wrong.

**Enum-typed parameters no longer advertise values their enum doesn't have.**
A slider built from `Lfo.type`'s range offered 0…100 for an 11-member enum.
Each maximum is now the enum's highest member: `Noise.type` 1, `Lfo.type` 10,
`ClipAmp.type` 1, `Svf.type` 6, `Param.scale` 3. Values above those were never
valid enum members - the processors already fell back to the first type - so
this only stops you setting a number that did nothing.

**`PolyblepOscillator`'s `detune` is bipolar**: `-1200…1200` cents (±1 octave),
where it was `0…10000`. Detuning _down_ was impossible: the `AudioParam`
clamped every negative value to 0, so an LFO patched into `detune` produced an
upward-only half-wave instead of vibrato. **Breaking** if you set a detune
above 1200 cents; use `frequency` for intervals wider than an octave.

**`AdEnv`/`AdAmp` and `AdsrEnv`/`AdsrAmp` share one range for `gain` and
`offset`**, both `-20000…20000`. The two packages compute the same
`value * gain + offset` and disagreed on its bounds: `AdEnv` could not invert
an envelope (`gain` was `0…10000`) and neither could offset one downwards.
Both are widenings.

**`AdsrEnv`/`AdsrAmp`'s `release` maximum is 10 seconds**, matching `attack`
and `decay`, where it was 100. **Breaking** for a release longer than 10 s.

**`Arp`'s `baseNote` maximum is 127**, the MIDI note range, where it was 200.

`Param`'s `input`, `offset`, `min`, `max`, `gain` and `mod` keep `±20000`: a
`Param` carries whatever value its destination needs and has no natural range.
Its README now says so.
