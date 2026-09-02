---
"@synthlet/adsr": patch
---

`AdsrAmp` no longer dies when nothing is connected to its input. It passed
`inputs[0][0]` straight into the DSP, which indexes it per sample, so an
inactive input - an empty channel array, per spec - threw a `TypeError`. An
uncaught throw in `process()` is terminal: the node emits `processorerror` and
outputs silence for the rest of its life. Three ordinary things triggered it:
building the graph before connecting a source, an upstream oscillator or buffer
source ending or being `stop()`ed, and `disconnect()`ing a source to reuse the
amp.

An unconnected input now reads as silence, the same way `@synthlet/ad` already
handled it. The envelope keeps advancing while the input is inactive, so a gate
opened during silence starts its attack on time rather than late by however long
the input was gone.

Also in this release: the ADSR's test suite now covers modulator mode, legato
retrigger, zero-length stages and the attack's timing.
