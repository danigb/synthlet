---
"@synthlet/virtual-analog-filter": patch
---

Describe the filter that now exists.

The README sold "nine classic analog filter circuits, each with the
nonlinearity and the resonance behaviour that make it recognisable". There are
five circuits — the Oberheim SEM is one filter read at four taps — and three of
the nine responses have no nonlinearity at all. Neither claim was dishonest;
they are what happens when the wrapper is audited three times and the circuits
never are.

It now says: five circuits and nine responses, with a table giving each one's
order and whether it saturates; `frequency` in Hz with the bounded prewarping
named; `drive`, including plainly that on `KORG35_*` it is input gain and
nothing more; the makeup gain, so nobody is surprised that resonance no longer
ducks; and where self-oscillation starts. The measured corner of each model is
in the README, because the corner sits where the topology puts it and that is
worth saying rather than leaving to be discovered.

The a-rate section is kept as it was. It is about `worklet.ts`, which is the
half of this package that had been audited, and every claim in it was true.

Credits now distinguish the three circuit files that are still Faust
transcriptions from the two ladders, whose linear cores still are and whose
saturating feedback paths are not.

The demo was patching a **5 kHz sawtooth** through the filter at
`frequency: 2000` — a source that high is what you choose when you tune by ear
against a filter whose corner is really 30 Hz. It is a 110 Hz sawtooth at an
800 Hz cutoff now, with a `drive` slider, and the type list says which models
saturate and which four are taps of the same filter.
