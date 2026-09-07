---
"@synthlet/state-variable-filter": patch
"@synthlet/lookahead-limiter": patch
"@synthlet/polyblep-oscillator": patch
"@synthlet/wavetable-oscillator": patch
---

One spelling for reading an `AudioParam` array: the hoisted `length > 1` check, written
down next to `ParamDescriptor` in the module contract every package carries.

The library had three spellings of one rule and none of them written anywhere a package
author would look. `length === blockLength` is the fragile one: it agrees with `length > 1`
whenever the block being rendered is a whole render quantum, and is silently wrong the
moment a DSP renders a **sub-block**. `karplus-strong` splits a block at each trigger edge
and renders the segments between them, and `virtual-analog-filter` now renders one segment
per distinct cutoff, so in a 40-sample segment a 128-sample parameter has
`length !== blockLength` and would be read once and held.

No behaviour changes in any shipped configuration. The two tests are the shape of the
argument: `karplus-strong` renders correctly when a trigger edge splits a block and
`frequency` arrives as a single value, and the same when it arrives per sample.

`wavetable-oscillator` gains one real improvement from the change. Its stochastic barriers
were tested for presence rather than substituted with a stand-in, partly because under
`length === n` a one-element stand-in _was_ a-rate whenever the block was one sample long,
and the stage would engage on an input nobody supplied. `length > 1` is never true of a
stand-in, so that hazard is gone.
