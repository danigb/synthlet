---
"@synthlet/clock": minor
"@synthlet/euclid": minor
---

`Clock` emits a real gate, and `Euclid` pulses its hits.

A clock's phase ramp is not a gate. It rises from 0 to 1 over each beat - which
is what `Euclid` needs, because subdividing a clock means multiplying its phase

- but as a gate it is positive from the first beat onward and never falls back.
  Under the new `> 0` contract it would fire once and latch. `Clock` now has a
  second output for it:

```ts
const clock = Clock(ac, { bpm: 120 });
Euclid(ac, { clock }); // the phase ramp, unchanged
KickDrum(ac, { trigger: clock.gate }); // the gate
```

`clock.gate` is high for `pulseWidth` of each beat (new parameter, default
`0.5`), and its rising edge lands on the same block the phase output reaches
`1` - the block the AD has always fired on. The phase output itself is
untouched.

`Euclid` gets the same treatment and the same `pulseWidth`: each hit is a pulse
over the first fraction of its step instead of the step's level held to the next
step. **This fixes a real bug**: held levels merge adjacent hits, because there
is no falling edge between them and so no rising edge for the second. A `4/4`
pattern fired exactly once, ever; `8/5` lost 2 hits of 5 and `8/7` lost 6 of 7.
Only patterns with no adjacent hits (`16/5`, `16/7`) worked.

Widths are fractions of a beat or step rather than milliseconds on purpose: a
render quantum is ~2.9 ms at 44.1 kHz, so a fixed short pulse can fall inside
one block and be invisible to a k-rate consumer.
