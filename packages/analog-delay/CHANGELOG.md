# @synthlet/analog-delay

## 0.1.0

### Minor Changes

- b1ebc74: Initial release: a glide-based tape and bucket-brigade echo with
  multi-tap heads and one wear control.

  Moving the delay time on a tape or bucket-brigade machine **bends the pitch of
  everything already in the line**. The Space Echo's Repeat Rate knob is a
  performance control precisely because of that, and the Echoplex's sliding head
  is the same effect made mechanical. The read head here travels to its new
  position rather than handing over to a second one, so it resamples the buffer
  on the way — measured at 440 → 511 → 440 Hz through a sweep where
  `@synthlet/digital-delay` reads 440 → 442 → 440.

  ```ts
  const delay = AnalogDelay(ac, {
    time: 0.3,
    feedback: 0.6,
    taps: 0.7, // more heads open
    age: 0.4, // wobblier, dirtier, darker, hissier
    mode: AnalogDelayMode.Tape,
  });
  source.connect(delay).connect(ac.destination);

  delay.time.value = 0.18; // drag this while it repeats
  ```

  **There is no `tone` parameter, deliberately.** In a clean digital delay
  `time` and `tone` are independent; in real analog hardware they are not. A
  bucket-brigade's delay is its stage count over its clock rate, so lengthening
  the delay lowers the clock, which drags the anti-alias and reconstruction
  filters down with it, which darkens every repeat. Tape does the same through
  head gap and transport speed. That coupling is the sound of an analog delay —
  the reason a Memory Man at maximum time is murky and at minimum nearly clean —
  so bandwidth is derived from `time` and `age` instead. Measured: the Tape
  corner moves 14225 → 1774 Hz across five `time` settings, BBD 11898 → 2290 Hz,
  both within 15% of the derived shape.

  Eight `AudioParam`s: `time` (0.02–1.5 s), `feedback` (0–1.2), `mix`, `taps`,
  `age`, `wobble`, `spread` and `mode`. One construction option, `maxTime`
  (default 1.5 s), sizes the buffers.

  Four things worth knowing:

  - **`taps` is continuous, and means something different in each mode.** Tape
    taps are integer multiples of `time` (measured 0.99 : 2.00 : 3.00), so
    opening more heads gives rhythmic subdivisions. The MN3011's six taps are
    deliberately irrational (0.99 : 1.67 : 3.01 : 4.35 : 7.04 : 8.39), so
    opening more gives a diffuse wash — which is what its datasheet says they
    are for. Envelope autocorrelation at the tap period reads 0.778 Tape against
    0.024 BBD. That difference in kind is what earns `mode` its slot; it is not
    a filter preset.
  - **`age` and `wobble` are both here on purpose.** `age` moves four things at
    once (wobble 0.67 → 2.31 Hz s.d., THD 3.2e-4 → 7.5e-2, corner 15249 → 3800
    Hz, hiss 0 → 5.0e-5), but a well-maintained machine with an eccentric
    capstan is a real and desirable combination that one composite knob cannot
    express.
  - **Tap offsets are clamped to the line.** At `time = maxTime` in BBD mode the
    8.4× tap would need a 12.6 s stereo buffer, so later taps fold onto the
    line's maximum rather than allocating for a case nobody asks for.
  - **`feedback` at 1.2 self-oscillates, but not at every setting.** With `age`,
    `wobble` and `taps` all well up, a worn multi-head transport cannot hold the
    resonance and the loop decays. It stays finite and bounded either way.

  `mode` wipes between Tape and BBD rather than snapping, so intermediate values
  are usable.

  The DSP is original, written from datasheets and service manuals rather than
  papers — and `README.md` grades each figure's provenance rather than hiding
  it. The BBD delay formula and the MN3005/MN3011 stage and tap tables are
  primary-source high confidence; the RE-201 head ratios and the Echorec's
  1.2 Hz wow rate are medium-high. The wow and flutter depths, the flutter rate,
  the tape gap-loss constant, the `age` curve and the compander's constants were
  **chosen by ear and are labelled as chosen** in `src/dsp.ts`: no sourced
  wow/flutter figure exists for these machines, and inventing plausible numbers
  would have been worse than marking them.
