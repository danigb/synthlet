# @synthlet/ad

## 0.2.0

### Minor Changes

- 5aa2d2b: Add `AdAmp`: an attack-decay amplifier with one input, the percussive
  counterpart of `AdsrAmp`. The output is `input × envelope × gain + offset`,
  the same formula the ADSR amplifier uses. It shares the `AdProcessor` with
  `AdEnv`, so `registerAdWorklet` covers both.

  ```ts
  const amp = AdAmp(ac, { trigger, attack: 0.01, decay: 0.3 });
  osc.connect(amp).connect(ac.destination);
  ```

  An `AdAmp` with nothing connected to its input outputs `offset` (silence by
  default) rather than throwing inside the processor.

- 792d627: `attack` and `decay` are now seconds, the same seconds `@synthlet/adsr` uses.
  **This changes the sound of every patch that uses the AD.**

  They were labelled seconds but converted with two empirical factors
  (`tau = attack x 0.05`, `tau = decay x 0.1`), so `AdEnv({ attack: 1 })` was
  audibly over in 150 ms where `AdsrEnv({ attack: 1 })` takes a full second - and
  `attack` was not even proportional to the time it produced, because the stage
  ended when the per-sample increment fell below a fixed epsilon.

  Now `attack` is the time to reach the peak and `decay` the time to fall to
  silence (-60 dB), both exact and both linear in the parameter:

  ```ts
  AdEnv(ac, { attack: 0.5, decay: 2 }); // peaks at 0.5 s, silent 2 s later
  ```

  To keep an existing patch sounding as it does, convert your numbers:

  ```ts
  attack * 0.05 * Math.log(100); // 0.2303
  decay * 0.1 * Math.log(1000); // 0.6908
  ```

  Those factors preserve the envelope's time constants exactly - the rise is
  identical sample for sample, and the decay ends at the same moment. The one
  difference is at the top of the attack: the old stage kept crawling from 0.99
  toward 1.0 for another 0.6-8 ms before the decay started, and that plateau is
  gone.

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

- 792d627: `AdAmp` now processes every channel of its input instead of only the first: a
  stereo signal into it came out with the right channel silent. The envelope
  still advances once per sample and is applied to each channel, so a stereo
  image (from `Chorus`, say) survives the amplifier.

  If you compensated for the missing channel with a `Gain`, the result is now
  about 3 dB hot.

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

## 0.1.0

- Initial release
