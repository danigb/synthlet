---
"@synthlet/lfo": minor
"synthlet": minor
---

Give the LFO a depth envelope: `gate`, `delay` and `attack`.

The most common thing an LFO does is fade in — vibrato that arrives a moment
after the note rather than on it — and this package could not. `MonoSynth` faked
it by defaulting its vibrato to `gain: 0` and expecting the caller to write an
automation curve.

- **`gate`**, a-rate. A rising edge restarts the fade at zero depth; while high
  the fade advances, and while low it **freezes** rather than resetting, so
  releasing mid-fade holds the depth and the next note continues from there. A
  gate held across several legato notes is one edge and one ramp.
- **`delay`**, k-rate, `0…10` seconds held at zero depth.
- **`attack`**, k-rate, `0…10` seconds from zero to **99%** of full depth — the
  same meaning `Ad` and `Adsr` give theirs.

**`delay: 0, attack: 0` — the defaults — means no envelope at all**, so every
existing patch is bit-identical. With `gate` never connected the fade arms at
construction and runs once.

`sync` and `gate` are separate parameters because they are separate ideas: `sync`
resets the phase, `gate` restarts the depth ramp, and a Juno's LFO free-runs
while its depth fades in.

This discharges the Juno-6 LFO requirement. Everything else it needs — the
triangle formula, the rate range, the free-running phase — this package already
had; measured, the Juno's cubic soft-clipped triangle is 0.0200 from `LfoType.Sine`,
so it does not earn a twelfth waveform.

`MonoSynth`'s vibrato now has a real depth and a 0.6 s `attack`, wired to the
synth's own gate. It is audible without any caller-side automation, where before
it was silent without it.
