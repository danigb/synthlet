# @synthlet/lfo

> A low-frequency oscillator with eleven shapes, as an audio worklet

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

`output = gen(phase) × amp × gain + offset`

| Param       | Default | Range   | Rate   | Meaning                       |
| ----------- | ------- | ------- | ------ | ----------------------------- |
| `type`      | 1       | 0 … 10  | k-rate | Waveform — see `LfoType`      |
| `frequency` | 10      | 0 … 200 | k-rate | Rate in Hz                    |
| `gain`      | 1       | ±20000  | k-rate | Depth — negative inverts      |
| `offset`    | 0       | ±20000  | k-rate | Where the waveform is centred |

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

Every shape swings the full ±1 and averages to zero over a cycle, so `gain` is
the whole depth and nothing here adds DC to what it modulates.

The three `Exp*` shapes are their linear partners bent inward: same zeros, same
peaks, same sign everywhere, and only the path between them differs. The bend is
the MMA concave transform (see Credits).

All four parameters are `k-rate` — what is audio-rate here is the **output**,
which is a different question. `type` is structural: swapping generator 128
times a block is not waveform modulation, it is noise. The other three are read
once per block, which lets the generator hoist its phase increment out of the
sample loop; a modulated `frequency` still moves, one step per render quantum.
For an envelope on the depth, put a native `GainNode` between the LFO and its
destination — that is a-rate and free.

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
