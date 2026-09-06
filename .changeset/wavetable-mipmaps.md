---
"@synthlet/wavetable-oscillator": minor
---

Band-limit the wavetable oscillator with mipmaps.

Every wavetable now carries a mipmap pyramid — one level per octave, each level
the same planes band-limited to half the harmonics of the level below it, all at
the base plane length — and the oscillator selects the level from the read
increment and **crossfades the two nearest levels**, so a pitch sweep never steps
its harmonic content at an octave boundary.

Alias SNR on a 256-sample sawtooth, measured: 32.3 → 48.4 dB at 220 Hz,
23.7 → 57.4 dB at 440 Hz, 18.3 → 66.1 dB at 880 Hz, 13.9 → 74.5 dB at 1760 Hz and
10.4 → 82.1 dB at 3520 Hz.

The pyramid is built on the main thread at load and transferred to the worklet,
so the published payload is unchanged. Generated tables get their levels by
truncating the harmonic series; tables that arrive as samples get theirs by
analysing and truncating that. `Wavetable` grows an optional `levels`, and
`setWavetable` builds the pyramid for anything handed to it without one.
