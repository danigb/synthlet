# synthlet

## 0.13.0

### Minor Changes

- 5aa2d2b: Add `registerMonoSynth` and `registerDrums`, so a compound registers only the
  worklets it is made of instead of all twenty-one:

  ```ts
  import { registerMonoSynth, MonoSynth } from "synthlet";

  const ac = await registerMonoSynth(new AudioContext());
  const synth = MonoSynth(ac);
  ```

  `MonoSynth` needs five worklets and the ten drums need six between them;
  `registerAllWorklets` was pulling in two reverbs, a granular engine and a
  limiter that no compound touches. Both return the context, like
  `registerAllWorklets`, and registration is cached per context, so they compose
  with each other and with `registerAllWorklets` without registering anything
  twice.

  `registerAllWorklets` is unchanged, and is still the one-liner for anyone who
  wants everything.

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

- 5aa2d2b: The built-in compounds - `MonoSynth` and the ten drums - are now built on the
  same public API you would use: the atomic packages, `connect()`, and
  `disposable()`. They used an internal DSL that is being removed.

  Three consequences for anyone using them:

  - **Six drums no longer leak.** `HiHatDrum`, `CymbalDrum`, `MaracasDrum`,
    `HandclapDrum`, `TomDrum` and `CongaDrum` each built a source - an
    oscillator bank, a noise generator, an impulse - that `dispose()` never
    reached, so it kept running after the drum was disposed. Every compound now
    owns everything it creates, and the test suite checks all eleven.
  - **`KickDrum.volume` and `CongaDrum.volume` work.** Both knobs were exposed
    but wired to nothing: the kick had no output stage and the conga's was
    hardcoded to unity gain.
  - **All eleven return `Disposable<GainNode> & {…}`.** Every compound now ends
    in an explicit output `Gain`, where `KickDrum` used to end in a
    `ClipAmpWorkletNode` and the drums had several different static types. The
    properties are unchanged: drums expose `trigger`, `tone`, `decay` and
    `volume`; `MonoSynth` adds `osc`, `vibrato`, `filterEnv`, `filter` and `amp`.

  `@synthlet/param` gains **`Param.mul(ac, input, gain)`**, a scaled value - the
  counterpart of the `Param.inv` that already existed. The drums use it to derive
  a shorter decay from the `decay` knob.

  `SnareDrum.tone` is exposed but still does nothing; giving it a meaning needs a
  DSP decision and is left for a later release.

- 5aa2d2b: **Breaking:** remove `getSynthlet`, the `Synthlet` type, `ConnSerial` and
  `ConnMixInto`. Synthlet ships one way to compose, and it is the Web Audio API's:

  ```ts
  // before
  const s = getSynthlet(ac);
  const synth = s.withParams(s.conn.serial(s.osc.sin(440), s.amp.adsr(gate)), {
    gate,
  });

  // after
  const gate = Param(ac);
  const osc = Oscillator(ac, { type: "sine", frequency: 440 });
  const amp = AdsrAmp(ac, { gate });
  osc.connect(amp);

  const synth = Compound({
    output: amp,
    owns: [osc, gate],
    exposes: { gate: gate.input },
  });
  ```

  Three rules, now written up as "Composing modules" in the guide: wire with
  `connect()`, end in a `Gain`, and declare the result with
  `Compound({ output, owns, exposes })`. The built-in compounds are written this
  way.

  This is a breaking change released as a minor: synthlet is pre-1.0, where a
  minor is the breaking boundary - `^0.12.0` will not resolve to `0.13.0`. The
  1.0.0 version number is reserved for the 1.0 release itself.

  The deleted operators were documented as "very likely to change" and kept their
  state on the AudioContext, so two bundled copies of `synthlet` silently
  produced two operator sets. The native wrappers `Gain`, `Oscillator`,
  `BiquadFilter` and `ConstantSource` are unaffected.

- 3aac0de: `MembraneDrum`, an eleventh drum, and the first one in the kit that is a
  resonator rather than an oscillator through an envelope: it is
  `@synthlet/karplus-strong` with `blend` at 1/2, which is Karplus and Strong's
  own drum algorithm from the 1983 paper - the drum half of "Digital Synthesis of
  Plucked-String **and Drum** Timbres".

  ```ts
  const drum = MembraneDrum(ac, { tone: 0.2, decay: 0.6 });
  drum.connect(ac.destination);
  drum.trigger.value = 1;
  ```

  Its four knobs are the same four every drum has. `tone` sweeps the buffer
  length over 100...1000 Hz, which is the paper's own snare-to-brushed-tom axis
  ("for fairly large p (200 or more)... the effect is that of a snare drum. For
  small p (around 20), the effect is that of a brushed tom-tom") - low is a big
  loose drum, high a small tight one. `decay` drives the resonator's loop gain
  rather than an amplifier envelope, so the hit decays physically: 88 to 571 ms
  across the knob at the low end of `tone`, 75 to 204 ms at the high end.

  `registerDrums` now registers the Karplus-Strong worklet too, so the kit still
  comes up with one call.

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

- 4caf430: **BREAKING:** remove `@synthlet/chorus-t` from the umbrella package.

  `@synthlet/chorus-t` was a port of GPLv2-only code (TAL-NoiseMaker) and cannot be distributed under MIT. It has been deleted from the repository and is no longer exported by `synthlet`; `registerAllWorklets` no longer registers it. Use `Chorus` from `@synthlet/chorus` instead.

  The already-published `@synthlet/chorus-t@0.1.1` should be deprecated on npm with:

      npm deprecate @synthlet/chorus-t "Removed for licensing reasons; use @synthlet/chorus"

- 4caf430: Remove the exported `Synthlet()` function. It had an empty body and returned
  `undefined`.

  `MonoSynthInputs.vibrato` and `MonoSynthInputs.filter` are now actually applied
  — both were declared and documented but never read, so passing them did nothing.

  Also deletes the unused `connectors.ts` and `operators.ts` modules, superseded
  by the `conn` operators on `getSynthlet()`.

### Patch Changes

- 4caf430: Fix `dispose()` on compounds (`MonoSynth`, all drums) stranding their internal
  graph. `disposable()` replaced any `dispose` the node already had instead of
  composing with it, so wrapping a chain in `withParams` discarded the cascading
  teardown and only the top-level control params were disposed — the oscillators,
  filters and envelopes kept processing. `ConnSerial` and `ConnMixInto` had the
  same problem. Nodes declared in `s.synth({ modules })` are now disposed with the
  compound too.
- 792d627: The drums are retuned for the AD envelope's new seconds (see `@synthlet/ad`).
  Every constant was set by ear against the old conversion, so each one is
  converted by the factor that preserves its time constant rather than picked
  again: the envelopes have the same rise and the same decay length they had.

  The drums' own `decay` knob is unchanged - still 0...1, still meaning what it
  meant. The conversion happens between the knob and the envelopes.

- 5aa2d2b: `SnareDrum.tone` now does something. It was exposed and typed like every other
  drum's, but nothing in the snare read it: the two sine oscillators its body is
  made of were hardcoded at 100 and 200 Hz.

  `tone` now moves that pair, `Param.lin`-mapped to 60…140 Hz with the second an
  octave above the first - the same shape the other nine drums use. The default
  `tone` of `0.5` gives exactly 100 and 200 Hz, so an untouched snare sounds
  exactly as it did.

- 792d627: Everything that takes a trigger now agrees on what one is - see the
  [Gates and triggers](https://danigb.github.io/synthlet/docs/gates-and-triggers)
  page, which is new.

  The one call-site change: a drum wired straight to a `Clock` was being fed the
  clock's phase ramp, which is not a gate. Use `clock.gate`:

  ```ts
  const clock = Clock(ac, { bpm: 120 });
  const kick = KickDrum(ac, { trigger: clock.gate });
  ```

  Drums driven by `Euclid` need no change, and get every hit of a dense pattern
  now rather than only the isolated ones.

- 5aa2d2b: Fix the umbrella's published types omitting every enum. `ArpScale`,
  `ClipType`, `LfoType`, `NoiseType`, `ParamScaleType`,
  `PolyblepOscillatorType` and `SvfType` were exported at runtime and
  documented, but appeared nowhere in `dist/index.d.ts`, so this failed to
  compile from `synthlet` while the same code compiled from `@synthlet/noise`:

  ```ts
  import { Noise, NoiseType } from "synthlet";

  Noise(ac, { type: NoiseType.White }); // TS2305: no exported member 'NoiseType'
  ```

  `tsup`'s declaration bundler drops enums from `export *` re-exports, so the
  umbrella now names all seven explicitly. Nothing changed at runtime.

- Updated dependencies
  - @synthlet/ad@0.2.0
  - @synthlet/adsr@0.2.0
  - @synthlet/analog-delay@0.1.0
  - @synthlet/arp@0.2.0
  - @synthlet/clip-amp@0.2.0
  - @synthlet/clock@0.2.0
  - @synthlet/euclid@0.2.0
  - @synthlet/chorus@0.2.0
  - @synthlet/dattorro-reverb@0.2.0
  - @synthlet/granite@0.2.0
  - @synthlet/impulse@0.2.0
  - @synthlet/karplus-strong@0.2.0
  - @synthlet/level-meter@0.2.0
  - @synthlet/lfo@0.2.0
  - @synthlet/lookahead-limiter@0.2.0
  - @synthlet/noise@0.2.0
  - @synthlet/param@0.2.0
  - @synthlet/polyblep-oscillator@0.3.0
  - @synthlet/reverb-delay@0.2.0
  - @synthlet/state-variable-filter@0.3.0
  - @synthlet/virtual-analog-filter@0.2.0
  - @synthlet/wavetable-oscillator@0.3.0
  - @synthlet/digital-delay@0.1.0
  - @synthlet/timestretch-audio-source@0.1.0

## 0.12.0

Measure and control output signal:

- Add level-meter `@synhtlet/level-meter`
- Add lookahead-limiter `@synthlet/lookahead-limiter`

## 0.11.0

- Granite effect module `@synthlet/granite`

## 0.10.0

- VirtualAnalogFilter effect module `@synthlet/virtual-analog-filter`

## 0.9.0

- ReverbDelay effect module `@synthlet/reverb-delay`

## 0.8.0

- KarplusStrong module `@synthlet/karplus-strong`

## 0.7.0

- Add `detune` parameter to Polyblep oscillator

## 0.6.0

- State Variable Filter improvements:
  - It uses a better algorithm (by Andrew Simper and Freq Anton Corvest)
  - `frequency` is now a a-rate parameter suitable for modulation
  - Renamed `resonance` to `Q` to match Web Audio API standard

## 0.5.0

- New chorus `@synthlet/chorus`

## 0.4.0

- New arpeggiator `@synthlet/arp` package

## 0.3.0

- New reverb `@synthlet/dattorro-reverb`
- Function `registerSynthlet` renamed to `registerAllWorklets`

## 0.2.0

- Initial release of the following modules:

  - @synthlet/param@0.1.0
  - @synthlet/ad@0.1.0
  - @synthlet/adsr@0.1.0
  - @synthlet/chorus-t@0.1.0
  - @synthlet/clip-amp@0.1.0
  - @synthlet/clock@0.1.0
  - @synthlet/euclid@0.1.0
  - @synthlet/impulse@0.1.0
  - @synthlet/lfo@0.1.0
  - @synthlet/noise@0.1.0
  - @synthlet/polyblep-oscillator@0.1.0
  - @synthlet/state-variable-filter@0.1.0
  - @synthlet/wavetable-oscillator@0.1.0

## 0.1.0

Initial implementation of:

- ADSR
- White Noise
- State Variable Filter
- Wavetable Oscillator
