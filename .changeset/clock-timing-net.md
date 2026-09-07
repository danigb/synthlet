---
"@synthlet/clock": patch
---

Correct the README's claim that two `Clock` nodes drift. They hold a constant
offset — the increment is identical, so a clock born 37 blocks late stays 4736
samples behind on the first beat and on the last. Adds the timing net that
measures it, at sample rates where a beat is not a whole number of blocks.
