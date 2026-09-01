# @synthlet/param

> Control audio parameters with unit conversion.

Part of [Synthlet](https://github.com/danigb/synthlet)

`Param` also has shortcuts for the common conversions: `Param.db(ac, db)`
(decibels to gain), `Param.lin(ac, input, min, max)` (a `0…1` input scaled to
`min…max`) and `Param.inv(ac, input)` (sign inversion).
