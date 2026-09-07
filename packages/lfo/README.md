# @synthlet/lfo

> A low-frequency oscillator with thirteen shapes, as an audio worklet

Part of [Synthlet](https://github.com/danigb/synthlet).

The modulation source. Web Audio's `OscillatorNode` gives you four waveforms
and none of the ones modulation actually wants — no sample-and-hold, no
exponential ramps, no single-sample impulse — and no gain or offset without two
more nodes. This is one node with all of it.

It emits **a signal, one value per sample**, so a slow sine on a pitch or a
gain is smooth rather than a 344 Hz staircase.

## Install

```bash
npm i @synthlet/lfo
```

Or `npm i synthlet` for every module at once.

## Usage

```ts
import { registerLfoWorklet, Lfo, LfoType } from "@synthlet/lfo";

const ac = new AudioContext();
await registerLfoWorklet(ac);

const osc = new OscillatorNode(ac, { frequency: 440 });
osc.start();

// ±10 Hz of vibrato at 5 Hz
const vibrato = Lfo(ac, { type: LfoType.Sine, frequency: 5, gain: 10 });
vibrato.connect(osc.frequency);

osc.connect(ac.destination);
```

## Parameters

`output = gen(phase) × amp × gain + offset`, where `amp` is the depth envelope.

| Param       | Default | Range          | Rate   | Meaning                              |
| ----------- | ------- | -------------- | ------ | ------------------------------------ |
| `type`      | 1       | 0 … 12         | k-rate | Waveform — see `LfoType`             |
| `frequency` | 10      | −200 … 200     | a-rate | Rate in Hz — negative runs backwards |
| `gain`      | 1       | −20000 … 20000 | k-rate | Depth — negative inverts             |
| `offset`    | 0       | −20000 … 20000 | k-rate | Where the waveform is centred        |
| `sync`      | 0       | 0 … 1          | a-rate | Rising edge restarts the phase       |
| `gate`      | 0       | 0 … 1          | a-rate | Rising edge restarts the depth ramp  |
| `delay`     | 0       | 0 … 10         | k-rate | Seconds held at zero depth           |
| `attack`    | 0       | 0 … 10         | k-rate | Seconds from zero to 99% depth       |

Plus one **construction option**, not an `AudioParam`:

| Option  | Default | Meaning                                                                                                                |
| ------- | ------- | ---------------------------------------------------------------------------------------------------------------------- |
| `phase` | `0`     | Where the LFO starts, and where a `sync` edge sends it. A number is taken modulo 1; `"random"` draws once per instance |

## Shapes

`type` is an index into `LfoType`. **Every continuous shape crosses zero going
up at phase 0** — a modulation source's zero point is no modulation — so an LFO
whose phase is reset starts with no effect on what it is patched into. `Square`
and `Impulse` are the exceptions and cannot be otherwise: a square has no zero
crossing, and the impulse's single sample _is_ the cycle boundary.

| `LfoType`            | φ=0  | φ=¼     | φ=½  | φ=¾     | Jumps at |
| -------------------- | ---- | ------- | ---- | ------- | -------- |
| `None` (0)           | 0    | 0       | 0    | 0       | —        |
| `Sine` (1)           | 0    | +1      | 0    | −1      | —        |
| `Triangle` (2)       | 0    | +1      | 0    | −1      | —        |
| `RampUp` (3)         | 0    | +0.5    | −1   | −0.5    | φ=½      |
| `RampDown` (4)       | 0    | −0.5    | +1   | +0.5    | φ=½      |
| `Square` (5)         | +1   | +1      | −1   | −1      | φ=0, φ=½ |
| `ExpRampUp` (6)      | 0    | +0.1246 | −1   | −0.1246 | φ=½      |
| `ExpRampDown` (7)    | 0    | −0.1246 | +1   | +0.1246 | φ=½      |
| `ExpTriangle` (8)    | 0    | +1      | 0    | −1      | —        |
| `RandSampleHold` (9) | held | held    | held | held    | φ=0      |
| `Impulse` (10)       | 1    | 0       | 0    | 0       | φ=0      |

The last two members are stochastic and have no such row. What they promise
instead is a range and a continuity:

| `LfoType`         | Promises                                                                                           |
| ----------------- | -------------------------------------------------------------------------------------------------- |
| `RandSmooth` (11) | In ±1. One random target per cycle, faded between targets — continuous, with no corner at a target |
| `Drift` (12)      | In ±1. Two octaves of gradient noise along the phase — a rate, but no audible period               |

Every shape swings the full ±1 and averages to zero over a cycle, so `gain` is
the whole depth and nothing here adds DC to what it modulates.

The three `Exp*` shapes are their linear partners bent inward: same zeros, same
peaks, same sign everywhere, and only the path between them differs. The bend is
the MMA concave transform (see Credits).

**`packages/lfo/src/dsp.ts` is where this table lives as a specification**, and
`dsp.test.ts` asserts every row of it. This copy and the one on the docs page
follow it; change that one first.

`sync`, `gate` and `frequency` are `a-rate`; the rest are read once per block.
`type` is structural: swapping generator 128 times a block is not waveform
modulation, it is noise. `gain` and `offset` are k-rate because the better answer
to a signal on either already exists — a native `GainNode` between the LFO and
its destination is a-rate and free, and adding a signal to `offset` is what the
destination `AudioParam`'s own summing does.

A modulated `frequency` is tracked per sample and costs at most 9.4 %
(`benchmarks/lfo-rate/`). An unmodulated one costs nothing: a browser hands
length 1 both for an unconnected parameter and for a connected constant, so the
phase increment stays hoisted out of the sample loop.

**Above roughly 20 Hz this stops being a modulation source.** The shapes are
naive — there is no BLEP in an LFO, because at LFO rates the aliased images fold
back onto harmonics and there is nothing inharmonic to remove — and at the top of
the range the discontinuous ones show it. Measured alias SNR at 200 Hz: 23.6 dB
for the ramps, 25.4 for the square, 16.3 for the exponential ramps, against 96 dB
or better for all of them at 100 Hz. Audio-rate _modulation_ at 50–100 Hz is
clean and useful; for an audio-rate _oscillator_, use
[`@synthlet/polyblep-oscillator`](https://github.com/danigb/synthlet/tree/main/packages/polyblep-oscillator),
which is band-limited.

`frequency` is bipolar too: a negative rate runs the phase backwards — the
reverse ramp — and `frequency: 0` freezes the LFO on the value at `phase`.

`gain` is bipolar: **a negative depth inverts the waveform**, which is how a
filter closes as the amp opens and how two LFOs run in antiphase. `gain` and
`offset` are `±20000`, the same range `@synthlet/ad`, `@synthlet/adsr` and
`@synthlet/param` declare for the identical `x × gain + offset`.

## Starting it

Without `sync`, every `Lfo` in an `AudioContext` free-runs from context time
zero — so two at the same rate are the _same signal_, forever, and a note-on
cannot restart a vibrato. A rising edge on `sync` restarts the phase at `phase`.

**Per-note vibrato.** Send the voice's gate to the LFO as well as the envelope,
and every note gets the same pitch contour:

```ts
const vibrato = Lfo(ac, { frequency: 5, gain: 10, sync: gate });
vibrato.connect(osc.frequency);
```

**Tempo sync.** There is no `bpm` parameter and no division enum: `clock.gate`
into `sync` is the whole mechanism, and the division is `frequency` relative to
a tempo you already know.

```ts
const clock = Clock(ac, { bpm: 120 });
const lfo = Lfo(ac, { frequency: 2, sync: clock.gate }); // one cycle per beat
```

**Two independent wobbles.** `phase: "random"` draws once per instance, which
separates two slow LFOs without detuning either:

```ts
const wobble = () => Lfo(ac, { frequency: 0.3, phase: "random" });
wobble().connect(filter.frequency);
wobble().connect(panner.pan);
```

Holding `sync` positive fires **once**, not once per sample — a re-fire needs
the signal to return to `<= 0` first. Never drive it with `setTargetAtTime`: a
signal that asymptotes towards zero never reaches it, so the gate would never
re-arm.

The reset lands on the sample the edge was detected on. Unlike
`@synthlet/polyblep-oscillator`, this package does not interpolate the
sub-sample crossing instant — 2.9 ms is nothing against a 5 Hz cycle.

## The random family

`RandSampleHold` steps, and that is its point — it is also the loudest thing this
module emits, at a measured 1.41623 of single-sample step at 5 Hz where a sine's
largest is 0.00071. So for a long time "random modulation" and "audible stepping"
were the same setting.

`RandSmooth` and `Drift` are the continuous members. They are not redundant with
each other: **`RandSmooth` has a beat** — you can hear one value per cycle, and
every local extremum is a cycle boundary — and **`Drift` does not**. Both measure
under 0.005 of single-sample step at 5 Hz, two orders of magnitude under the
stepped one.

The interpolation is Perlin's quintic fade `6t⁵ − 15t⁴ + 10t³` rather than a
straight line, and not as a matter of taste: linear interpolation between random
targets has a discontinuous derivative at every target, so a smoothed random on a
cutoff would have an audible corner once a cycle — a smaller version of the
problem it exists to solve.

`Drift` is two octaves of one-dimensional gradient (Perlin) noise sampled along
the phase, per Popov 2018. Its lacunarity is the **golden ratio** rather than the
usual 2, because gradient noise is exactly zero at every lattice point: an
integer lacunarity puts every octave's zeros in the same places and leaves an
audible period in a shape whose whole job is not to have one.

**None of these is a noise source.** `@synthlet/noise` is white and pink at audio
rate; these are one random value per LFO cycle.

## Fading in

Vibrato that arrives a moment after the note, rather than on it, is the most
common thing an LFO does. `delay` and `attack` are that, and `gate` is what
starts it:

```ts
const vibrato = Lfo(ac, {
  frequency: 5,
  gain: 10,
  delay: 0.3, // 300 ms of nothing
  attack: 0.7, // then 700 ms fading up to full depth
  gate, // restarted by the note
});
```

**`delay: 0, attack: 0` — the defaults — means no envelope at all.** The depth
is 1, `gate` is ignored, and the output is bit-identical to a build without any
of it.

| Behaviour              | What happens                                      |
| ---------------------- | ------------------------------------------------- |
| Rising edge on `gate`  | The fade restarts at zero depth                   |
| Gate held high         | The fade advances — legato is **one** ramp        |
| Gate falls             | The fade **freezes**; it does not reset           |
| Gate rises again       | Back to zero, and off again                       |
| `gate` never connected | Armed at construction: it fades in once and stays |

`attack` is seconds to **99%** of full depth, the same meaning `Ad` and `Adsr`
give their own `attack`. A Juno-6 with its delay slider at maximum is
`attack: 6.91` — its ramp is a time constant of 1.5 s, and the two conventions
differ by exactly `ln(100)`.

**`sync` and `gate` are different parameters.** `sync` resets the _phase_;
`gate` restarts the _depth ramp_. A Juno's LFO free-runs while its depth fades
in, which is only expressible if the two are separate.

## Credits

`concaveTransform` is the MMA concave transform as presented by
[Will Pirkle](https://www.willpirkle.com/) (Tritone Systems) in _Designing
Software Synthesizer Plug-Ins in C++_ and SynthLab, including the 5.0/12.0
correction coefficient.

See the repository's
[THIRD-PARTY-LICENSES.md](https://github.com/danigb/synthlet/blob/main/THIRD-PARTY-LICENSES.md).

## License

MIT © [danigb](https://github.com/danigb)
