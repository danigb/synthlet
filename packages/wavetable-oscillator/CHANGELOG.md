# @synthlet/wavetable-oscillator

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

- d9b8a71: Build wavetables from harmonic spectra, and ship a built-in table.

  `WavetableOscillator(ac)` now makes a sound the moment it is constructed. It was
  the only generator in the catalogue that did not: `$wavetable` started empty and
  stayed empty until a fetch against `smpldsnds.github.io` resolved, so the node
  was silent offline, under a strict CSP, and in any test without a network stub.

  A new main-thread `wavetable-builder` sums harmonic magnitudes into planes:

  ```ts
  const osc = WavetableOscillator(ac); // audible immediately
  osc.setHarmonics([[1], [1, 0.5, 0.25]]); // sine morphing into a 3-harmonic tone
  ```

  `planes[p][0]` is the fundamental of plane `p` — unlike Web Audio's
  `PeriodicWave`, whose index 0 is DC. There is no DC term. `buildPlane`,
  `buildWavetable`, `builtInHarmonics`, `shapeHarmonics`, `normalizePeak`,
  `canonicalPhase`, `defaultWavetable` and `BUILT_IN_SHAPES` are exported for use
  without a node.

  Every plane is built at one **canonical phase** — 0 on odd harmonics, π on even
  ones, per Serra, Rubine & Dannenberg (JAES 38(3) 1990 §3.4.3). A linear crossfade
  between two planes equals a linear crossfade of their harmonic magnitudes only
  while corresponding harmonics share a phase (their Eq. 7); when they do not, the
  morph dips in level and is heard as a frequency shift. Generated planes now
  satisfy that constraint by construction, measured to 0.004 % across the built-in
  set. The alternation also moves a sawtooth's discontinuity off the loop seam:
  1.0000 → 0.0067 of full scale at 256 samples.

  The default table is four planes — sine, triangle, sawtooth, square — generated
  from harmonic rules rather than shipped as data, and shared between nodes.
  `loadWavetable` is unchanged and still works; it is no longer the only way to get
  a sound.

- d9b8a71: Condition wavetables the package did not generate.

  A table handed to `setWavetable` or fetched by `loadWavetable` used to be trusted
  exactly as it arrived. It is now conditioned first, on the main thread, before its
  mipmap pyramid is built: each plane's DC is removed, every harmonic is rewritten to
  the same canonical phase the generated tables use, and the planes are matched in
  RMS so the morph changes timbre and holds level.

  This is not insurance. Six real tables from the wavedit catalogue the loader points
  at were fetched and measured: `SYNLP10` loses **5.7 dB on an average crossfade and
  11.1 dB on its worst**, `ACCESS_V` carries a **0.61 DC offset** on one plane, and
  three of the six span more than 14 dB of RMS across their planes. A linear crossfade
  of two planes equals a linear crossfade of their harmonic magnitudes only while
  corresponding harmonics share a phase (Serra, Rubine & Dannenberg, JAES 38(3) 1990,
  Eq. 7); 90° of disagreement costs 3 dB and 180° is a null. After conditioning all
  six measure 0.00 dB.

  Each step has its own switch, and all three default on:

  ```ts
  osc.loadWavetable("SYNLP10"); // all three
  osc.loadWavetable("SYNLP10", { normalize: false }); // keep the level ramp
  osc.setWavetable(table, { alignPhases: false }); // keep the phase design
  ```

  DC removal and phase alignment are facts about the data. **Loudness normalization is
  a product decision and is labelled as one** — no paper prescribes it, and an artist
  who shaped a level ramp across their planes turns it off.

  Generated tables are untouched: they are canonical, DC-free and peak-normalized by
  construction, and `setWavetable` tells the two apart by whether a pyramid is already
  present. `conditionWavetable`, `alignPhases`, `normalizeRms` and `removeDc` are
  exported for use without a node, along with `analyzeHarmonics` and `trigTable` —
  the package's one forward transform, now shared by the conditioner and the mipmap
  builder.

- d9b8a71: `frequency` is in Hz, and `baseFrequency` is gone. **Breaking.**

  The increment was `frequency / baseFrequency`, so the pitch was
  `frequency / baseFrequency × sampleRate / length`. For `frequency` to mean Hz,
  `baseFrequency` had to equal `sampleRate / length` — and nothing set it, so it
  stayed at its default of 220 and the oscillator played a constant offset flat or
  sharp depending on the table: **+777 cents at length 128, −423 at 256 (the
  `loadWavetable` default), −1623 at 512, −4023 at 2048.** The docs page has said
  "the frequency of the oscillator in Hz" since the initial release.

  The increment is now `frequency × length / sampleRate`, derived inside the
  worklet. `sampleRate` is a worklet global and `length` arrives with the table,
  so both were already there; the parameter existed only because the expression
  needed a denominator, and its one correct value was never a value a caller could
  know. Measured after the change: 440 Hz requested reads 440.014 Hz from a 128-,
  256-, 512- and 2048-sample table alike, and the worst error over twelve pitches
  at 44.1 kHz and 48 kHz is 0.7 cents — which is the analyser's bin spacing, not
  the oscillator.

  **What to do:** remove `baseFrequency` if you set it, and expect the pitch you
  ask for. To play a table at a deliberate ratio rather than a pitch, multiply
  `frequency`; a `detune` parameter in cents is coming.

  The increment's ceiling moved with the formula, from `length / 4` to `length / 2`
  — the table read at Nyquist. Under the new expression the old ceiling would have
  capped every request above `sampleRate / 4` (11025 Hz at 44.1 kHz), so 20000 Hz,
  the declared maximum, would have arrived 1031 cents flat.

  `Wavetable` also loses its `sampleRate` field, which was fetched and then dropped
  in transit. A single-cycle table has no meaningful sample rate — `length` samples
  are one cycle whatever the file's header says — and the pitch comes from the
  context's rate. `WavetableLoader.decodeWavetable` still reports it.

- d9b8a71: Hard sync: a band-limited `sync` gate, and two samples of latency.

  New `sync` parameter, `0…1`, default 0, **a-rate**. A rising edge restarts the
  table read at the `phase` construction option, at the sub-sample instant the
  gate crossed zero. It is a-rate where every other gate in the library is k-rate
  because a reset rounded to a render quantum is 2.9 ms of jitter at 44.1 kHz.

  ```ts
  const master = PolyblepOscillator(ac, { frequency: 110 });
  const slave = WavetableOscillator(ac, { frequency: 275, sync: master });
  ```

  **Breaking: the node now has two samples of output latency** — 45.4 µs at
  44.1 kHz, the same as `@synthlet/polyblep-oscillator`, so the library's two
  oscillators stay aligned with each other. It is paid whether or not anything is
  connected to `sync`, because a latency that changed when a cable was plugged in
  would step the output mid-note. A caller using the DSP unit directly with no
  `sync` input keeps the zero-latency path, bit for bit.

  The latency buys the correction, and it was measured before it was taken rather
  than copied from the sibling package. A reset is a step _and_ a corner in the
  output, both band-limited with the shared 4-point B-spline BLEP and BLAMP
  kernels. Alias SNR with a sawtooth master into a mipmapped sawtooth slave:

  | master  | ratio | naive reset | corrected   |
  | ------- | ----- | ----------- | ----------- |
  | 110 Hz  | 1.5   | 32.0 dB     | **49.6 dB** |
  | 110 Hz  | 2.73  | 29.6 dB     | **53.9 dB** |
  | 440 Hz  | 1.5   | 20.9 dB     | **52.9 dB** |
  | 440 Hz  | 2.73  | 18.6 dB     | **49.7 dB** |
  | 1760 Hz | 1.5   | 14.3 dB     | **46.8 dB** |
  | 1760 Hz | 2.73  | 11.6 dB     | **40.1 dB** |

  17.6 to 33.9 dB, within 0.5 to 14.8 dB of an 8× oversampled reference. Both
  kernels are needed: at the classic half-integer sync ratios a wavetable reset
  has _no_ step at all — a sawtooth's value half a cycle in equals its value at
  zero — and the entire gain is the corner correction's.

  The reset is deliberately **not** run through the 64-sample declick the morph
  and table swaps use. Above `sampleRate / 64` the ramp never finishes between
  edges and stops being a declick: at a 1760 Hz master it takes the peak from 0.96
  to 0.32 and leaves the alias SNR at 14.4 dB.

- d9b8a71: Rewrite the WAV loader, and make the catalog overridable.

  The reader parsed at hardcoded byte offsets — format at 20, bits at 34, samples
  from 44 — which is correct for exactly one flavour of WAV file. Driven with
  generated files of each common variant it returned **wrong samples, with no
  exception raised**, for four of them:

  | input                                                         | before                                                | now     |
  | ------------------------------------------------------------- | ----------------------------------------------------- | ------- |
  | `LIST` chunk before `data`                                    | 6 samples of metadata read as audio                   | correct |
  | `fact` chunk before `data` (**required by spec** for non-PCM) | 2 samples out of 8                                    | correct |
  | 24-bit PCM                                                    | a different waveform at a different amplitude         | correct |
  | 32-bit integer PCM                                            | `2.0`, `-409686835200`, and `NaN` for any loud sample | correct |
  | 32-bit IEEE float                                             | `Invalid format. Only PCM supported.`                 | correct |
  | 8-bit PCM                                                     | `Offset is outside the bounds of the DataView`        | correct |
  | `WAVE_FORMAT_EXTENSIBLE`                                      | `Invalid format. Only PCM supported.`                 | correct |

  It now walks the RIFF chunk list, pad byte included, and picks the sample reader
  from the `fmt ` tag rather than from the bit depth — the old `isFloat = bits ===
32` sat after a `format !== 1` guard, so it could only ever be true for integer
  PCM, and `getFloat32` over an int32 bit pattern is `NaN` for anything at or above
  0.996 of full scale. Supported: PCM at 8, 16, 24 and 32 bits, IEEE float at 32
  and 64, either of them wrapped in `WAVE_FORMAT_EXTENSIBLE`. Everything else
  throws with the tag, the depth, the channel count or the missing chunk named.

  A file whose sample count is not a whole number of frames is now an error rather
  than a silently mis-framed table — every plane boundary and every pitch depends
  on that number and nothing checked it.

  **The catalog is a value now, not a URL literal in two files.** It defaults to
  the same WaveEdit Online mirror, which is **a third party's GitHub Pages site**,
  and that is exactly why it is overridable — `docs/vision.md` requires every URL
  in the library to be self-hostable:

  ```ts
  const osc = WavetableOscillator(ac, { catalog: "/wavetables" });
  osc.catalog = { url: (name) => bundled[name], names: async () => [...] };
  await osc.loadWavetable("/tables/my-own.wav"); // a URL needs no catalog
  ```

  **Breaking:** `loadWavetable(nameOrUrl, wavetableLength)`'s second argument is
  now an options object, `{ length, catalog }`. `node.loadWavetable(name,
options)` is unchanged and its options widen from `ConditionOptions` to
  `ConditionOptions & { length, catalog }`. `WavetableLoader` is gone, replaced by
  the free functions `decodeWav`, `decodeWavetable`, `fetchWavetable`,
  `waveditCatalog` and `toCatalog`, all exported.

  Every failure path now rejects a promise that carries a real message, and the
  site demo displays it instead of dropping it. `wavetable-loader.ts` had no test
  file at all; it has 41 now, generating each WAV variant in-test rather than
  committing fixtures.

- d9b8a71: Band-limit the wavetable oscillator with mipmaps.

  Every wavetable now carries a mipmap pyramid — one level per octave, each level
  the same planes band-limited to half the harmonics of the level below it, all at
  the base plane length — and the oscillator selects the level from the read
  increment and **crossfades the two nearest levels**, so a pitch sweep never steps
  its harmonic content at an octave boundary.

  Alias SNR on a 256-sample sawtooth, measured: 32.3 → 48.4 dB at 220 Hz,
  23.7 → 57.4 dB at 440 Hz, 18.3 → 66.1 dB at 880 Hz, 13.9 → 74.5 dB at 1760 Hz and
  10.4 → 82.1 dB at 3520 Hz.

  The pyramid is built on the main thread at load and transferred to the worklet,
  so the published payload is unchanged. Generated tables get their levels by
  truncating the harmonic series; tables that arrive as samples get theirs by
  analysing and truncating that. `Wavetable` grows an optional `levels`, and
  `setWavetable` builds the pyramid for anything handed to it without one.

- d9b8a71: `morph` selects a wavetable frame, and `morphFrequency` is gone. **Breaking.**

  The only morph control was `morphFrequency`, the speed of a free-running internal
  sawtooth phasor. `morphFrequency = 0` pinned the output to plane 0 forever, so
  there was no way to choose _which_ frame to sit on — which made this a wavetable
  scanner rather than a wavetable oscillator.

  ```ts
  const osc = WavetableOscillator(ac, { morph: 0.5 }); // halfway through the table
  osc.morph.value = 1; // the last plane
  Lfo(ac, { frequency: 0.05 }).connect(osc.morph); // what morphFrequency used to do
  ```

  `morph` is **a-rate** and normalized to `[0, 1]`: 0 is the first plane, 1 the
  last, and everything between crossfades the two planes either side. Normalized
  rather than a plane index, so a modulator patched into it does not have to know
  how many planes `setHarmonics` or `loadWavetable` produced. a-rate because
  scanning a table at audio rate is one of the format's signature sounds and a
  k-rate position quantises it to 2.9 ms steps.

  Reading the position by indexing is what makes the crossfade correct, not just
  convenient. Serra, Rubine & Dannenberg (JAES 38(3) 1990 §1.1) require that "only
  one of the two waveforms is changed at any one time, and the change occurs when
  the scaling factor associated with the wave table being changed is zero". As the
  position crosses an integer, the fraction passes through zero and the plane being
  exchanged has a coefficient of exactly zero at that moment — their swap
  discipline, obtained by arithmetic rather than by bookkeeping. `Phasor`,
  `Trigger` and 45 lines of unreachable trigger-suppression logic left with it.

  **Jumps are declicked.** A position that steps — a slider drag, an envelope
  segment — and a `setWavetable` / `loadWavetable` during playback both ramp
  linearly over 64 samples (1.45 ms at 44.1 kHz) from the last sample emitted onto
  the new signal, instead of stepping. Measured: a one-sample 0 → 1 jump between
  two planes a full scale apart steps by 0.03125 rather than 2.0, at 2, 4, 8 and 64
  planes; loading a table mid-note steps by 0.0116 where it used to step by 0.744.
  A position moving faster than half a plane per sample — the plane axis's Nyquist
  rate, above which the position is skipping frames rather than crossing them —
  counts as a jump; everything slower passes through untouched, which is every
  scan rate the two-plane read can represent (11 kHz at two planes, 3.7 kHz at
  four).

  **What to do:** replace `morphFrequency: f` with `morph` plus an `Lfo`. The one
  audible difference is at the loop point — the old phasor ping-ponged its plane
  pair, so a wrap was seamless; an external ramp LFO wraps from the last plane back
  to the first, which is a real move through the table and is declicked rather than
  hidden. A triangle LFO scans back and forth with no wrap at all.

- d9b8a71: Mirror the oscillator contract: a-rate `frequency`, `detune`, `phase` and
  through-zero FM.

  **Breaking.** `frequency` is now **a-rate** and **bipolar**, `-20000…20000`,
  where it was k-rate and `0…20000`. Connecting a node to it was already linear
  FM — `AudioParam` sums its inputs with the intrinsic value — but the modulator
  was quantised to one step per render quantum, which aliases above about 172 Hz,
  and half-wave rectified at the bottom of the range, which is not a tamer
  modulator but a different one. A negative frequency now runs the read pointer
  backwards.

  New `detune`, a-rate, `-1200…1200` cents, multiplying `frequency`. Measured
  accurate to 0.23 cents across its range.

  New `phase` **construction option**, `number | "random"`, seeding the read
  position. It is not an `AudioParam`: it is a one-time initial condition, and
  `"random"` draws once per instance, which is what stops a stack of oscillators
  beginning phase-locked and combing through its attack.

  ```ts
  const stack = [-7, 0, 7].map((detune) =>
    WavetableOscillator(ac, { frequency: 220, detune, phase: "random" }),
  );
  ```

  Through-zero FM costs one sign here, against a discontinuity scheduler rewritten
  around a signed increment in `@synthlet/polyblep-oscillator`: `frequency = -f`
  is the exact sample-for-sample time-reverse of `frequency = +f`, and a modulator
  sweeping the full range inside one render quantum stays finite, in range and no
  rougher than standing still.

  The mip level is recomputed per sample when the pitch is a-rate, not once per
  block from the block's peak increment — a per-block level is a function of the
  block, so the same automation would render differently at 128 and 1024 frames.
  The level-jump declick is suppressed while the pitch is a-rate, where it would
  otherwise run for 62 % of the samples of a deep FM patch and act as a lowpass on
  the sweep; a stepped k-rate pitch still declicks. The alias floors are unmoved:
  59.3 / 48.4 / 57.4 / 66.1 / 74.5 / 82.1 dB at 110 / 220 / 440 / 880 / 1760 /
  3520 Hz, identical through both paths.

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

## 0.2.0

### Breaking Changes

- `baseFrequency` is removed. `frequency` now means Hz, derived correctly at
  every table length; before this release it was up to 423 cents flat at the
  shipped defaults
- `morphFrequency` and the built-in morph phasor are removed. `morph` is a new
  a-rate parameter, `0`–`1`, that selects a wavetable position directly — an
  `Lfo` connected to it replaces the internal phasor at any rate and any shape
- `frequency` and `detune` are now a-rate and `frequency` is bipolar: a
  negative value runs the read pointer backwards, which is through-zero FM

### Minor Changes

- The oscillator generates its own wavetable set at construction and is
  audible immediately, with no network fetch
- `setHarmonics` builds a wavetable from harmonic magnitude spectra
- Mipmapped, band-limited tables: one level per octave, crossfaded between
  levels
- Imported wavetables are conditioned on load — DC removal, canonical phase
  alignment, loudness matching
- The WAV loader is rewritten: chunk-aware parsing, float and
  `WAVE_FORMAT_EXTENSIBLE` support, an overridable `catalog`, and rejections
  instead of silent corruption
- `phase` construction option and `sync` (hard sync, band-limited, two samples
  of latency)
- Stochastic mode: `segments`, `pitchChaos`, `pitchSpread`, `ampChaos`,
  `ampSpread`, and the `pitchPerSegment` construction option

## 0.1.0

- Initial release
