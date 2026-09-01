---
"synthlet": patch
---

The drums are retuned for the AD envelope's new seconds (see `@synthlet/ad`).
Every constant was set by ear against the old conversion, so each one is
converted by the factor that preserves its time constant rather than picked
again: the envelopes have the same rise and the same decay length they had.

The drums' own `decay` knob is unchanged - still 0...1, still meaning what it
meant. The conversion happens between the knob and the envelopes.
