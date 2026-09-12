# @synthlet/envelope-follower

> Audio in, a control signal out — the auto-wah, the sidechain, the guitar

Part of [Synthlet](https://github.com/danigb/synthlet).

Rectify, then charge and discharge at different rates. Synth Secrets Part 15:
_"an Envelope Follower (strictly speaking, a 'peak amplitude follower') — a
circuit that measures the amplitude of the positive peaks of the waveform."_
What comes out is at audio rate and inside the graph, so it can drive any
`AudioParam` in it.

## Install

```bash
npm i @synthlet/envelope-follower
```

Or `npm i synthlet` for every module at once.

## Usage

```ts
import {
  registerEnvelopeFollowerWorklet,
  EnvelopeFollower,
} from "@synthlet/envelope-follower";

const ac = new AudioContext();
await registerEnvelopeFollowerWorklet(ac);

// Part 15's Figure 9: the loudness of the input controls the cutoff.
const follower = EnvelopeFollower(ac, { attack: 0.01, release: 0.1 });
const depth = new GainNode(ac, { gain: 4000 });

source.connect(follower).connect(depth).connect(filter.frequency);
source.connect(filter);
```

## Parameters

| Param     | Default | Range   | Rate   | Meaning                                       |
| --------- | ------- | ------- | ------ | --------------------------------------------- |
| `type`    | 0       | 0 … 1   | k-rate | `EnvelopeFollowerType.Peak` (0) or `.Rms` (1) |
| `gain`    | 1       | 0 … 100 | k-rate | Input gain, Part 15's Input Gain Control      |
| `attack`  | 0.01    | 0 … 10  | k-rate | Seconds to cover 99 % of a rise               |
| `release` | 0.1     | 0 … 10  | k-rate | Seconds to cover 99 % of a fall               |

### What "seconds" means

**The time to cover 99 % of a step**, which is the rule this library has used
for every time parameter since `AdsrEnv`. `attack: 0.05` on a step from silence
reaches 0.99 at exactly 50 ms, at 44.1 and 48 kHz alike.

Analogue followers, and most plugin ones, label their attack and release as
**time constants** — τ, which is 63.2 % of a step. To port a setting from one of
those, multiply by 4.605:

```
t = τ × 4.605          τ = t / 4.605
```

One library should not have two meanings for "seconds", and the one that loses
is the one that is not already public API in `AdsrEnv.descriptors`.

`attack: 0` and `release: 0` are instantaneous, not a division by zero.

## One mono output

Whatever the input's channel count. The output is a control signal, and a
stereo control signal would only mean two inconsistently timed copies of the
same decision. The channels fold into the detector instead: `Peak` takes the
maximum absolute value across them, `Rms` the mean square. A stereo input
therefore gives one envelope that responds to whichever channel is loudest,
which is what a sidechain wants.

## Peak and RMS

`Peak` is the book's. A one-pole attack can only cover a fraction of the gap per
sample, so a follower is only as fast as its attack: at 1 kHz, `attack: 0.01`
settles at **0.952** of a unit sine rather than at 1.0. `attack: 0` is the true
peak detector and settles at 1.0.

`Rms` is two stages, and deliberately:

```
ms  = cAvg·ms + (1−cAvg)·x²      symmetric, cAvg from `release`
d   = sqrt(ms)
env = c·env + (1−c)·d            c = attack if d > env, else release
```

The obvious one-stage version — the asymmetric filter run straight on the
squared signal — is not RMS. A rectified sine's square swings between 0 and 1 at
twice the signal frequency, so a fast attack and a slow release ratchet it up
towards its _peak_ instead of averaging it, and a unit sine reads 0.93 rather
than 0.707. A mean needs a symmetric filter. The cost is that an RMS follower is
always slower than a peak one, because `release` is both the averaging window
and the fall time.

A unit sine reads 0.707 and a unit square reads 1.0 — which is the whole point
of having it, since `Peak` reports 1.0 for both.

## Ripple, and why the release default is not tiny

A rectified signal ripples at twice its frequency, and a follower fast enough to
be useful follows some of it — the "bumps" Part 15's Figure 8 smooths. At 100 Hz
with the defaults the settled output ripples by **0.6 dB**; at `release: 0.5` it
is under 0.2 dB. The floor is physical rather than a defect: at 50 Hz the ripple
period is 10 ms, so any release much under that produces a follower that
wobbles. The fix for the remainder is a
[@synthlet/slew-limiter](https://www.npmjs.com/package/@synthlet/slew-limiter)
after it, which is precisely the patch in the book.

## Not `LevelMeter`, and neither replaces the other

`@synthlet/level-meter` posts numbers to the main thread for a UI to draw. This
connects to an `AudioParam` inside the graph. The names are close enough to
confuse; the difference is which side of the fence the number comes out on.

There is deliberately **no lookahead**. A follower that can see the future is a
limiter's detector, and `@synthlet/lookahead-limiter` already has one, with a
delay line to pay for it. Part 15's follower is causal and so is this.

## License

MIT © [danigb](https://github.com/danigb)
