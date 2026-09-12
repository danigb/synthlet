# @synthlet/sample-hold

> Latch a signal on a trigger, and hold it — sample & hold, and track & hold

Part of [Synthlet](https://github.com/danigb/synthlet).

The module that turns a continuous signal into a stepped one. Point it at noise
and clock it, and you have the oldest random-voltage source in synthesis:

```
noise → sample-hold → filter cutoff
```

Synth Secrets Part 16 opens with it, and Reid notes that "this combination of
clock, S&H and noise is so deeply routed in synthesis that some synthesizers
combine them in a single module".

## Install

```bash
npm i @synthlet/sample-hold
```

Or `npm i synthlet` for every module at once.

## Usage

```ts
import { registerSampleHoldWorklet, SampleHold } from "@synthlet/sample-hold";

const ac = new AudioContext();
await registerSampleHoldWorklet(ac);

const clock = Clock(ac, { bpm: 480 });
const sh = SampleHold(ac, { trigger: clock.gate });

noise.connect(sh).connect(filter.frequency);
```

**`clock.gate`, not `clock`.** The `Clock` node itself is a phase ramp: it is
positive from the first beat onward and never falls back, so it would sample
once and latch forever.

## Parameters

| Param     | Default | Range | Rate   | Meaning                                         |
| --------- | ------- | ----- | ------ | ----------------------------------------------- |
| `type`    | 0       | 0 … 1 | k-rate | `SampleHoldType.SampleHold` (0) or `.Track` (1) |
| `trigger` | 0       | 0 … 1 | a-rate | The clock. A rising edge samples                |

`trigger` follows [Synthlet's one gate rule](https://danigb.github.io/synthlet/docs/gates-and-triggers):
a trigger is the transition from non-positive to positive. `0.001` fires, `0`
and `-1` do not, and a signal already positive fires once — it has to return to
`0` or below before it samples again.

It is **a-rate**, and on this module that is not a nicety. Elsewhere a trigger
quantised to the 128-frame render quantum is up to 2.9 ms late; here it is a
_different sample_ of the input, so on white noise the quantisation decides
which random value you get.

## Two modes, one latch

- **`SampleHoldType.SampleHold`** — latch on the rising edge, hold until the
  next one.
- **`SampleHoldType.Track`** — transparent while the trigger is positive, latch
  on the falling edge. The Korg MS20 and the Buchla 264 both do this, and Part
  16 explains what it is for: "you can use the duty cycle of your clock pulse to
  determine the proportion of time that the output tracks the input". `Clock`
  and `Euclid` both have a `pulseWidth`, so that duty cycle is one parameter
  away.

A pulse one sample wide makes `Track` behave exactly as `SampleHold`, which the
book also says and the tests assert.

## No droop

The book is careful to describe the analogue version's decay — "the impedance is
never truly infinite, so the voltage will decay slowly, and one measure of the
quality of an S&H module is the slowness of the rate at which this decay occurs".
The digital one has none: the held value is bit-identical after a minute. That
is a feature rather than an omission to model later — a droop control would be a
slew limiter pointing the wrong way, and
[@synthlet/slew-limiter](https://www.npmjs.com/package/@synthlet/slew-limiter)
already exists for the times you want one.

One held value **per channel**, so a stereo input holds two values sampled at
the same frame rather than collapsing to one.

## License

MIT © [danigb](https://github.com/danigb)
