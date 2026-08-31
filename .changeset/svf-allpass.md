---
"@synthlet/state-variable-filter": patch
---

Fix `SvfType.AllPass`: a missing `break` made it fall through to the bypass coefficients, so all-pass mode passed the input unchanged. It now has unit gain with a 180° phase shift at the cutoff frequency.
