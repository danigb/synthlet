---
"@synthlet/virtual-analog-filter": patch
---

Recover from a non-finite sample instead of dying.

One `NaN` at the input killed the filter permanently, on all nine models. Every
recursive state update is `state = state + coefficient * something` and
`NaN + anything` is `NaN`, so once one of the `fRec*` arrays was poisoned there
was no input that cleared it — the two saturating models included, because
`Math.max(-1, Math.min(1, NaN))` is `NaN` too. Web Audio has no recovery path:
the node emitted `NaN` or silence for the lifetime of the graph and the only
fix was to rebuild it. An upstream divide by zero, a `GainNode` driven by an
unconnected parameter, or a decoded buffer with a bad sample was enough.

Every circuit now has a `reset()`, and the processor scans each channel's
output block once, after rendering it. If anything is non-finite it resets that
channel's active filter, zeroes the block and invalidates its change-detection
slot, so the next block is a normal one. A click, which is the honest answer to
a signal that was already broken.

The scan is on the _output_, because the input is not the only route in. It is
once per block per channel, and deliberately not at the end of `process()` —
that function takes `from`/`to` bounds and the segment renderer calls it once
per sample on an a-rate sweep. Measured cost of the scan in V8: **+4.0 % on the
Moog ladder and +5.4 % on the Oberheim**, over 200k blocks of 128 samples. The
package measures 0.09–0.35 % of realtime for one voice, so that is about
0.015 % of realtime, and it is stated rather than rounded to zero.

Only the active filter is reset. Each channel keeps an instance of all nine
models so that switching `type` mid-note resumes where that model left off, and
a `NaN` in one channel leaves the other channel's filters alone.
