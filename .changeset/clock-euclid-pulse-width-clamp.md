---
"@synthlet/clock": patch
"@synthlet/euclid": patch
---

`pulseWidth: 1` no longer latches the gate on forever.

It is inside the declared range and it disabled the module: against a `[0, 1)`
phase, a width of 1 is a gate that never falls, and under the library's gate
contract a gate that never falls can never trigger anything again. Measured, 400
of 400 blocks high — one envelope attack, then silence. `Euclid` declares the same
parameter with the same range and failed the same way, one step down.

Both now cap the width to leave one render quantum of every cycle low, so
`pulseWidth: 1` means **the widest gate that still retriggers** — which is what
someone asking for 1 wants. The cap is tempo-aware, because a static one cannot
be: 0.9941 at 120 BPM, 0.9512 at 1000 BPM. Nothing below 0.95 changes by a sample
at any tempo in range.

`pulseWidth: 0` is unchanged — it still means no gate at all, and it was always
the honest end of the range.
