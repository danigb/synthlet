# @synthlet/karplus-strong

> An extended Karplus-Strong plucked string: a filtered delay loop with a shaped
> excitation, dispersion, two polarizations and a damping hand

Part of [Synthlet](https://github.com/danigb/synthlet)

A plucked string is a delay line with a loss in it. Excite it, and what comes
back round the loop each period is a little quieter and a little darker than what
went in — which is why a real string's high partials die first and its low ones
ring on. That structure is what this module is, in the sense Karjalainen,
Välimäki and Tolonen 1998 mean by a **single delay loop**: Bank and Välimäki
write its loop filter as `Hl(z) = Hloss(z)·Hdisp(z)·Hfd(z)`, three independent
blocks, and each one is a parameter here. `decay` and `brightness` are the loss;
`stiffness` is the dispersion; the fourth-order Lagrange fractional read is what
puts the loop at the right length without colouring it.

**You do not have to learn fifteen knobs.** The defaults are a plucked steel
string, and six of the parameters — `stretch`, `blend`, `stiffness`,
`polarization`, `tension` and `damp` — are neutral at theirs, each one
bit-identical to the module without that feature and costing nothing until it is
turned up. `frequency`, `decay` and `brightness` are the three that make a note;
the rest are there when you want them.

## Install

```bash
npm install @synthlet/karplus-strong
```

## Usage

```ts
import {
  KarplusStrong,
  registerKarplusStrongWorklet,
} from "@synthlet/karplus-strong";

await registerKarplusStrongWorklet(audioContext);

const string = KarplusStrong(audioContext, {
  frequency: 220, // Hz
  decay: 2, // seconds to fall 60 dB
  brightness: 0.6, // the tilt of the loop filter, not its loss
  level: 0.7, // how hard it is plucked
  position: 0.13, // where along the string, 0 is the bridge
});

string.connect(audioContext.destination);

// Pluck it: a rising edge on `trigger`
string.trigger.value = 1;
string.trigger.value = 0;
```

Everything below happens **while the note rings**, and none of it used to work:

```ts
// A bend. `frequency` is a-rate, so an `Lfo` into it is vibrato.
string.frequency.linearRampToValueAtTime(330, audioContext.currentTime + 0.5);

// A second pluck adds to the string instead of erasing it.
string.trigger.value = 1;
string.trigger.value = 0;

// The other hand: mute it through the loop, so it dies dark.
string.damp.value = 1;
```

## Parameters

| Param          | Default | Min  | Max  | Rate       | Meaning                                                                                                      |
| -------------- | ------- | ---- | ---- | ---------- | ------------------------------------------------------------------------------------------------------------ |
| `trigger`      | 0       | 0    | 1    | k-rate     | Plucks on the rising edge. Return it to 0 before plucking again                                              |
| `frequency`    | 440     | 20   | 5000 | **a-rate** | Pitch in Hz, and it moves while the string rings. Connect an `Lfo` for vibrato                               |
| `decay`        | 1       | 0.01 | 5    | k-rate     | **Seconds** to fall 60 dB, the same at every pitch. It used to be a count of periods                         |
| `brightness`   | 0.5     | 0    | 1    | k-rate     | The loop filter's tilt, not its loss. 1 is a plain delay, 0 is a zero at Nyquist                             |
| `level`        | 0.5     | 0    | 1    | k-rate     | How hard it is plucked, as amplitude on the burst. A default pluck peaks about −13 dBFS                      |
| `dynamics`     | 0.5     | 0    | 1    | k-rate     | Soft plucks are darker — Smith's dynamic-level filter, `L = dynamics^(5/3)`. 1 bypasses it                   |
| `position`     | 0.13    | 0    | 0.5  | k-rate     | Where along the string, as a fraction. 0 is the bridge and **bypasses** the comb                             |
| `pickAngle`    | 0       | 0    | 0.9  | k-rate     | Pick direction, a one-pole on the attack. At 0.9 it takes 10.3 dB off the first 5 ms above 5 kHz             |
| `stretch`      | 1       | 1    | 20   | k-rate     | Karplus and Strong's decay stretching: the high partials ring longer. 1 is the plain algorithm               |
| `blend`        | 1       | 0    | 1    | k-rate     | Their drum algorithm. 1 is a string, 1/2 is a drum, 0 is "harplike" — an octave down, odd harmonics          |
| `stiffness`    | 0       | 0    | 1    | k-rate     | Dispersion: partial `k` moves to `k·f₀·√(1+B·k²)`. Piano, clavinet, steel-string. 0 bypasses it              |
| `detune`       | 0.5     | 0    | 1    | k-rate     | Mistuning of the second polarization, **0 to 10 cents**. Cents, so the beat rate follows the pitch           |
| `polarization` | 0       | 0    | 1    | k-rate     | The second polarization's amplitude relative to the first, so it is `−20·log10(p)` dB apart. 0 is one string |
| `tension`      | 0       | 0    | 1    | k-rate     | Initial pitch glide from the pluck's own energy, scaling with `level²`. 0 is off and free                    |
| `damp`         | 0       | 0    | 1    | k-rate     | The other hand. 1 mutes a ringing note in 50 ms, through the loop rather than the output                     |

## Five things the table cannot carry

- **`decay` is seconds now, and it used to be periods.** That is a breaking
  change. The old knob rang for 3.2 s at 110 Hz and 0.22 s at 1760 Hz; the new
  one rings for what it says at both. Convert an existing patch at the pitch you
  wrote it for:

  ```ts
  decay * 0.1 * (sampleRate / frequency); // old knob -> seconds
  // decay: 0.1 at A4 and 44.1 kHz was about 1.0 s
  ```

- **`decay` is not always the length of the note.** With `polarization` above 0
  there is a quiet, slow aftersound behind the loud, fast prompt sound, and
  `decay` is the _prompt_ sound's time — so the note outlasts it by 2.3× at a
  useful mix and 2.7× at equal strength. `damp` overrides it in the other
  direction.

- **`decay` has a ceiling at high pitch and low brightness**, and past it the
  request is **clamped, not approximated**. The loop gain `ρ` is derived from the
  loop's gain at the fundamental, and a symmetric three-tap filter's gain there,
  `G(ω₀) = h₀ + 2h₁·cos ω₀`, is below 1 for every `brightness` below 1. Asking
  for longer than the filter alone can deliver would mean a loop gain above 1 at
  DC, which is an unbounded loop. So the longest reachable decay is

  ```
  t60max = ln(0.001) / (f₀ · ln(1/G(ω₀)))
  ```

  which at `brightness: 0.5` is **2045 s at 110 Hz, 32 s at 440, 0.50 s at 1760
  and 22 ms at 5 kHz**. At `brightness: 1` the filter degenerates to a plain
  delay, `G(ω₀)` is 1, and there is no ceiling. This is a property of a
  three-tap symmetric filter, not a defect: its gain at ω₀ is 1 only when
  `h₁ = 0`. Reaching longer decays up high needs the per-note loop-filter design
  of Bank and Välimäki 2003, which this package does not have.

- **`frequency` tops out at 5000 Hz, and that is a measurement.** 5 kHz is 8.8
  samples of delay: the loop holds four partials and the worst of sixteen plucks
  lands 2.1 cents out. At 5500 Hz that is 8.3 cents and at 6000 Hz 21. The 20 kHz
  this module used to declare is 2.2 samples of delay, which is not a string.

- **A re-pluck adds to a ringing string instead of erasing it.** Plucking 300 ms
  into a ringing note leaves it 11.3 dB louder than the same note left alone, and
  the samples before the re-pluck are unchanged to the bit. So a `trigger` at
  `level: 0` is exactly a no-op, where on a string that reset itself it would
  have stopped the note dead. The delay line is cleared where a real string
  really does fall silent — at the auto-stop, below −100 dBFS.

## `stretch` is not `stiffness`

They are described together everywhere else and they are not the same effect.

**`stretch`** lengthens the _decay_ of the high partials — apply the damping
filter with probability `1/S`, which is Karplus and Strong's own modification.
The third partial of a 1760 Hz string decays 3.5× more slowly at `stretch: 4`.
Every partial stays exactly where it was: measured spread across `stretch: 1…20`
is under 0.8 cents.

**`stiffness`** moves the partial _frequencies_ and changes no decay time at all
— it is an allpass, so it cannot. On a 110 Hz string, cents sharp of the harmonic
series:

| `stiffness` | 4th partial | 8th  | 16th |
| ----------- | ----------- | ---- | ---- |
| 0           | 0.0         | 0.0  | 0.0  |
| 0.5         | 0.3         | 3.4  | 19.6 |
| 1           | 6.6         | 38.6 | 91.8 |

Both ship, and they compose.

## Measured quality

Each of these is an assertion in `src/dsp.test.ts` — 122 of them — with the
measured value in a comment beside its threshold.

| What                                  | Measured                                                                                                                             |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Timbre versus tuning                  | five pitches within 20 cents of A4 span **~1 dB** of high-band decay, against 52.7 before                                            |
| t₆₀ against the requested `decay`     | 0.90 / 0.91 of it at 110 / 440 Hz, inside the 75–140% band Järveläinen and Tolonen measured as inaudible                             |
| `brightness` versus decay time        | t₆₀ of a band at the fundamental is 1.000 s at **every** brightness — exact by construction                                          |
| Pitch at the top of the range         | worst of 16 plucks 2.1 cents out at 5000 Hz                                                                                          |
| Pitch under `stiffness`               | fundamental moves **0.004 cents** across `stiffness: 0…1` at 110, 440 and 1760 Hz                                                    |
| Beat rate versus the detune asked for | 0.633 / 1.266 Hz at 220 Hz, 1.264 / 2.546 at 440 — worst error **0.7%**                                                              |
| Two-stage decay                       | early-to-late decay-rate ratio 1.18 for one string, 2.67 at 12 dB apart                                                              |
| A slide of an octave in half a second | tracks within **2.1 cents** and stays within 0.5 dB of the same note held still                                                      |
| `tension` against a recorded guitar   | **2.75 Hz** of glide where Järveläinen and Välimäki's Fig. 1 has "approximately 3 Hz"                                                |
| `damp: 1`                             | under −60 dBFS in **47–53 ms** at 110, 440 and 1760 Hz, and it dies dark: 46.2 dB out of 3–10 kHz against 42.5 out of 300–1500       |
| Neutral defaults                      | `polarization`, `stiffness`, `tension` and `damp` at 0 render **bit-identically** to the module without them                         |
| Cost                                  | 20.0 ns/sample at the defaults, 44.4 with the second polarization, 68.2 with dispersion too — 0.09% to 0.30% of one core at 44.1 kHz |

## What it deliberately isn't

- **`tension` is a pitch glide, not a tension-modulation model.** The
  nonlinearity also couples harmonic modes; Tolonen et al. 2000 name both
  effects, and the quasi-static energy approximation this rests on reproduces
  only the first.
- **There is no body.** Commuted synthesis — convolving a body response into the
  excitation — is free at run time and not here. Smith notes a solid-body
  electric guitar needs no body model, which is what this currently is.
- **There is no sympathetic coupling**, which needs polyphony. This is one voice.
- **There is no distortion or amplifier feedback.** Smith's own aliasing analysis
  requires 2× oversampling around the nonlinearity, which is a larger change than
  anything here.
- **The loop filter is not designed per note.** A credible "nylon", "steel" or
  "wound bass" needs the analysis-driven loss-filter design of Bank & Välimäki
  2003 and Erkut et al. 2000, fitted against recordings. `brightness` is the
  low-order knob, and the ceiling above is the price of it.

## Sourced numbers, and the ones that are ours

The filters and the formulae are the papers'. Three mappings are not, and are
marked as ours in `src/params.ts` and `src/dsp.ts`:

| Ours                    | What it is                                                                                                               |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `stiffness → B`         | `B = 1e-5 · 100^stiffness`, across the two decades Rauhala & Välimäki searched for pianos                                |
| `detune`'s 10-cent span | No paper prescribes a range; the mechanism (a length difference) prescribes the unit                                     |
| `tension`'s taper       | 1 is a semitone of initial sharpening at a full-scale pluck. Every point on it is checkable against a measured threshold |

Everything else — the two-zero damping filter, `ρ` from a decay time, the
excitation chain, the Thiran allpass, the three-times polarization time constant,
the energy formulation, the geometric `damp` curve — comes from a paper below,
and the perceptual tolerances the tests use come from listening experiments
rather than from taste.

## References

- K. Karplus and A. Strong,
  [_Digital Synthesis of Plucked-String and Drum Timbres_](https://users.soe.ucsc.edu/~karplus/papers/digitar.pdf),
  Computer Music Journal 7(2), 1983 — the algorithm, and `stretch` and `blend`
  are its own two probabilistic variants
- D. A. Jaffe and J. O. Smith,
  [_Extensions of the Karplus-Strong Plucked-String Algorithm_](https://www.jaffe.com/s/Jaffe-Smith-Extensions-CMJ-1983.pdf),
  Computer Music Journal 7(2), 1983 — pitch-independent decay, tuning, dispersion
- J. O. Smith,
  [_Making Virtual Electric Guitars and Associated Effects Using Faust_](https://ccrma.stanford.edu/realsimple/faust_strings/faust_strings.pdf),
  CCRMA — the EKS write-up: the two-zero damping filter (§3.4), `ρ` from a decay
  time (§3.3), and the excitation chain this module's four pluck parameters are
- M. Karjalainen, V. Välimäki and T. Tolonen,
  [_Plucked-String Models: From the Karplus-Strong Algorithm to Digital Waveguides and Beyond_](http://users.spa.aalto.fi/vpv/publications/cmj98.pdf),
  Computer Music Journal 22(3), 1998 — the single-delay-loop structure, and dual
  polarization
- B. Bank and V. Välimäki,
  [_Robust Loss Filter Design for Digital Waveguide Synthesis of String Tones_](https://home.mit.bme.hu/~bank/publist/spl03.pdf),
  IEEE SPL 10(1), 2003 — the `Hloss·Hdisp·Hfd` factorisation, and the per-note
  design this defers
- J. Rauhala and V. Välimäki, _Tunable Dispersion Filter Design for Piano
  Synthesis_, IEEE SPL 13(5), 2006 — `stiffness`, a second-order Thiran allpass
  redesigned from the pitch every block
- F. Avanzini, R. Marogna and B. Bank,
  [_Efficient Synthesis of Tension Modulation in Strings and Membranes Based on Energy Estimation_](https://home.mit.bme.hu/~bank/publist/jasa12.pdf),
  JASA 131(1), 2012 — `tension`'s energy formulation
- M. Laurson, C. Erkut, V. Välimäki and M. Kuuskankare, _Methods for Modeling
  Realistic Playing in Acoustic Guitar Synthesis_, CMJ 25(3), 2001 — time-varying
  loop coefficients, which is what `damp` is
- H. Järveläinen and T. Tolonen, _Perceptual Tolerances for the Decay Parameters
  in Plucked String Synthesis_, JAES 49(11), 2001 — the 75–140% band the decay
  tests use
- H. Järveläinen and V. Välimäki, _Audibility of Initial Pitch Glides in String
  Instrument Sounds_, ICMC 2001 — `tension`'s thresholds, and why it ships off
- H. Järveläinen and M. Karjalainen, _Perception of Beating and Two-Stage Decay
  in Dual-Polarization String Models_, ISMA 2002 — `polarization`'s 7 dB and
  18 dB findings

Original work, implemented from the papers. No third-party source was copied; see
the repository's
[THIRD-PARTY-LICENSES.md](https://github.com/danigb/synthlet/blob/main/THIRD-PARTY-LICENSES.md).

## License

MIT © [danigb](https://github.com/danigb)
