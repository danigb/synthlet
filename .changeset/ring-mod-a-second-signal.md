---
"@synthlet/ring-mod": minor
"synthlet": minor
---

`RingMod`: ring modulation and amplitude modulation, as one module with one knob
between them.

```ts
const ring = RingMod(ac, { modulator: osc, offset: 0 });
carrier.connect(ring);
```

A 300 Hz carrier against a 200 Hz modulator, both unit sines:

| `offset` | 100 Hz | 300 Hz | 500 Hz | What it is                         |
| -------- | ------ | ------ | ------ | ---------------------------------- |
| `0`      | ½      | —      | ½      | Ring modulation. The inputs vanish |
| `1`      | ½      | 1      | ½      | Amplitude modulation               |

Synth Secrets Part 11, Figure 10 — _"the Modulator has completely
disappeared"_ — measured on the real processor rather than asserted.

**Why a package and not four lines of `GainNode`.** The ideal multiply is four
lines and this is not justified by it. It is justified by AC coupling: a
`GainNode` multiplies DC too, so an offset on either input leaks the _other_
signal straight through at full amplitude, and that leak is the whole difference
between a ring modulator and a VCA. Both inputs pass a 5 Hz one-pole blocker,
computed from the sample rate so 44.1 and 48 kHz block the same corner, and
`coupling: 0` turns them off to get Part 11's "lesser RM" deliberately.

The **output** is not blocked. When carrier and modulator share a frequency the
difference tone lands at 0 Hz, and Reid is explicit that the offset is signal.

**How a second audio signal reaches a synthlet module**, settled here for the
rest of the library: as an a-rate `AudioParam`. `connectParams` wires parameters
and nothing else, so `RingMod(ac, { modulator: osc })` needs no change to the
module contract. Two costs, both in the README: an `AudioParam` input is
down-mixed to mono, and an a-rate one is clamped — which is why `modulator`
declares ±10 rather than ±1.

`RingModType` has one member, `Ideal`. The diode ring (Parker, DAFx-11) is a
different function rather than a further point on a continuum, and this is the
seam it lands on.
