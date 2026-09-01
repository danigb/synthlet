# @synthlet/param

> Control audio parameters with unit conversion.

Part of [Synthlet](https://github.com/danigb/synthlet)

`Param` also has shortcuts for the common conversions: `Param.db(ac, db)`
(decibels to gain), `Param.lin(ac, input, min, max)` (a `0…1` input scaled to
`min…max`) and `Param.inv(ac, input)` (sign inversion).

`input`, `offset`, `min`, `max`, `gain` and `mod` all accept `±20000`. Unlike a
module's own parameters, those bounds are a safety limit rather than a hint
about what to put in a slider: a `Param` carries whatever value its destination
needs - a frequency in Hz, a level in dB, a time in seconds - and has no
natural range of its own. `scale` is the exception; it selects a
`ParamScaleType` and is bounded by the enum.
