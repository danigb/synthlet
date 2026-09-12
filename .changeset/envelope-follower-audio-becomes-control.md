---
"@synthlet/envelope-follower": minor
"synthlet": minor
---

`EnvelopeFollower`: audio in, a control signal out.

```ts
const follower = EnvelopeFollower(ac, { attack: 0.01, release: 0.1 });
const depth = new GainNode(ac, { gain: 4000 });

source.connect(follower).connect(depth).connect(filter.frequency);
source.connect(filter);
```

The missing half of the library's signal flow. `AdsrEnv` makes an envelope from
a _gate_; `LevelMeter` measures amplitude and posts it to the main thread for a
UI to draw. Nothing took audio in and produced something an `AudioParam` could
be driven by, so nothing in synthlet could be driven by the loudness of anything
else — no auto-wah, no sidechain, no playing a synth from a microphone.

Web Audio's near miss is instructive: an `AnalyserNode` polled from
`requestAnimationFrame` gives a number at 60 Hz on the main thread, two orders of
magnitude too slow and on the wrong side of the fence to connect to anything.

**`attack` and `release` are the time to cover 99 % of a step**, the rule the
library has used for every time parameter since `AdsrEnv`. Analogue followers
label time constants; the README gives `t = τ × 4.605` rather than putting a
second meaning of "seconds" in one library. `0` is instantaneous.

**`Rms` is two stages, and that is not an implementation detail.** The obvious
one-stage version — the asymmetric filter run straight on the squared signal — is
not RMS: a rectified sine's square swings 0…1 at twice the signal frequency, so a
fast attack and a slow release ratchet it up towards its _peak_, and a unit sine
reads 0.93 instead of 0.707. A mean needs a symmetric filter, so the averaging
stage uses `release` in both directions and the asymmetric stage shapes the
result. A unit sine reads 0.707 and a unit square 1.0 — which `Peak` cannot tell
apart.

**A follower is only as fast as its attack.** On a 1 kHz unit sine `attack: 0.01`
settles at 0.952, not 1.0; `attack: 0` is the true peak detector. Both numbers
are asserted rather than described.

One **mono** output whatever the input carries: a stereo control signal would be
two inconsistently timed copies of one decision, so channels fold into the
detector — `Peak` by maximum, `Rms` by mean square.

At 100 Hz the settled output ripples by 0.6 dB at the defaults and under 0.2 dB
at `release: 0.5`. The floor is physical, and the fix for the remainder is a
`SlewLimiter` after it — which is exactly where Part 15 puts one.

No lookahead: that is a limiter's detector, and `lookahead-limiter` has one.
