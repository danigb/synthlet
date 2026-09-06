---
"@synthlet/wavetable-oscillator": minor
---

`frequency` is in Hz, and `baseFrequency` is gone. **Breaking.**

The increment was `frequency / baseFrequency`, so the pitch was
`frequency / baseFrequency × sampleRate / length`. For `frequency` to mean Hz,
`baseFrequency` had to equal `sampleRate / length` — and nothing set it, so it
stayed at its default of 220 and the oscillator played a constant offset flat or
sharp depending on the table: **+777 cents at length 128, −423 at 256 (the
`loadWavetable` default), −1623 at 512, −4023 at 2048.** The docs page has said
"the frequency of the oscillator in Hz" since the initial release.

The increment is now `frequency × length / sampleRate`, derived inside the
worklet. `sampleRate` is a worklet global and `length` arrives with the table,
so both were already there; the parameter existed only because the expression
needed a denominator, and its one correct value was never a value a caller could
know. Measured after the change: 440 Hz requested reads 440.014 Hz from a 128-,
256-, 512- and 2048-sample table alike, and the worst error over twelve pitches
at 44.1 kHz and 48 kHz is 0.7 cents — which is the analyser's bin spacing, not
the oscillator.

**What to do:** remove `baseFrequency` if you set it, and expect the pitch you
ask for. To play a table at a deliberate ratio rather than a pitch, multiply
`frequency`; a `detune` parameter in cents is coming.

The increment's ceiling moved with the formula, from `length / 4` to `length / 2`
— the table read at Nyquist. Under the new expression the old ceiling would have
capped every request above `sampleRate / 4` (11025 Hz at 44.1 kHz), so 20000 Hz,
the declared maximum, would have arrived 1031 cents flat.

`Wavetable` also loses its `sampleRate` field, which was fetched and then dropped
in transit. A single-cycle table has no meaningful sample rate — `length` samples
are one cycle whatever the file's header says — and the pitch comes from the
context's rate. `WavetableLoader.decodeWavetable` still reports it.
