# @synthlet/polyblep-oscillator

## 0.3.0

### Minor Changes

- 5aa2d2b: Add `Compound`, for declaring a group of modules that is itself a module:

  ```ts
  function Voice(ac: AudioContext) {
    const gate = Param(ac);
    const volume = Param.db(ac, -12);
    const osc = PolyblepOscillator(ac, { frequency: 440 });
    const amp = AdsrAmp(ac, { gate });
    const out = Gain(ac, { gain: volume });

    osc.connect(amp).connect(out);

    return Compound({
      output: out,
      owns: [osc, amp, gate, volume],
      exposes: { gate: gate.input, volume: volume.input, osc },
    });
  }
  ```

  `owns` is what `dispose()` tears down - anything passed to a factory is already
  owned by the module it was passed to, so it is the list of nodes you connected
  by hand, and listing extras is free. `exposes` is the compound's public
  surface. The result is `CompoundNode<GainNode, { gate: AudioParam; … }>`, also
  exported, so `voice.gate` and `voice.osc` are typed without an annotation.

  `disposable(node, owns?)` is unchanged: it is still the primitive that gives
  any node a cascading `dispose()`, and it is what `Compound` is built on. Use it
  when there is no public surface to declare - `Compound` when there is.

  `ConnectedUnit` (the element type of `owns`) is now exported too.

- 5aa2d2b: Export the module contract from every package: `disposable`, and the types
  `Disposable`, `Connector` and `ParamInput`.

  `Disposable<N>` is what every factory returns - a node with a cascading
  `dispose()` - and until now no package let you name it. `disposable(node, deps)`
  is the primitive behind that cascade: it gives `node` a `dispose()` that
  disconnects it and then disposes each of `deps`. It composes with any `dispose`
  the node already has and is idempotent. Use it to give hand-built graphs the
  same teardown the built-in modules have:

  ```ts
  import { AdsrAmp, disposable, type Disposable } from "@synthlet/adsr";

  const amp = AdsrAmp(ac, { gate });
  const out = new GainNode(ac);
  amp.connect(out);
  const synth: Disposable<GainNode> = disposable(out, [amp]);
  synth.dispose(); // disconnects out, then disposes amp
  ```

  `synthlet` previously exported only `ParamInput`; it now exports all four.

- 5aa2d2b: Every module factory now carries the list of parameters its processor
  registers, as `X.descriptors`:

  ```ts
  import { AdsrEnv, type ParamDescriptor } from "@synthlet/adsr";

  for (const p of AdsrEnv.descriptors) {
    // { name, defaultValue, minValue, maxValue, automationRate }
    slider(p.name, p.minValue, p.maxValue, p.defaultValue);
  }
  ```

  Until now a module's ranges existed only inside the compiled processor string,
  where the main thread could not see them: building a slider meant guessing.
  The list is the same one the processor registers - there is exactly one per
  module now, where before the names were written twice (in the worklet and
  again in the factory) with nothing checking they agreed. `ParamDescriptor` is
  exported from every package, and the native wrappers `Gain`, `Oscillator` and
  `BiquadFilter` in `synthlet` carry `descriptors` too, so a compound author sees
  one shape for every node.

  Two consequences of the single list, both fixes:

  - **`DattorroReverb` exposes `dryWet` and `level`.** The processor has always
    declared and read them; the factory listed neither, so two working
    `AudioParam`s were unreachable. `dryWet` is -1 dry, 0 equal, 1 wet.
  - **`Euclid`'s `subdivision` is spelled correctly.** `EuclidInputs` and
    `EuclidWorkletNode` said `subdivison`, so `Euclid(ac, { subdivison: 4 })` was
    silently ignored and `node.subdivison` was `undefined`. Passing
    `subdivision` now works; the misspelled field is gone.

  No parameter's default, minimum or maximum changed.

- c155243: Rewrite the oscillator on a discontinuity scheduler: 4-point band-limiting, a
  direct-corrected triangle, a-rate `frequency` and `detune`, and the sine back.

  **One primitive replaces three hand-written waveform branches.** Each branch
  used to predict where its own discontinuity would fall and place a correction
  from the current increment. There is now a phase accumulator, an edge detector
  and one `addDiscontinuity(d, stepHeight, slopeChange)` writing band-limiting
  residuals backwards into a four-slot pending buffer carried across render
  quanta. Every waveform is a naive function plus a list of where its
  discontinuities are.

  **The correction order goes from 2-point to 4-point.** Measured alias SNR at
  44.1 kHz, in dB, at 440 / 1000 / 2000 / 4000 / 8000 Hz: sawtooth 35.4 / 32.0 /
  29.5 / 24.7 / 18.3 becomes **45.5 / 42.3 / 40.1 / 34.5 / 26.8**, and square
  36.9 / 33.3 / 33.0 / 30.4 / 18.1 becomes **46.8 / 43.2 / 45.1 / 43.8 / 26.6**.
  In the audit's terms, the oscillator is perceptually alias-free below 7845 Hz
  rather than below 2135 Hz — the difference between aliasing audibly in the top
  octave of a piano and not.

  **The triangle is corrected directly and is no longer an integrated square.**
  The integrator, its `4 * increment` gain and the DC blocker behind it are all
  deleted together. That blocker had a −3 dB corner at 63.4 Hz, inside the musical
  range: a 20 Hz triangle peaked at **0.201** of full scale, 55 Hz at 0.524,
  110 Hz at 0.795. It now peaks at **0.999 / 0.998 / 0.995**. Its alias SNR at
  440 Hz goes from 65.7 dB to **80.7 dB**. And because there is no recursive state
  left, the cold-start transient goes too: a render from silence used to peak at
  1.777 while the integrator settled, and now peaks at exactly 1.000.

  **`frequency` and `detune` are a-rate.** Both are read per sample instead of
  once per 128-frame render quantum, so the oscillator does audio-rate FM and
  sample-accurate pitch instead of quantising all modulation to 2.9 ms. A held
  value costs one comparison per sample and is bit-identical to the k-rate path.

  **Two samples of latency, about 45 µs.** The 4-point correction spans ±2 samples
  around a discontinuity, so it is written into samples already computed but not
  yet emitted. That is what makes the placement exact under fast modulation, where
  a predictive correction lands wrong. It is constant and it is the only latency
  in the library.

  **Breaking changes.** The library is pre-1.0 and this version is unpublished;
  nothing is kept behind a flag.

  - **`PolyblepOscillatorType` renumbers**, in brightness order:
    `Sine = 0, Triangle = 1, Sawtooth = 2, Square = 3`. It was
    `Sawtooth = 0, Square = 1, Triangle = 2`. The default is still the sawtooth,
    so a patch that never sets `type` is unaffected; a patch that sets it by
    **number** now selects a different waveform, and should use the enum.
  - **The square's polarity flips** to `+1` for the first half of the cycle, per
    the Web Audio spec. It was inverted relative to `OscillatorNode`.
  - **The sine is restored** (it was deleted a while ago and never replaced) and
    is the cheapest waveform in the file: no discontinuity, so no correction.
  - **The triangle's shape and level change**, per the numbers above.
  - **`frequency` and `detune` change `automationRate`** from `k-rate` to
    `a-rate`. Reading `descriptors` for the rate is the only thing that can
    notice; `frequency` keeps `minValue: 0`, which `connectParams` requires.
  - **A `type` change is now band-limited**, so switching waveform mid-note no
    longer steps the output.

  Attribution: the scheduling structure derives from Mutable Instruments' stmlib
  (`stages/oscillator.h`, MIT), recorded in `THIRD-PARTY-LICENSES.md`. The
  band-limiting polynomials are not stmlib's — they are B-spline residuals derived
  by integration, with the derivation and its proofs in `src/_blep.ts` and
  `src/blep.test.ts`.

- c155243: Hard sync, and the phase it resets to.

  A new a-rate `sync` parameter and a new `phase` construction option:

  ```ts
  const master = PolyblepOscillator(ac, { frequency: 110 });
  const slave = PolyblepOscillator(ac, { frequency: 660, sync: master });
  ```

  **The reset is sub-sample and band-limited.** A rising edge on `sync` — the
  transition from non-positive to positive, synthlet's one gate contract — is not
  an assignment to the phase. It is a step _and_ a slope change at an interpolated
  instant, scheduled through the same primitive as every wrap and every pulse
  edge, so it is corrected rather than spliced. The sample after the edge is
  `naive(phase + d·inc) + height·blepResidual4(d)` to within **2.0e-3** at 440 Hz
  and 4.6e-3 at 1000 Hz. Read the same sample against `blepResidual4(0)` — which
  is what an integer-sample reset produces — and the error grows monotonically
  with the crossing fraction, 0.039 to 0.403. That difference is the feature.

  **The triangle ships with the others.** A hard-synced triangle is not
  C¹-continuous: the reset produces a corner as well as a step, which is why the
  audit expected sync for the saw and square first and triangle-sync as separate
  work. The scheduler takes a step height and a slope change in the same call, so
  it is the same line of code. Predicting the sample with the BLAMP term is four
  times closer than predicting it without, against a slope change of 0.36 to 0.88
  per sample.

  **A reset is two sub-advances, not one.** The phase runs to the reset instant,
  jumps, and runs on to the sample, so a wrap or a pulse edge on either side of
  the reset is corrected exactly once and at its own age. Advancing once and
  resetting afterwards — the obvious reading — schedules crossings the reset
  pre-empted and never walks the ones it really makes: measured over 432 settings
  that peaks at **2.6190** against **1.0037** for the version shipped.

  **Bounded where it is driven hardest.** A reset arriving every 1–32 samples
  peaks at 1.1667 over 672 settings and a gate driven by white noise at 1.0875 —
  unlike `width`, whose flips can bunch inside the kernel's support, a reset's
  step height shrinks as the resets get closer together. A master at 333.7 Hz
  holds 1.0027 across 288 settings, and `sync` held at −1, 0, 1, NaN or Infinity
  is finite for every waveform at every declared frequency and width.

  **Against an uncorrected reset**, measured as alias SNR with a non-integer
  master period: **+0.94 dB to +23.82 dB** better than assigning the phase at the
  sample boundary, the margin growing with the slave/master ratio, and +0.85 to
  +13.71 dB better than the same phase trajectory with only the correction
  missing.

  **`phase` is a construction option, not an AudioParam** — a one-time initial
  condition, and where `sync` restarts. A number is taken modulo 1; `"random"`
  draws once per instance, which is what stops three detuned oscillators stacked
  into a supersaw starting phase-locked and combing through the attack.

  **Nothing that does not use `sync` changes.** A render with no gate, and a
  render with a gate that never goes positive, are both bit-for-bit what the
  previous version produced — verified across **3584** fingerprinted renders
  covering two sample rates, every waveform, sixteen frequencies including
  negatives and `-0`, seven widths, two block sizes and both k-rate and a-rate
  parameter arrays.

- c155243: `frequency` goes bipolar: through-zero FM.

  The declared range is now `-20000…20000` Hz, the increment clamps to
  `[-0.25, 0.25]`, and a negative frequency **runs the phase backwards**. A
  modulator connected to `frequency` is no longer half-wave rectified at the
  bottom — and rectifying it did not merely limit the sound, it produced a
  different, wrong spectrum, because a rectified modulator is not the modulator
  that was patched. `AudioParam` sums its inputs with the intrinsic value, so
  connecting a node to `frequency` is _linear_ FM by construction, which is the FM
  that has a through-zero behaviour worth having.

  **A backward wrap is band-limited.** The discontinuity scheduler does not care
  which direction a boundary was crossed from: it takes an age and a signed
  height, so a backward crossing is the same call to the same primitive with its
  signed quantities negated. Measured alias SNR at a negative frequency equals the
  positive figure **to the decimal** in every cell of the existing table — the
  sawtooth 45.5 / 42.3 / 40.1 / 34.5 / 26.8 dB and the square 46.8 / 43.2 / 45.1 /
  43.8 / 26.6 dB at 440 / 1000 / 2000 / 4000 / 8000 Hz — and peaks match to four
  decimals. The tests assert the negative side against the _same_ floors and
  bounds the positive side promises rather than against a second table.

  **The mirror identities hold.** The sine at `-f` is the negation of the sine at
  `+f` to 2.1e-13, the sawtooth and square to 3.0e-8 and 3.3e-12, and the
  symmetric triangle at `-f` equals the triangle at `+f` **exactly** — zero
  difference, not a tolerance — because at `width = 0.5` its naive function is
  even about phase 0 and both of its corners keep their sign under time reversal.

  **Through zero stays in range.** A linear sweep from +2000 to -2000 Hz across a
  block and an audio-rate `200 + 3000·sin(2π·220·t)` — 440 sign changes a second —
  both peak at exactly 1.0000 for every waveform and width, with no first
  difference larger than the square's own edge. `frequency = 0` still holds, and
  so does `-0`.

  **Nothing that does not use a negative frequency changes.** A positive-frequency
  render is bit-for-bit what the previous version produced, verified across 452
  fingerprinted renders covering every waveform, seventeen frequencies, five
  widths, the cold degenerate grid and a-rate `frequency` and `width` arrays.

- c155243: Add `width`: pulse width on the square, peak position on the triangle.

  One a-rate parameter, `0…1`, default `0.5`, meaning two related things. On the
  **square** it is the pulse width, which is the staple virtual-analog sound and
  has no Web Audio equivalent — `OscillatorNode` offers four fixed shapes and a
  `setPeriodicWave` that cannot be swept. On the **triangle** it is the peak
  position: symmetric at 0.5, a rising ramp towards 1 and a falling one towards 0,
  which is a continuous waveform morph. The sine and the sawtooth ignore it; a
  "skewed sawtooth" is the triangle at `width → 1`.

  It goes through the same discontinuity scheduler everything else does — moving
  `width` moves where the second discontinuity sits, and nothing else changes.

  **Measured alias SNR at 44.1 kHz, in dB.** Pulse, DC removed, at 440 / 1000 /
  2000 / 4000 / 8000 Hz: a 25% pulse reads 46.4 / 43.7 / 44.7 / 32.3 / 36.8 and a
  10% pulse 42.6 / 37.4 / 36.8 / 39.4 / 36.8. A skewed triangle at 440 / 1661 /
  4186 Hz reads 79.2 / 60.1 / 48.9 at `width = 0.75` and 65.6 / 59.6 / 53.6 at
  0.95, against 56.6 / 38.8 / 26.5 and 44.4 / 28.4 / 13.7 with no corner
  correction at all. A pulse's peak is 1.000 at every width and frequency
  measured, and its mean is `2 · width - 1` — a pulse wave has real DC, and that
  is signal.

  **`width` is clamped to `[2·|increment|, 1 - 2·|increment|]` per sample**, so it
  cannot quite reach 0 or 1. Two samples is the 4-point kernel's support, so any
  closer and the two corrections overlap; on the triangle the same bound is what
  keeps the corner finite as the short ramp gets short. The declared range is
  still `0…1` — that is the range a slider should offer — and the DSP is total
  across it, at every frequency including 0. At 440 Hz the clamp allows a 2%
  pulse, at 4 kHz an 18% one.

  **`width = 0.5` is bit-identical to the previous release's square and
  triangle**, so nothing that does not set it changes.

### Patch Changes

- 75e8ac9: One spelling for reading an `AudioParam` array: the hoisted `length > 1` check, written
  down next to `ParamDescriptor` in the module contract every package carries.

  The library had three spellings of one rule and none of them written anywhere a package
  author would look. `length === blockLength` is the fragile one: it agrees with `length > 1`
  whenever the block being rendered is a whole render quantum, and is silently wrong the
  moment a DSP renders a **sub-block**. `karplus-strong` splits a block at each trigger edge
  and renders the segments between them, and `virtual-analog-filter` now renders one segment
  per distinct cutoff, so in a 40-sample segment a 128-sample parameter has
  `length !== blockLength` and would be read once and held.

  No behaviour changes in any shipped configuration. The two tests are the shape of the
  argument: `karplus-strong` renders correctly when a trigger edge splits a block and
  `frequency` arrives as a single value, and the same when it arrives per sample.

  `wavetable-oscillator` gains one real improvement from the change. Its stochastic barriers
  were tested for presence rather than substituted with a stand-in, partly because under
  `length === n` a one-element stand-in _was_ a-rate whenever the block was one sample long,
  and the stage would engage on an input nobody supplied. `length > 1` is never true of a
  stand-in, so that hazard is gone.

- 5aa2d2b: Fix parameter ranges. Now that `X.descriptors` is public, every `minValue` and
  `maxValue` is a hint to whoever builds a UI, and several were wrong.

  **Enum-typed parameters no longer advertise values their enum doesn't have.**
  A slider built from `Lfo.type`'s range offered 0…100 for an 11-member enum.
  Each maximum is now the enum's highest member: `Noise.type` 1, `Lfo.type` 10,
  `ClipAmp.type` 1, `Svf.type` 6, `Param.scale` 3. Values above those were never
  valid enum members - the processors already fell back to the first type - so
  this only stops you setting a number that did nothing.

  **`PolyblepOscillator`'s `detune` is bipolar**: `-1200…1200` cents (±1 octave),
  where it was `0…10000`. Detuning _down_ was impossible: the `AudioParam`
  clamped every negative value to 0, so an LFO patched into `detune` produced an
  upward-only half-wave instead of vibrato. **Breaking** if you set a detune
  above 1200 cents; use `frequency` for intervals wider than an octave.

  **`AdEnv`/`AdAmp` and `AdsrEnv`/`AdsrAmp` share one range for `gain` and
  `offset`**, both `-20000…20000`. The two packages compute the same
  `value * gain + offset` and disagreed on its bounds: `AdEnv` could not invert
  an envelope (`gain` was `0…10000`) and neither could offset one downwards.
  Both are widenings.

  **`AdsrEnv`/`AdsrAmp`'s `release` maximum is 10 seconds**, matching `attack`
  and `decay`, where it was 100. **Breaking** for a release longer than 10 s.

  **`Arp`'s `baseNote` maximum is 127**, the MIDI note range, where it was 200.

  `Param`'s `input`, `offset`, `min`, `max`, `gain` and `mod` keep `±20000`: a
  `Param` carries whatever value its destination needs and has no natural range.
  Its README now says so.

- c155243: Write the README, fix the attribution, add the package metadata.

  **The README is a real one.** It used to open with a citation matching no paper
  ("PolyBLEP … Valimaki et. al 2010") and a usage example that was literally
  `import {} from "@synthlet/polyblep-oscillator"`. It now has a pasteable example,
  a parameter table matching `src/params.ts` cell for cell — `type`, `frequency`,
  `detune`, `width`, `sync`, plus `phase` as a construction option — and the four
  conventions a user cannot guess: phase 0 sits at the step for the saw and square
  and at the triangle's _minimum_; the square is `+1` for the first half of the
  cycle, per the Web Audio spec; `frequency = 0` holds and a negative frequency runs
  the phase backwards; the output is delayed by two samples, about 45 µs at
  44.1 kHz, and nothing else in the library has any latency.

  **The quality figures are in it, scoped.** Alias SNR in dB at 44.1 kHz — sawtooth
  45.5 / 42.3 / 40.1 / 34.5 / 26.8, square 46.8 / 43.2 / 45.1 / 43.8 / 26.6,
  triangle 80.7 / 70.2 / 67.0 / 60.6 / 36.2 at 440 / 1000 / 2000 / 4000 / 8000 Hz —
  each asserted by `src/dsp.test.ts` as a floor at the measured value minus 1.5 dB.
  The metric is described in one sentence and stated to be this repository's own,
  comparable within it and not against published figures. There is deliberately
  **no dB number for the comparison against `OscillatorNode`**: nobody has measured
  the native node with the same metric, so the docs page runs the two side by side
  with a spectrum analyser on each instead.

  **The attribution is correct.** The quadratic PolyBLEP residual is credited to
  Välimäki & Huovilainen 2007, not to Brandt 2001 — Brandt's paper contains no
  polynomial at all and is cited for hard sync and MinBLEP. `THIRD-PARTY-LICENSES.md`
  now separates the five papers it cites from the one source it derives from
  (stmlib, MIT), states that the residuals in `src/_blep.ts` were derived by
  integrating the cardinal B-spline rather than transcribed from any table, and
  retires the sndkit credit with its reason: the 2-point correction it described was
  deleted by the discontinuity-scheduler rewrite, and The Unlicense owed no notice
  in the first place.

  **`package.json` gets `repository` (with `directory`) and `homepage`**, pointing
  at the docs page.

- c155243: Fix the triangle and make the oscillator total over its declared parameter range.

  **The triangle's integrator gain was dimensionally inverted.** It read `4 / frequency`
  where an integrated square needs `4 * increment`, so the triangle's amplitude was off by
  `sampleRate / frequency²` — 17.7 at 20 Hz, 0.178 at 440 Hz, 0.0006 at 7 kHz, against a
  nominal 1.0 — and it used the pre-detune frequency, so `detune` changed the pitch but not
  the compensating gain. The triangle now peaks at 0.978 at 440 Hz. **This is a large,
  audible amplitude change**: a patched triangle will be much louder above ~250 Hz and
  quieter below it. The residual low-end roll-off (0.20 at 20 Hz, 0.80 at 110 Hz) is the DC
  blocker and is not addressed here.

  **`frequency = 0` no longer kills the node.** `4 / 0` was `Infinity`, which drove the
  accumulator to `-Infinity` and the output to `NaN` — permanently, for the life of the
  node. Because `connectParams` sets an `AudioParam` to 0 before connecting a node to it,
  every `MonoSynth` hit this on its first render quantum. Zero frequency now simply holds.

  Also: the phase wraps with `floor` so it survives an increment of 1 or more, the
  increment is clamped to 0.25 cycles/sample so `polyblep()`'s two branches cannot overlap,
  a fractional `type` selects the nearest waveform instead of falling back to a sawtooth,
  the integrator state resets when the waveform changes, and the square no longer emits an
  occasional `-2` sample caused by a rounding disagreement in its half-cycle phase
  (reachable at 2205 Hz at a 44.1 kHz sample rate).

## 0.2.0

### Minor Changes

- - Add `detune` parameter to Polyblep oscillator

## 0.1.0

- Initial release
