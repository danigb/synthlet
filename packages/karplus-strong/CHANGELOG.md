# @synthlet/karplus-strong

## 0.2.0

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

- 792d627: One gate/trigger contract, shared by every module that reads one:

  > A gate is on while the signal is positive. A trigger is the transition from
  > non-positive to positive.

  These five packages used four different detectors between them. `ad`, `arp` and
  `impulse` fired only when the parameter read **exactly `1`**; `karplus-strong`
  wanted `>= 1` with the previous value below `0.9`; `adsr` used a Schmitt trigger
  that opened at `0.9` and closed below `0.1`. So `Param.mul(trigger, 0.5)` drove
  none of them, a gate peaking at 0.85 was silently ignored by the ADSR, and the
  same clock fired an AD and an ADSR at different moments.

  `> 0` is the rule SuperCollider, Faust, Max/RNBO and sndkit use - for
  `@synthlet/ad` it is a return to the contract of the code it ports. It needs no
  threshold to defend, and it survives `Param`'s `input * gain + offset`, so
  scaling a gate line can no longer silently stop it working. A bipolar `Lfo` is
  now a 50 % gate for free.

  **Migration.** Any positive signal now fires. Two cases change:

  - Feeding a `Clock`'s phase ramp straight to a trigger used to fire on the beat
    by accident, and now latches on. Connect `clock.gate` instead.
  - A gate driven with `setTargetAtTime` never closes: the signal approaches zero
    without arriving. Use `setValueAtTime` or `linearRampToValueAtTime` - a gate
    line is never smoothed, the envelope is the smoother.

  `@synthlet/ad` and `@synthlet/adsr` also read their control param per sample
  when it is `a-rate`, so `env.gate.automationRate = "a-rate"` gives
  sample-accurate sequencing instead of one quantised to the 128-frame render
  quantum (up to 2.9 ms at 44.1 kHz). The declared default is still `k-rate` and
  that path is byte-identical.

- 3aac0de: `stiffness` (0-1, default 0): dispersion, the last of the three blocks Bank and
  Välimäki factor the string loop into - `Hl(z) = Hloss(z)·Hdisp(z)·Hfd(z)` - and
  the one this package never had. Every partial it produced was an exact integer
  multiple of the fundamental, because the loop was a pure delay.

  Real strings are stiff. The bending term in the restoring force makes high
  partials travel faster, so partial `k` sits at `k·f0·sqrt(1 + B·k²)` rather than
  at `k·f0`, and that stretch is most of what separates a piano, a clavinet or a
  steel-string from a synthetic comb.

  ```ts
  KarplusStrong(ac, { frequency: 110, decay: 3, stiffness: 1 }); // clangorous
  ```

  Measured on the 110 Hz string, cents sharp of the harmonic series:

  | stiffness | 4th partial | 8th  | 16th |
  | --------- | ----------- | ---- | ---- |
  | 0         | 0.0         | 0.0  | 0.0  |
  | 0.25      | 0.1         | 1.0  | 8.1  |
  | 0.5       | 0.3         | 3.4  | 19.6 |
  | 1         | 6.6         | 38.6 | 91.8 |

  The filter is **Rauhala and Välimäki's tunable dispersion filter** (IEEE Signal
  Processing Letters 13(5), 2006): a second-order Thiran allpass whose
  coefficients come from the fundamental and the inharmonicity coefficient `B` in
  closed form, so it is redesigned every block and the stiffness **tracks the
  pitch** instead of being baked in at build time. One section, chosen by
  measurement rather than preference - their Table I fits the parameterization per
  cascade length, and their four-section design stops dispersing above about a
  kilohertz where one section runs to 2.8 kHz for a quarter of the cost.

  **The `stiffness → B` taper is ours and unsourced**: `B = 1e-5 · 100^stiffness`,
  an exponential across the two decades of inharmonicity coefficient the paper
  searched for pianos. No paper prescribes a knob mapping; the filter is theirs,
  the taper is a product decision.

  Three things it deliberately does not do.

  - **It does not change the pitch.** An allpass has phase delay and the loop
    gives back exactly what it takes, computed at the fundamental in closed form.
    Measured spread of the fundamental across `stiffness: 0…1` is **0.004 cents**
    at 110, 440 and 1760 Hz, and `frequency.maxValue` is unchanged.
  - **It does not change the decay.** An allpass has unity magnitude at every
    frequency, so `decay` and `brightness` keep sole ownership of it: t₆₀ measures
    0.851 / 0.861 / 0.840 s at stiffness 0 / 0.5 / 1 at 110 Hz.
  - **It costs nothing at 0.** The default render is bit-identical to the previous
    release. Engaged, it is 20 → 34 ns per sample, 0.09% → 0.15% of one core.

  It is **not** `stretch`, and `stretch` is not it: that lengthens high-partial
  decay, this moves partial frequencies. Both ship, and they compose.

- 3aac0de: The pluck has a level, a dynamic, a position and a pick angle. **This changes
  the sound of every patch that uses the Karplus-Strong oscillator**, and it is
  the second and last of the deliberate breaking changes in this round.

  Every pluck used to be identical: the string was excited with **full-scale
  white noise**, measured peak 0.96-0.99, with no level, no shaping and no
  position. So a pluck was a 0 dBFS transient whatever the patch's gain staging,
  soft and hard plucks were indistinguishable, and plucking at the bridge sounded
  like plucking over the soundhole. What is there now is Smith's Extended
  Karplus-Strong excitation chain,
  `excitation : smooth(pickangle) : pickposfilter : levelfilter(L,freq)`, every
  filter of it **outside** the feedback loop - so none of these four can change
  the decay time or destabilise the string.

  - **`level`** (0-1, default **0.5**) scales the burst before the filters. A
    default pluck now peaks at about -13 dBFS instead of 0.
  - **`dynamics`** (0-1, default **0.5**) is the dynamic-level filter: "in real
    strings, the spectral centroid typically rises as plucking/striking becomes
    more energetic". Soft plucks are darker. It maps to Smith's level-at-Nyquist
    as `L = dynamics^(5/3)`, the exponent that puts his own default of -10 dB at
    the middle of the knob; 1 bypasses the filter. Sweeping it from 1 to 0 moves
    the attack's spectral centroid from 4208 Hz to 1395 Hz at A4 and leaves the
    decay time within 13%.
  - **`position`** (0-0.5, default **0.13**, Smith's) is the pick-position comb,
    `1 - z^-floor(position*P)`, with 0 at the bridge. Its first notch lands at
    `frequency/position` - measured within 0.3% at 110 and 440 Hz. **0 bypasses
    it.** The comb delay is truncated to a whole sample rather than interpolated,
    which is Smith's own choice ("pick position accuracy is normally not
    critical"); the cost is up high, where the notch can land several percent off
    - 8.6% at 880 Hz with the default position.
  - **`pickAngle`** (0-0.9, default **0**) is the pick-direction one-pole: "real
    up-picks may be at different angles than down-picks, thus resulting in
    different plucking stiffness". At 0.9 it takes 10.3 dB out of the first 5 ms
    above 5 kHz.

  To get the old excitation back, set `level: 1, dynamics: 1, position: 0`. That
  is not just approximately the old burst, it is the same burst.

  The burst is also **zero-mean** now, and that fixes a real defect: the loop
  filter's taps sum to 1 at every brightness, so a dc offset in the excitation
  decayed at exactly the loop gain and outlived every partial. The audible effect
  was small, but the decay time was not what it looked like - at 1760 Hz a
  `decay` of 1 measured anywhere between 0.36 and 1.02 s depending on the draw,
  because what rang last was the residue rather than the string. Notes now decay
  as the loop says they should, which at 1760 Hz and the default `brightness`
  means **0.33 s rather than the requested 1 s**: `rho` is derived for the loop's
  gain at dc, and the damping filter takes its own bite at the fundamental, which
  grows with pitch. At `brightness: 1`, where the damping filter is transparent,
  `decay` is exact at every pitch. Making it exact at every brightness needs a
  loop filter designed per note, which this package does not have yet.

- 3aac0de: The string's timbre no longer depends on its tuning, and `frequency.maxValue`
  is now a number that is true.

  The fractional delay was read with two-point linear interpolation, which is a
  lowpass whose loss at Nyquist is `|1 - 2*frac(sampleRate/frequency)|` applied
  once per trip round the loop. That made the timbre a near-arbitrary function of
  the pitch: five pitches within 20 cents of A4 spanned 52.7 dB of high-band
  decay, and at 441 Hz - exactly `44100/100` - nothing above 5 kHz decayed at
  all. Smith describes the artifact by name: certain notes "jump out as 'buzzy'
  when they correspond to a nearly integer delay-line length".

  The read is now a five-tap, fourth-order Lagrange interpolation, which is what
  Smith's own Extended Karplus-Strong listing uses (`fdelay4`) and what the
  Helsinki group has historically used for digital-waveguide fine-tuning. The
  same five pitches now span about 1 dB. Lagrange rather than allpass because it
  is "robust under rapidly time-varying conditions", which is what a pitch glide
  needs.

  **`frequency.maxValue` drops from 20000 to 5000.** The old number was never
  playable: 20 kHz is 2.2 samples of delay, which is not a string. 5 kHz is 8.8
  samples, and it is the highest round number whose measured pitch stays inside 5
  cents on every pluck - at 5500 Hz the worst pluck is 8.3 cents out, at 6000 Hz
  21 cents. An `AudioParam` whose value is set above the new maximum is clamped
  to it by the browser, as it always was; what changes is that the clamp is now
  at a frequency the module can actually play.

  Notes ring slightly longer as a result, since the interpolator is no longer
  adding loss the decay model did not know about: measured t60 at `decay = 1`
  moves from 0.83/0.85/0.89 to 0.84/0.85/0.90 seconds at 110/440/1760 Hz, and
  from 0.87 to 0.95 at `brightness = 1`, where the damping filter is transparent
  and only `decay` is left.

- 3aac0de: There is a lowpass in the feedback loop, `decay` is a decay time in seconds,
  and `brightness` controls the tone. **This changes the sound of every patch
  that uses the Karplus-Strong oscillator.**

  The loop filter was a bare scalar - it had been one since the first commit, so
  nothing was removed - which is why the module never sounded like a plucked
  string: high partials have to die before low ones, and here nothing made them.
  What damping there was came from the two-point interpolator used for the
  fractional delay, whose loss is `|1 - 2*frac(sampleRate/frequency)|`, so the
  timbre was a near-arbitrary function of the pitch: at 441 Hz the band above
  5 kHz never decayed at all, and one semitone away it was gone in 250 ms.

  The loop now runs Smith's Extended Karplus-Strong two-zero damping filter,
  `rho * (h0*x' + h1*(x + x''))` with `h0 = (1+brightness)/2` and
  `h1 = (1-brightness)/4`. Its impulse response is symmetric, so its delay is
  exactly one sample at every frequency and `brightness` changes the tone without
  detuning the string.

  **`decay` is now seconds** - the time the note takes to fall 60 dB - and means
  the same thing at every pitch. It used to be a count of periods, so one knob
  position rang for 3.2 s at 110 Hz and 0.22 s at 1760 Hz. To keep an existing
  patch ringing for the same time, convert at the pitch you wrote it for:

  ```ts
  decay * 0.1 * (sampleRate / frequency); // old knob -> seconds
  // e.g. decay: 0.1 at A4 and 44.1 kHz was about 1.0 s
  ```

  `decay`'s default moves from 0.1 to 1 second accordingly; its declared range,
  0.01 to 5, is unchanged and now reads as what it always looked like.

  **`brightness` is new**: 0 to 1, default 0.5. 1 is the brightest the loop can
  be - the damping filter degenerates to a plain delay and only `decay` remains -
  and 0 is the most a three-tap symmetric filter can damp, a zero at Nyquist. It
  does not change the decay time: the filter's DC gain is `rho` whatever
  `brightness` is.

- 3aac0de: The pitch can move while the string rings. `frequency` is now `a-rate`, and the
  loop length follows it sample by sample.

  `frequency` used to be read once, on the rising edge of `trigger`. Changing it
  while a note rang did nothing - no glide, no bend, no vibrato, no portamento -
  even though the parameter was being read every block, which invited exactly the
  opposite assumption. A string whose pitch cannot move is not an instrument
  anyone plays.

  ```ts
  const frequency = Param(ac, 220);
  const ks = KarplusStrong(ac, { trigger, frequency });

  // a bend, while the note rings
  frequency.linearRampToValueAtTime(440, ac.currentTime + 0.5);

  // or vibrato, by patching an oscillator in
  const vibrato = Lfo(ac, { frequency: 5, gain: 12 });
  vibrato.connect(ks.frequency);
  ```

  There is no `glide` or `vibrato` parameter and there will not be one: ramping a
  param is the caller's job, `@synthlet/param` already does it, and an audio-rate
  connection is what makes an `Lfo` work here.

  A k-rate parameter steps once per 128-frame block, so the loop length is
  interpolated across the block rather than stepped: the sample-to-sample
  difference at a block boundary during a slide is the same as it is anywhere
  else, which is measured rather than asserted. A slide of one octave in half a
  second tracks the requested pitch within 2.1 cents and stays within 0.5 dB of
  the same note held still.

  Nothing changes for a patch that leaves `frequency` alone: with one value per
  block the delay's target never moves, and a static note measures exactly as it
  did before.

- 3aac0de: `damp`, and a pluck that no longer erases the string. With these and the a-rate
  `frequency` that was already there, the gesture vocabulary of a plucked-string
  controller is complete: **pluck, damp, re-pluck, slide, legato**.

  **A re-pluck adds to a ringing string instead of resetting it.** `pluck` used to
  begin by wiping the delay line and every filter state in the loop — the one thing
  a real string never does. It does not any more, and the difference is measurable:
  re-plucking 300 ms into a ringing note leaves it **11.3 dB louder** than the same
  note left alone, and the samples before the re-pluck are unchanged to the bit. A
  re-pluck whose `level` is 0 is now exactly a no-op on the ringing string, where
  before it would have stopped the note dead.

  Clearing the string is a separate thing, and it happens where a string really
  does fall silent — the auto-stop — so a fresh note still starts from rest.

  **`damp`** (0–1, default 0) is the other hand:

  ```ts
  KarplusStrong(ac, { frequency: 110, decay: 3, damp }); // damp 1: gone in 50 ms
  ```

  It works by **raising the loop's loss**, not by pulling down the output —
  Laurson, Erkut, Välimäki and Kuuskankare 2001 keep the loop-filter coefficients
  time-varying precisely because "they must be changed, for example, during
  attenuation or re-plucking of the string". That distinction is audible: muting
  through the loop is the same mechanism as decaying, so a damped string keeps its
  own spectral tilt on the way down and dies **dark** — measured 30 ms into a mute,
  the 3–10 kHz band loses 46.2 dB where 300–1500 Hz loses 42.5 — where an output
  gain would take every frequency down together and sound like a fader.

  - At 1 a ringing note is under −60 dBFS in **47–53 ms** at 110, 440 and 1760 Hz.
  - The knob is geometric in the decay time, `decay^(1−damp) · 0.05^damp`, so with
    `decay` at 1 s the quarter points measure 0.44, 0.19 and 0.08 s. Adding loss
    linearly instead would have put the whole mute in the bottom fifth of the range.
  - Both polarizations are damped: a hand lands on the string, not on one plane of
    it, and at `damp: 0` the second loop's gain is exactly what it was.
  - The loop gain is interpolated across the block, so engaging a mute — a factor
    of twenty in one block — is a ramp rather than a step.

  **Legato** works and is now asserted: changing `frequency` with no trigger moves
  the pitch (measured 220.10 → 329.84 Hz) with no step at the block boundaries.
  What made this possible was removing the delay _snap_ from `pluck` for a string
  that is already ringing; a new note still starts in tune rather than gliding into
  it.

  `damp: 0` is bit-identical to the previous release, and a pluck onto a silent
  string is unchanged sample for sample — all 109 existing assertions measure
  exactly that.

- 3aac0de: `stretch` and `blend`: Karplus and Strong's own two probabilistic variants,
  from the 1983 paper this package is named after - the ones its title is about,
  "Digital Synthesis of Plucked-String **and Drum** Timbres". Both are neutral at
  their defaults, so nothing changes for an existing patch: with `stretch: 1` and
  `blend: 1` the module renders the same samples it did before, bit for bit.

  **`stretch`** (1-20, default 1) is their decay stretching: apply the damping
  filter with probability `1/S` and pass the sample through unchanged otherwise,
  so "the decay time of each overtone is approximately multiplied by S". The loop
  gain `decay` sets is applied every round trip whatever the coin says, so `decay`
  stays the ceiling and what this lengthens is the high end - which is what the
  damping filter shortens. The third partial of a 1760 Hz string decays 3.5x more
  slowly at `stretch: 4`.

  ```ts
  KarplusStrong(ac, { frequency: 1760, decay: 1, stretch: 4 }); // high notes ring
  ```

  It does not detune the string as it moves - measured spread across
  `stretch: 1...20` is under 0.8 cents - which is not free: it is the linear-phase
  damping filter, whose delay is exactly one sample whether the coin applies it
  or skips it. It is also **not** dispersion, which moves partial _frequencies_
  rather than lengthening their decay.

  **`blend`** (0-1, default 1) is the drum algorithm Kevin Karplus discovered in
  December 1979: negate the loop signal with probability `1 - b`.

  - **1** is the plucked string, and the buffer length is the pitch.
  - **1/2** is "drumlike", and it measures like one: the peak autocorrelation
    falls from 0.996 to 0.16 and the spectral flatness rises from 0.00003 to
    0.54. At that blend the buffer length stops being a pitch and becomes a decay
    - "the decay time is roughly proportional to p" - so `frequency` is a drum
      size knob: 100 Hz is their snare, 1 kHz their brushed tom.
  - **0** is their "harplike" case: the pitch drops exactly an octave and only
    the odd harmonics of the new fundamental survive, measured 80 dB down.

  With `blend` below 1 the loop is loaded with a **constant** rather than noise,
  which is their Fig. 4: "the drum algorithm will create the randomness itself...
  starting with a constant gives some buildup before the decay". Set `position: 0`
  with it - the pick-position comb is a string filter and a comb annihilates a
  constant.

  The coins come from a private xorshift32 rather than `Math.random` - measured
  3x cheaper (1.35 ns a call against 4.05), and separate, so the loop's randomness
  does not disturb the excitation's.

- 3aac0de: `tension`: the initial pitch glide. A hard pluck stretches the string, which
  raises its tension, which raises its pitch — and it all slides back down as the
  vibration decays. It is the sound of a snapped bass string, an electric guitar
  dug into, a tom-tom. Until now this module's pitch was constant from the first
  sample to the last at every dynamic level.

  ```ts
  KarplusStrong(ac, { frequency: 110, decay: 3, level: 1, tension: 0.5 }); // it bends
  ```

  The glide is driven by the pluck's **energy**, following Avanzini, Marogna and
  Bank 2012 — _"the short-time average of the tension variation, which is
  responsible for pitch glides, is approximately proportional to the system
  energy"_ — and specifically their §V-B energy storage model, which applies
  exactly when the excitation is an initial state rather than a continuous driver:
  the burst's energy seeds it and the loop's own dissipation decays it. Not
  Tolonen et al.'s elongation sum, which costs "hundreds of addition and
  multiplication operations per sampling interval" and gets worse as the pitch
  falls.

  **The glide scales with `level²`**, so a soft pluck glides less than a hard one —
  the entire physical point. Measured at 349 Hz, `tension: 0.5`: 0.9 / 2.6 / 5.3 /
  8.9 Hz at `level` 0.25 / 0.5 / 0.75 / 1.

  **The taper is ours, but every point on it is a measured number.** Järveläinen
  and Välimäki 2001 measured detection thresholds of 3.1 / 4.4 / 5.4 / 11.7 Hz at
  116.5 / 196 / 349 / 659 Hz. At a full-scale pluck this module glides:

  | `tension` | 116.5 Hz | 196 Hz | 349 Hz | 659 Hz |
  | --------- | -------- | ------ | ------ | ------ |
  | threshold | 3.1      | 4.4    | 5.4    | 11.7   |
  | 0.1       | 0.8      | 1.3    | 2.2    | 2.7    |
  | 0.5       | 2.9      | 5.6    | 8.9    | 15.7   |
  | 1         | 6.0      | 10.5   | 19.1   | 31.6   |

  so mid-range sits on the thresholds and the top clears them by 2–3×. Their Fig. 1
  is a recorded electric guitar gliding 499 → 496 Hz, "approximately 3 Hz"; this
  module measures **2.75 Hz** there at `tension: 0.1`.

  **The contour needed no tuning.** Järveläinen and Välimäki built their stimuli
  with "the time constant of the frequency descent … 50% of the overall time
  constant of amplitude decay". A descent with half the amplitude's time constant
  is a descent proportional to amplitude _squared_ — which is energy. The two
  papers are the same statement, and implementing either gives the other.

  **Default 0, deliberately.** Their own conclusion is that "any pitch glide weaker
  than the given threshold remains inaudible for most listeners and could be left
  unimplemented in digital sound synthesis", and at the shipped `level` a
  physically-scaled glide sits near that threshold. So it ships as an effect a
  patch asks for: `tension: 0` is bit-identical to the previous release and does
  not even accumulate the burst's energy. With it on, +4 ns/sample averaged over a
  `decay: 1` note and +9 over a `decay: 5` one — most of which is the fractional
  delay's interpolator recomputing its kernel, not the energy model, which is one
  multiply.

  Three things it does not do.

  - **It does not move the settled pitch.** The energy decays to zero and the
    modulation with it, so the string ends where `frequency` asked: within 0.41
    cents at 110, 440 and 1760 Hz at every `tension`.
  - **It cannot destabilise the loop.** The energy is open loop — seeded by the
    pluck, decayed by `rho`, never touched by the loop's own signal — so there is
    no path by which the delay drives its own modulation, and nothing feeds energy
    into the string. Asserted over 60 s renders with every loop parameter at a
    corner at once.
  - **It is a pitch glide, not a full tension-modulation model.** The nonlinearity
    also couples harmonic modes (Tolonen et al. 2000 name both effects); the
    quasi-static approximation this rests on reproduces only the first.

- 3aac0de: `detune` and `polarization`: a second string loop, and with it the two things
  Karjalainen, Välimäki and Tolonen say separate a plucked string from a
  "synthesizer-like" tone — **beating**, and a **two-stage decay**.

  A real string vibrates in two planes at once. They see different bridge
  impedances, so — Järveläinen and Karjalainen 2002, §2 — _"the fast decaying but
  louder 'prompt sound' is followed by the more sustained 'aftersound'"_, and the
  same unequal impedance makes the two planes slightly different in pitch, which is
  heard as beating.

  ```ts
  KarplusStrong(ac, { frequency: 220, decay: 2, polarization: 0.3 }); // a real string
  ```

  **`polarization`** (0–1, default 0) is the second component's amplitude relative
  to the first, so it _is_ the level difference the listening test measured
  thresholds against: `-20·log10(polarization)` dB. Their two findings land on the
  knob at 0.45 (7 dB, where reduction starts being detected) and 0.126 (18 dB,
  beyond which "beatings remained inaudible"). Measured modulation depth of the
  fundamental: **0.99 / 0.55 / 0.31 / 0.16 / 0.08** at 0 / 6.9 / 12 / 18 / 24 dB.

  It is one knob for both effects on purpose. §6: _"If the polarization components
  are made equally strong, the two-stage decay cannot be implemented at all"_ — so
  a control scheme with separate mix and decay-difference knobs would be offering a
  setting that does not exist. Measured early-to-late decay-rate ratio: **1.18** for
  one string, **2.67** at 12 dB apart, **2.28** at equal strength.

  **`detune`** (0–1, default 0.5) mistunes the second loop by up to 10 cents —
  cents rather than Hz because the mechanism is a difference in effective _length_,
  so the beat rate follows the pitch as a real string's does. Measured beat rate
  against the frequency difference asked for: 0.633 / 1.266 Hz at 220 Hz and
  1.264 / 2.546 at 440, worst error **0.7%**. At `detune: 0` the two loops are in
  tune and what is left is a pure two-stage decay — Karjalainen et al.'s Fig. 10(b).

  The weak polarization rings **three times** as long as the strong one, which is
  not a free parameter: Järveläinen and Karjalainen's Fig. 7 tested `τ_h = 0.30 s`
  against `τ_v = 0.54 … 1.7 s`, and three is inside that. So **the note outlasts
  `decay`** in dual mode — 2.3× at 12 dB apart, 2.7× at equal strength, both
  measured within 7% of the two-exponential model. `decay` is the prompt sound's
  time, which is the component it is applied to.

  Both polarizations are the **whole** string — the same damping filter, Lagrange
  read, dispersion cascade and probabilistic variants — and both are excited by the
  **same** burst, following Laurson et al. 2001: _"They feed both from the same
  excitation."_

  Three properties worth stating.

  - **`polarization: 0` is free and bit-identical** to the previous release. The
    second delay line, the shared burst buffer and the mix pass are allocated on the
    first block that asks for them, so a patch that never turns the knob never pays
    the 8.8 KB. 20.0 ns/sample at the default, 44.4 with the second polarization,
    68.2 with dispersion as well — 0.09% to 0.30% of one core at 44.1 kHz.
  - **It is not a volume knob.** The mix is a convex combination, `(first +
p·second)/(1 + p)`, so the pair sits at one string's level rather than summing
    to two — and can never exceed the louder of them, which is also the amplitude
    bound.
  - **The pitch does not move.** At `detune: 0` the pair plays within 5 cents at
    110, 440 and 1760 Hz, as one string does.

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

- 75e8ac9: **Note placement moves. Every gate and trigger in the library is now `a-rate`, so a note
  lands on the sample it was scheduled for.**

  It used to land at the top of the next render quantum — up to **2.9 ms late at 44.1 kHz**,
  and by a different amount for every event, so a repeated pattern did not even swing
  consistently. Patches will sound different, and tighter. Pre-1.0 this is free to change;
  after 1.0 it would not have been.

  Six descriptors flipped: `adsr.gate`, `ad.trigger`, `karplus-strong.trigger`,
  `impulse.trigger`, `arp.trigger`, `euclid.clock`. Three of them already read their
  parameter rate-agnostically, behind an opt-in that was invisible in `X.descriptors`,
  unreachable through a compound, and verified on one browser. The other three got the read.

  Three capabilities that did not exist before:

  - **Retrigger inside one block.** Two triggers within one render quantum are both seen.
    The second used to be silently dropped.
  - **Short pulses.** `Impulse` read one sample per block, so a pulse that rose _and_ fell
    inside a quantum produced no impulse at all — not a late one, none. It now fires.
  - **Sub-quantum step boundaries.** `Euclid`'s clock is a phase ramp, so its step boundary
    now lands on its own sample; `Arp`'s note changes at the trigger's sample rather than at
    the top of a block.

  **Nothing costs more.** An unautomated parameter still arrives as a single value, so a
  patch that sets `trigger.value` runs the same code it always did — every processor takes a
  hoisted `length > 1` fast path. When a node _is_ connected the modulator is rendered
  either way; `k-rate` was paying the same price and discarding the samples.

  `Impulse` still writes its single sample at index 0. That is deliberate and unchanged: a
  user may have connected it to a native `AudioParam` they left k-rate, which can only see
  index 0. Its _detection_ is what stopped being quantised. One consequence: two rising
  edges in one block still yield one impulse.

  `Clock` and `Euclid` as producers are untouched — `gatePulse` still sizes pulses so a
  k-rate consumer cannot miss them, and a wider pulse is still visible to an a-rate one.

### Patch Changes

- 3aac0de: `decay` now means what it says at every `brightness`, not only at 1.

  `ρ` was derived from Smith's `ρ^(f₀·t₆₀) = 0.001`, which accounts for the loop's
  gain at **DC**. What is heard is its gain at the fundamental — `ρ` times the
  damping filter's own response there, `G(ω₀) = h₀ + 2h₁·cos ω₀` — and that is
  below 1 for every `brightness` below 1, and further below it the higher the note.
  So a `decay: 1` measured **0.33 s at 1760 Hz** at the shipped brightness. `ρ` is
  now divided by `G(ω₀)`.

  Measured t₆₀ as a fraction of the requested `decay`, at `brightness: 0.5`:

  |         | `decay` 0.5 | 1    | 3    |
  | ------- | ----------- | ---- | ---- |
  | 110 Hz  | 0.90        | 0.85 | 0.81 |
  | 440 Hz  | 0.91        | 0.86 | 0.82 |
  | 1760 Hz | 0.96        | 0.48 | 0.16 |

  All of 110 and 440 Hz is now inside the 75–140% band Järveläinen and Tolonen
  measured as inaudible; it used to sit at 0.85 / 0.83 with 1760 Hz at 0.33.

  **And the 1760 Hz row is a real limit, now stated rather than hidden.** `G(ω₀)`
  is below 1, so a decay longer than the filter alone can deliver would need a loop
  gain above 1 at DC — an unbounded loop. The gain is clamped at 1 instead, and the
  string decays as fast as the filter allows:

  ```
  t₆₀max = ln(0.001) / (f₀ · ln(1/G(ω₀)))
  ```

  which at `brightness: 0.5` is 2045 s at 110 Hz, 32 s at 440, **0.50 s at 1760**
  and 22 ms at 5 kHz. A symmetric three-tap filter cannot do better — its gain at
  ω₀ is 1 only when `h₁ = 0`, which is `brightness: 1` and no damping at all.
  Reaching longer decays at high pitch and low brightness needs a per-note
  loop-filter design (Bank and Välimäki 2003), which remains deferred.

  **`brightness` no longer changes the decay time at all where it counts.** The
  t₆₀ of a band around the fundamental now measures 1.000 s at every brightness
  from 0 to 1 — it is exact by construction rather than approximate. The broadband
  envelope still moves 11%, all of it the `brightness: 1` endpoint where every
  partial decays at `ρ` instead of the high ones going first; `brightness` 0 and
  0.5 are 0.4% apart.

  This changes the sound of every patch with `brightness` below 1: notes ring for
  the time asked for, which at mid and low pitch is longer than before.

## 0.1.0

- Initial release
