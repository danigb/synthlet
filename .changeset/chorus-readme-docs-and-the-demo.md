---
"@synthlet/chorus": patch
---

Describe the chorus that now exists, and retire the licence notice.

Every document about this package described the labels rather than the
behaviour, so all of them were wrong about all four parameters. The README's
table said `delay` was "where the moving read position is centred" and
`deviation` was "how far the voices are spread apart in phase and rate";
measured, those were the mix and the LFO rate. The docs page passed a
`feedback` parameter that has never existed on this module and described the
effect as "implemented in Faust". None of it was dishonest - it is what
happens when documentation is written from a parameter list, and the parameter
list was permuted before anybody read it.

The README keeps its register and replaces its claims. It now has the three
voicings and what each one is _for_, a parameter table in real units with the
per-mode defaults, the detune range in **cents** (the number a musician can act
on: 10.8 at `JUNO`'s defaults, 29.1 at 6 Hz, 20.8 for `ENSEMBLE`), a "Measured
quality" section where every row is an assertion in `dsp.test.ts`, and a
"Sourced numbers" section giving each constant's origin. The detune table is
itself asserted, so it cannot drift from the engine.

The docs page leads with the **migration table**, because anyone with a working
patch has four parameters that all changed meaning at once.

The demo is rebuilt around the voicing selector first and knobs second, because
the voicing is the choice that matters. It runs on a detuned saw stack through
an envelope rather than a single 440 Hz sine - a chorus on one oscillator
demonstrates nothing - and it has a bypass, without which there is no way to
hear the difference the effect makes. Selecting a voicing applies that
voicing's own settings.

**`THIRD-PARTY-LICENSES.md` no longer has a `@synthlet/chorus` entry.**
`dsp/chorus.dsp` carried a `chorus_mono` definition copied from the Faust
distribution, LGPL-2.1-or-later, and it was the only non-MIT file in the
repository. The notice recorded that `chorus_mono` "has no equivalent in
`faustlibraries`", so the copy could not be swapped for a library reference and
the entry had to stay. A hand-written engine removed the reason. The note at
the top singling that file out as the exception is gone with it, and the
repository now has no non-MIT file.
