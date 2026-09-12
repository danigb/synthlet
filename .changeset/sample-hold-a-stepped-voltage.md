---
"@synthlet/sample-hold": minor
"synthlet": minor
---

`SampleHold`: latch a signal on a trigger and hold it, plus the MS-20/Buchla
track-and-hold mode on the same latch.

```ts
const clock = Clock(ac, { bpm: 480 });
const sh = SampleHold(ac, { trigger: clock.gate });

noise.connect(sh).connect(filter.frequency);
```

Four nodes, and the library could not make that sound at all before: a `Clock`,
a `Noise`, every filter you could want to point a random voltage at, and nothing
to connect them. Web Audio has no equivalent and neither does the host side — an
S&H is a sample-rate latch, not something a `setValueAtTime` loop can fake
without knowing the input signal.

| `SampleHoldType` | Samples on       | While the trigger is high |
| ---------------- | ---------------- | ------------------------- |
| `SampleHold`     | the rising edge  | holding                   |
| `Track`          | the falling edge | transparent               |

`Track` is what Part 16 spends four paragraphs on, and what makes `Clock`'s and
`Euclid`'s `pulseWidth` into a track/hold ratio. A pulse one sample wide makes
it behave exactly as `SampleHold`, which the book says and the tests assert.

**Detection comes from the shared `_gate.ts`**, and this is the first new
package to join that copy list since the wavetable oscillator. Both modes read
it: `Track` takes its level from the detector's own open state rather than
comparing to zero itself, so there is exactly one place in the package that
decides what positive means.

**`trigger` is a-rate.** Everywhere else in the library a trigger quantised to
the render quantum is up to 2.9 ms late; here it is not a late sample, it is a
different one — fed white noise, the quantisation decides _which_ random value
you hold.

**No droop.** The held value is bit-identical after a minute. The analogue
version's decay is a leaking capacitor, and a droop parameter would be a slew
limiter pointing the wrong way.
