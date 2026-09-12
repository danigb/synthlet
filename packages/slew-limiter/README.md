# @synthlet/slew-limiter

> Rate-limit a control signal — portamento, and the smoother after an S&H

Part of [Synthlet](https://github.com/danigb/synthlet).

Synth Secrets Part 16: _"But if you insert a simple Slew Generator into the
keyboard CV signal path, you smooth the transitions at the oscillator's CV
input, thus making the pitch glide from one note to the next. This, of course,
is portamento."_

It is also the module Part 15 puts after the envelope follower, to _"smooth out
the 'bumps'"_. One module, referenced twice by the book.

## Install

```bash
npm i @synthlet/slew-limiter
```

Or `npm i synthlet` for every module at once.

## Usage

```ts
import {
  registerSlewLimiterWorklet,
  SlewLimiter,
} from "@synthlet/slew-limiter";

const ac = new AudioContext();
await registerSlewLimiterWorklet(ac);

const glide = SlewLimiter(ac, { rise: 0.2, fall: 0.2 });
pitchInCents.connect(glide).connect(osc.detune);
```

`setTargetAtTime` is not this. It is host-side automation on a single
`AudioParam`: you cannot put it in the middle of a signal path, and it cannot
smooth a signal arriving from another node at all.

## Parameters

| Param  | Default | Range  | Rate   | Meaning                                             |
| ------ | ------- | ------ | ------ | --------------------------------------------------- |
| `type` | 0       | 0 … 1  | k-rate | `SlewType.Exponential` (0) or `SlewType.Linear` (1) |
| `rise` | 0.1     | 0 … 10 | k-rate | Upward, in the units below                          |
| `fall` | 0.1     | 0 … 10 | k-rate | Downward, same units                                |

### Two units, one parameter

| `type`        | `rise` / `fall` mean                |
| ------------- | ----------------------------------- |
| `Exponential` | seconds to cover **99 % of a step** |
| `Linear`      | seconds **per unit** of the signal  |

That is a real wart, and a deliberate one. A rate limiter has no notion of a
step — a 2-unit move takes twice as long as a 1-unit move, by definition — so
there is no honest way to give it a step time. The alternative, a second
parameter that is inert in the other mode, is worse.

`rise: 0` and `fall: 0` are a bit-exact bypass in both modes, not a division by
zero.

### Why exponential is the default

Because of units rather than taste. A linear rate is expressed per unit of the
signal, so 1 unit/second is a lifetime on a `[0,1]` CV and imperceptible on a
frequency in hertz. An exponential move is proportional: its duration is the
same whatever the step size and whatever the unit. It is also what the book
depicts — _"as it would be on most vintage synths"_ — the RC network that gives
Figure 16 its shark's tooth.

`rise` and `fall` are separate so that shark's tooth is reachable: an S&H
staircase through `rise: 0.5, fall: 0.01` climbs slowly and snaps down.

## The pitch caveat

An analogue portamento is an RC network on a 1 V/oct CV, so it is exponential
_in volts_ and therefore linear in log-frequency: the glide is musically even.
Synthlet's frequency parameters are in hertz, so a slew on a frequency signal
glides evenly in Hz — a fifth downward takes longer to traverse than a fifth
upward.

For a true 1 V/oct glide, slew a **`detune` in cents** (`polyblep-oscillator`,
`wavetable-oscillator` and `karplus-strong` all take one) or slew the note
number before converting it to hertz.

## Never put one on a gate

Exponential mode approaches zero asymptotically. A gate that closes 30 dB late
is a stuck note, which is why the
[gates doc](https://danigb.github.io/synthlet/docs/gates-and-triggers) says not
to smooth a gate line.

`SlewType.Linear` is the exception and is safe: the clamp takes the remaining
distance once it is smaller than one step, so the output lands **exactly** on
its target and `createGateDetector`'s `<= 0` fires. That is asserted; there is
no matching assertion for exponential, because that is the documented warning
rather than a supported use.

## The shared-code decision

`scripts/_smooth.ts` exists, and this package and `@synthlet/envelope-follower`
both carry a copy of it. It holds **one function and one constant**: the
coefficient of a one-pole that covers 99 % of a step, and `ln(100)`.

The repo's rule is that a utility moves to `scripts/` when a _second_ package
needs it. What the second package needs is not "a one-pole" — it is the
library's **definition of a time in seconds**. If the two files drifted, `0.1`
would mean 99 % of a step in one module and something else in the one next to
it, a caller moving a setting between them would get a different move, and
nothing would say so.

`karplus-strong` declined `_delay.ts` for a stated reason, and the reason was
that adopting it would have _changed its behaviour_. Nothing changed here: the
follower's function was renamed and its body left alone, and its twenty tests
pass untouched.

What is deliberately **not** shared: the direction choice, the rectifier and the
RMS stage in the follower, the linear branch here, and `adsr`'s TCO machinery.
`adsr` and `ad` are not retrofitted — their variants are genuinely different, so
the file covers two of the library's four smoothers, which is the honest scope.

## License

MIT © [danigb](https://github.com/danigb)
