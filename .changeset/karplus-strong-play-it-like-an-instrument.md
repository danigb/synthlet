---
"@synthlet/karplus-strong": minor
---

`damp`, and a pluck that no longer erases the string. With these and the a-rate
`frequency` that was already there, the gesture vocabulary of a plucked-string
controller is complete: **pluck, damp, re-pluck, slide, legato**.

**A re-pluck adds to a ringing string instead of resetting it.** `pluck` used to
begin by wiping the delay line and every filter state in the loop — the one thing
a real string never does. It does not any more, and the difference is measurable:
re-plucking 300 ms into a ringing note leaves it **11.3 dB louder** than the same
note left alone, and the samples before the re-pluck are unchanged to the bit. A
re-pluck whose `level` is 0 is now exactly a no-op on the ringing string, where
before it would have stopped the note dead.

Clearing the string is a separate thing, and it happens where a string really
does fall silent — the auto-stop — so a fresh note still starts from rest.

**`damp`** (0–1, default 0) is the other hand:

```ts
KarplusStrong(ac, { frequency: 110, decay: 3, damp }); // damp 1: gone in 50 ms
```

It works by **raising the loop's loss**, not by pulling down the output —
Laurson, Erkut, Välimäki and Kuuskankare 2001 keep the loop-filter coefficients
time-varying precisely because "they must be changed, for example, during
attenuation or re-plucking of the string". That distinction is audible: muting
through the loop is the same mechanism as decaying, so a damped string keeps its
own spectral tilt on the way down and dies **dark** — measured 30 ms into a mute,
the 3–10 kHz band loses 46.2 dB where 300–1500 Hz loses 42.5 — where an output
gain would take every frequency down together and sound like a fader.

- At 1 a ringing note is under −60 dBFS in **47–53 ms** at 110, 440 and 1760 Hz.
- The knob is geometric in the decay time, `decay^(1−damp) · 0.05^damp`, so with
  `decay` at 1 s the quarter points measure 0.44, 0.19 and 0.08 s. Adding loss
  linearly instead would have put the whole mute in the bottom fifth of the range.
- Both polarizations are damped: a hand lands on the string, not on one plane of
  it, and at `damp: 0` the second loop's gain is exactly what it was.
- The loop gain is interpolated across the block, so engaging a mute — a factor
  of twenty in one block — is a ramp rather than a step.

**Legato** works and is now asserted: changing `frequency` with no trigger moves
the pitch (measured 220.10 → 329.84 Hz) with no step at the block boundaries.
What made this possible was removing the delay _snap_ from `pluck` for a string
that is already ringing; a new note still starts in tune rather than gliding into
it.

`damp: 0` is bit-identical to the previous release, and a pluck onto a silent
string is unchanged sample for sample — all 109 existing assertions measure
exactly that.
