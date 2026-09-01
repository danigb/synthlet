---
"@synthlet/param": minor
---

Add `Param.lin(ac, input, min, max)`: a `Param` with `ParamScaleType.Linear`,
mapping a `0…1` input onto `min…max`. Arguments follow the other statics -
context, then the signal, then its configuration - so
`Param.lin(ac, tone, 20, 100)` reads "tone, scaled to 20…100".
