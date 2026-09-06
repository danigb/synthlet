import type { ParamDescriptor } from "./_worklet";

// The single list of this module's parameters: the processor registers it,
// the factory wires inputs by it, and it is exposed as `Granite.descriptors`.
//
// The order is `update()`'s argument order, so it is load-bearing.
//
// Every one is k-rate, and that is a decision rather than a default. Grains are
// born at arbitrary sample offsets inside a block, so a-rate would be *honest*
// here - a grain could read the parameter at its own sample rather than the one
// at the top of the quantum. It is not worth 128 floats per parameter per block
// at this parameter count; `pitch` and `position` are the two to revisit if
// audio-rate modulation of them proves interesting.
//
// Two more controls are not here because a parameter cannot resize an
// allocation: `maxGrains` and `bufferSeconds` are `processorOptions`, fixed at
// construction. See `dsp.ts`.
export const PARAMS: readonly ParamDescriptor[] = [
  {
    // Grains per second. This is *emission rate*, which is a separate quantity
    // from grain duration - Bencina's central structural point, and what the
    // module conflated before: `rate * duration / 1000` is the overlap, and the
    // two are worth sweeping against each other, which is EC2's own onboarding
    // advice ("the zones of morphosis between the rhythm, pitch, and timbre
    // domains").
    //
    // The old ceiling was 30/s, and structural: the phasor advanced once per
    // render quantum, so at most one grain could start per 128 samples. Truax
    // reached 2,375 grains per second on a 1986 DSP; this range is that number
    // rounded down, and the scheduler that makes it reachable is a per-sample
    // interonset counter.
    //
    // **The minimum is 0, not 0.1**, and 0 emits no grains at all. That is the
    // library's standing rule rather than a preference: `connectParams` writes
    // `param.value = 0` for every connected input, so a positive minimum makes
    // Chrome clamp that write and warn.
    name: "rate",
    defaultValue: 20,
    minValue: 0,
    maxValue: 2000,
    automationRate: "k-rate",
  },
  {
    // Grain duration in milliseconds, and the control the module did not have:
    // it was the constant 200 at `dsp.ts:5`.
    //
    // Below about 10-15 ms the envelope's own spectrum becomes audible as a
    // band around each grain's content - Bencina names it, and it is a feature
    // rather than a defect, which is why the floor is 1 ms and not 15.
    //
    // The ceiling is **exactly a quarter of the default `bufferSeconds`**, which
    // is the causality clamp's own ceiling (see `dsp.ts`): a grain longer than
    // that cannot be read back without the play head meeting the record head.
    // Declaring it here rather than as a second literal is what keeps the range
    // and the allocation from drifting apart. A smaller configured
    // `bufferSeconds` clamps further, in the DSP, and the tests assert it.
    name: "duration",
    defaultValue: 60,
    minValue: 1,
    maxValue: 1000,
    automationRate: "k-rate",
  },
  {
    // How far back in the recorded past a grain starts, as a fraction of the
    // buffer it can actually reach. This is Truax's "offset", measured backward
    // from now, and it is what makes the buffer a *time* dimension rather than
    // a fixed tap.
    //
    // 0 is the freshest audio the causality clamp allows - not the write head
    // itself, which would be a grain reading samples that have not been written
    // yet. `dsp.ts` states the arithmetic; the reachable span shrinks as
    // `duration` and `pitch` rise, because both eat headroom.
    //
    // It is a fraction rather than seconds so that the knob means the same
    // thing at every `bufferSeconds`, and so that the parameter cannot be set
    // past the end of an allocation it does not know the size of.
    name: "position",
    defaultValue: 0,
    minValue: 0,
    maxValue: 1,
    automationRate: "k-rate",
  },
  {
    // Per-grain transposition in semitones: the playback rate is `2^(pitch/12)`,
    // so the range is two octaves either way. The single largest capability the
    // module did not have - grains were copied 1:1.
    //
    // Semitones rather than a ratio because a ratio range has to be asymmetric
    // ([0.25, 4]) to be symmetric in pitch, and because an `Lfo` patched into
    // semitones is vibrato at a constant depth across the range.
    //
    // It is not signed *rate*: a signed rate spans zero, and rate 0 is freeze,
    // which is a different feature. Backwards grains arrive as a per-grain
    // probability in ticket 03 - the same argument
    // `flex-audio-buffer-source/src/params.ts` makes for its own `reverse`.
    //
    // Reading faster than 1x is the case Bencina warns about ("the non-causal
    // case of trying to read 'future samples'"), and it costs grain length: at
    // `pitch: +24` a grain may be shortened to a sixteenth of the buffer. The
    // clamp is in `dsp.ts` and the tests assert it at every corner.
    name: "pitch",
    defaultValue: 0,
    minValue: -24,
    maxValue: 24,
    automationRate: "k-rate",
  },
  {
    // The grain envelope, as one knob, morphing along EC2's **asymmetry** axis:
    //
    // - **0** - expodec: the attack is 5% of the grain and the decay is the
    //   rest. Percussive, and at high density a stream of transients.
    // - **0.5** - a symmetric bell.
    // - **1** - reversed expodec: a slow attack into an abrupt end. Bencina
    //   names the payoff - a texture of grains with slow attacks and fast
    //   decays "can be made to sound like reversed tape playback".
    //
    // Not Clouds' *smoothness* axis (rectangular -> triangle -> Hann). Both are
    // defensible and they are incompatible; smoothness is largely subsumed by
    // grain duration, which is already a parameter, whereas asymmetry is not
    // reachable any other way.
    //
    // The morph is level-neutral by construction: the envelope's mean square is
    // 3/8 at every setting, so `shape` changes the grain's shape and nothing
    // else. `dsp.ts` derives it and `dsp.test.ts` asserts it.
    name: "shape",
    defaultValue: 0.5,
    minValue: 0,
    maxValue: 1,
    automationRate: "k-rate",
  },
  {
    // Dry/wet. **Defaulted to 1**, where it used to be 0.5, so the module's own
    // sound is what you hear first.
    //
    // In a modular graph you would normally run a granulator fully wet and mix
    // outside, and this parameter survives that argument because granite is a
    // *delay*: the dry path is what makes a grain cloud an effect on a source
    // rather than a replacement for it. 0 is an exact bypass, sample for
    // sample, which the tests assert.
    name: "wet",
    defaultValue: 1,
    minValue: 0,
    maxValue: 1,
    automationRate: "k-rate",
  },
];
