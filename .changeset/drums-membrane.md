---
"synthlet": minor
---

`MembraneDrum`, an eleventh drum, and the first one in the kit that is a
resonator rather than an oscillator through an envelope: it is
`@synthlet/karplus-strong` with `blend` at 1/2, which is Karplus and Strong's
own drum algorithm from the 1983 paper - the drum half of "Digital Synthesis of
Plucked-String **and Drum** Timbres".

```ts
const drum = MembraneDrum(ac, { tone: 0.2, decay: 0.6 });
drum.connect(ac.destination);
drum.trigger.value = 1;
```

Its four knobs are the same four every drum has. `tone` sweeps the buffer
length over 100...1000 Hz, which is the paper's own snare-to-brushed-tom axis
("for fairly large p (200 or more)... the effect is that of a snare drum. For
small p (around 20), the effect is that of a brushed tom-tom") - low is a big
loose drum, high a small tight one. `decay` drives the resonator's loop gain
rather than an amplifier envelope, so the hit decays physically: 88 to 571 ms
across the knob at the low end of `tone`, 75 to 204 ms at the high end.

`registerDrums` now registers the Karplus-Strong worklet too, so the kit still
comes up with one call.
