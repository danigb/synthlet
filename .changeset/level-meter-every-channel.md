---
"@synthlet/level-meter": patch
---

Pass every channel through, keep decaying on an unconnected input, and make
`maxChannels` mean what it says. Three defects that shared four lines.

- **The pass-through silently muted channels 9 and up.** `chOut.set(chIn)` lived
  inside a loop capped at a hardcoded 8, so a 9-channel signal came out of a node
  the README describes as passing audio through untouched with channels 8–15
  silent.
- **Peaks froze when the input was disconnected.** An unconnected input arrives
  as an empty `inputs[0]`, and the decay lived inside the measurement loop — so
  the loop body never ran and the meter held its last reading for the life of the
  `AudioContext` instead of falling to −∞.
- **`maxChannels` was wrong in both directions.** The factory defaulted it to 16
  and sized the buffer accordingly while the processor hard-capped at 8; in the
  other direction `maxChannels: 2` with a 6-channel input wrote past the end of a
  2-element view, which a TypedArray discards silently. And `maxChannels: 0`
  became 16 through an `||`, which is a bug hiding as a default.

The three were one insight, not three: how many channels to copy, how many to
measure and how often to decay are different numbers. Copy is **all** of them —
the node has no business dropping audio. Measure is what the buffer holds.
Decay runs **every block**, over every slot, whatever the channel count is,
including zero.

`maxChannels` is now validated: an integer from 1 to 32, and a `RangeError`
naming the option for anything else, rather than a `SharedArrayBuffer`
complaint about a negative length.
