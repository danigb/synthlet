import type { ParamDescriptor } from "./_worklet";

// The single list of this module's parameters: the processor registers it,
// the factory wires inputs by it, and it is exposed as `Granite.descriptors`.
//
// The order is `update()`'s argument order, so it is load-bearing. Each spread
// sits beside the value it spreads.
//
// Eighteen parameters, every one k-rate, and that is a decision rather than a
// default: `AudioParamDescriptor.automationRate` defaults to `"a-rate"` in the
// spec, so each `k-rate` below is an explicit opt-out. `scripts/_worklet.ts`,
// next to `ParamDescriptor`, has the two grounds a module may claim.
//
// The ground for fifteen of them is that **a grain reads its parameters once,
// at activation**. Between two onsets there is nothing a per-sample value could
// act on, and a grain already sounding keeps what it was born with - ground
// (b), and why `dsp.ts` takes them as scalars.
//
// `freeze` is ground (a): it borrows the gate shape to latch a *mode*, and
// `dsp.ts` crossfades 100 samples across each of its edges, so which sample the
// edge landed on is not what a listener hears. `wet` and `feedback` are the
// two that are neither - see below.
//
// It is *not* a cost argument, and the earlier version of this comment made
// one: "not worth 128 floats per parameter per block". `benchmarks/automation-rate/`
// measured that and it is wrong twice over. Declaring a parameter costs about
// 0.30 us/node/block and the rate is free; and an a-rate parameter with nothing
// varying connected still arrives as a *single value*, so the 128 floats only
// exist when somebody has actually patched something in - in which case k-rate
// renders the modulator and throws the samples away.
//
// Grains are born at arbitrary sample offsets inside a block, so a-rate would
// be honest for `pitch` and `position` in particular: a grain could read them
// at its own sample rather than at the top of the quantum. Those two remain the
// ones to revisit. The two marked **A bet** below - `wet` and `feedback` - are
// applied per sample rather than read per grain, so their k-rate is a
// prediction about users rather than a property of the DSP.
//
// Three more controls are not here because a parameter cannot resize an
// allocation or reseed a generator: `maxGrains`, `bufferSeconds` and `seed` are
// `processorOptions`, fixed at construction. See `dsp.ts`.
//
// ---------------------------------------------------------------------------
// On the spreads, of which there are five.
//
// The model is Truax 1994's: "the user specifies the average or minimum value
// of the control variable and a range within which individual parameter choices
// may be randomly made." Every one is drawn **once per grain, at activation**,
// which is EC2's thesis rather than a convenience: "some granular
// implementations send all generated grains through a common effects chain.
// This homogenizes the granular texture... it is more interesting from an
// aesthetic standpoint to articulate heterogeneity at the micro time scale of
// individual grains."
//
// They do not all mean the same shape of range, and the differences are forced
// rather than chosen. Each is stated again beside its own parameter:
//
// - **A total width, centred**: `durationSpread`, `pitchSpread`. A `pitchSpread`
//   of 12 spans one octave, not two.
// - **A half width, centred**: `panSpread`. `pan` is already bipolar on +/-1, so
//   a total width would put the full field out of reach at the knob's top.
// - **One-sided**: `spray` reaches further back only, `levelSpread` downward
//   only. Truax's "average *or minimum*", and the two cases where the centre is
//   an edge rather than a middle.
//
// **`jitter` and `intermittency` are not among them**, and the difference is
// worth stating here because they sit next to `rate` like a sixth and seventh
// spread. They randomise the *stream* rather than a grain: they are drawn once
// per scheduled onset rather than once per grain, they are the only two that a
// grain never carries, and they draw from a second generator so that turning
// either up leaves every grain's own draws untouched. `dsp.ts` gives the
// reasoning; the shape of their randomness is stated beside each.
//
// **Every one defaults to 0**, so the module is deterministic out of the box and
// a user hears clean quasi-synchronous granulation before adding stochasticity
// deliberately - the `karplus-strong` convention that neutral extras cost
// nothing until turned up. Here that is exact: at every default the output is
// bit-identical to the module without this ticket in it, which `dsp.test.ts`
// checks against digests captured before it was written.
// ---------------------------------------------------------------------------
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
    // How far each onset may wander from the grid, as a fraction of the mean
    // interval: the next interonset is drawn from `mean * (1 +- jitter)`, so at
    // 1 it is uniform on `[0, 2*mean]` and at 0 the stream is metronomic.
    //
    // This is Bencina's **Direct Interonset Specification** - "interonset =
    // minInteronset + ( frandom() * (maxInteronset - minInteronset) )" - with
    // the range written as a centre and a width rather than as a pair, and it
    // is his own description of both endpoints: equal minimum and maximum
    // schedule grains periodically, "creating interesting amplitude-modulation
    // style spectral effects", and a bounded range gives "subjectively
    // 'smoother' fused textures" than the unbounded `-log(frandom())/D` he
    // offers beside it. The exponential form is the other paper-sourced option
    // and is deliberately not this parameter: one draw can stall the stream for
    // seconds.
    //
    // **The `[0, 2*mean]` bound is Truax's, and it is why density is
    // preserved**: "chooses a random value for the delay of each grain between
    // zero and twice the average value." A uniform draw centred on the mean has
    // the mean, so `rate` still means grains per second at every setting - EC2's
    // separation of this parameter from `intermittency` in as many words, "grain
    // density is the same whether the stream is synchronous or asynchronous".
    // `dsp.test.ts` measures it at 0.4%.
    //
    // Not a per-grain spread: it is the only randomisation in the module that is
    // a property of the *stream* rather than of a grain, which is why it draws
    // from a second generator. See `dsp.ts`.
    name: "jitter",
    defaultValue: 0,
    minValue: 0,
    maxValue: 1,
    automationRate: "k-rate",
  },
  {
    // The probability that a scheduled grain is not emitted. Roads 2001's
    // stochastic masking: "we have implemented stochastic masking as a weighted
    // probability that a pulsar will be emitted at a particular point in a
    // pulsar train... values between 0.9 and 0.8 produce an interesting
    // analog-like intermittency, as if there were an erratic contact in the
    // synthesis circuit."
    //
    // **His polarity is the emission probability and this is its complement**,
    // so his sweet spot is 0.1 to 0.2 here. The parameter is named for the
    // effect and defaults to 0 with the rest of the module's stochasticity,
    // which a probability of emission could not do.
    //
    // The counterpart to `jitter` and the reason the two are separate
    // parameters, which is EC2's distinction: "degree of interruption of the
    // grain stream, independent of whether the stream is synchronous or
    // asynchronous. **High intermittency lowers grain density.**" So this one
    // lowers density by construction where `jitter` preserves it, and its
    // Figure 6 makes exactly that point with four streams at one rate.
    //
    // The skip is rolled at the moment of activation and skips the
    // *activation*: no pool slot is taken and no silent grain is rendered, so
    // the saving is real - EC2 again, "computational demand varies in
    // proportion to the number of concurrently active grains rather than grains
    // per second".
    name: "intermittency",
    defaultValue: 0,
    minValue: 0,
    maxValue: 1,
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
    // Per-grain duration randomisation, as **a total width** and a fraction of
    // `duration`: at 1 the grains run from half to one and a half times it.
    //
    // Truax 1986 names what it is for, and it is the reason this ticket exists:
    // "No variation in grain duration (i.e. duration range equals zero)
    // produces an amplitude modulated signal, whereas even a small range of
    // variation results in a stochastic texture."
    //
    // A width rather than a half-width because a half-width of 1 would reach 0,
    // and a grain of no length is not a short grain. It is also the convention
    // `pitchSpread` is pinned to, so the two read alike.
    name: "durationSpread",
    defaultValue: 0,
    minValue: 0,
    maxValue: 1,
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
    // Per-grain randomisation of the read origin, as a fraction of the
    // reachable buffer, and **one-sided**: grains reach further back than
    // `position`, never nearer than it.
    //
    // Truax: "Varying the offset from grain to grain by means of the offset
    // range allows each grain to be different and results in a richer aural
    // effect." Bencina says the same of the stored-sample case: "Each Source's
    // initial read position can be modulated by a small random factor to
    // decorrelate source phases and create a more animated timbre."
    //
    // One-sided because `position` is an edge rather than a middle - Truax's
    // "average **or minimum** value" - and because a deviation centred on the
    // default `position: 0` could only ever cover half the buffer, where the
    // point of `spray: 1` is that it covers all of it.
    //
    // **It is also what makes the gain law true.** Ticket 02 measured the
    // consequence of its absence: with `pitch: 0` and no spray every grain
    // reads the *same* delay, so overlapping grains are the same signal and add
    // coherently, and the level rose 28.23 dB across a rate sweep where the
    // decorrelated case held to 3.30. `1/sqrt(n-1)` is a power law; this is the
    // parameter that gives it decorrelated grains to normalise.
    //
    // Named for the deviation and not for the origin, so that
    // `strata` can carry the same name over an absolute file position.
    name: "spray",
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
    // which is a different feature. Backwards grains are `reverse` below - the
    // same argument `timestretch-audio-source/src/params.ts` makes for its own
    // flag.
    //
    // Reading faster than 1x is the case Bencina warns about ("the non-causal
    // case of trying to read 'future samples'"), and it costs grain length: at
    // `pitch: +24` a grain may be shortened to a sixteenth of the buffer. The
    // clamp is in `dsp.ts`, is applied *after* this and `durationSpread` have
    // been drawn, and the tests assert it at every corner.
    name: "pitch",
    defaultValue: 0,
    minValue: -24,
    maxValue: 24,
    automationRate: "k-rate",
  },
  {
    // Per-grain pitch randomisation in semitones, as **a total width** centred
    // on `pitch`: 12 spans one octave, 24 spans two - which is the same two
    // octaves `pitch` itself reaches, so the two knobs are in the same units at
    // their tops.
    //
    // Truax's third `(centre, range)` pair, and the one that turns a
    // transposed stream into a chorused one. Small values are a detune; large
    // ones are the "magnification" texture, where every grain lands somewhere
    // else in the octave.
    name: "pitchSpread",
    defaultValue: 0,
    minValue: 0,
    maxValue: 24,
    automationRate: "k-rate",
  },
  {
    // The probability that a grain plays backwards. Not a negative playback
    // rate: EC2 uses a signed rate over [-32, 32] and synthlet cannot, because
    // an `AudioParam` range is continuous and would have to include 0 - and
    // rate 0 is freeze, a different feature with its own semantics.
    // `timestretch-audio-source/src/params.ts` argues this in full for its own
    // `reverse`, and it is the same argument.
    //
    // A probability is also the more granular-idiomatic form, and it is
    // Truax's own freeze-mode trick: "as long as the direction chosen remains
    // the same throughout a grain that is less than 50 msec with a symmetrical
    // envelope, there is no difference between forward and reverse in terms of
    // the aural result." Which is the point - at short durations it costs
    // nothing, and at long ones it is the whole texture.
    //
    // A reversed grain needs more delay headroom than a forward one, because
    // its playhead runs *away* from the write head rather than with it. See
    // `dsp.ts`.
    name: "reverse",
    defaultValue: 0,
    minValue: 0,
    maxValue: 1,
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
    //
    // It has no spread. Not an oversight: the ticket's table does not have one,
    // and `durationSpread` already varies the envelope's *duration*, which is
    // most of what a shape spread would be heard as.
    name: "shape",
    defaultValue: 0.5,
    minValue: 0,
    maxValue: 1,
    automationRate: "k-rate",
  },
  {
    // Where the cloud sits in the stereo field: -1 left, 0 centre, +1 right.
    //
    // What it *does* depends on the input, which is Clouds'
    // `granular_sample_player.h:186-204` split and EC2's Pan semantics: a mono
    // source is placed with a constant-power law, a stereo one is balanced.
    // Panning a stereo source with a constant-power law would collapse its
    // image into a point and then move the point.
    //
    // **0 is an exact bypass**, both gains exactly 1 rather than a
    // constant-power law's 0.7071 - or, once scaled to unity at the centre, its
    // 1.0000000000000002. A stereo placement control that changes the level
    // when it is not being used is a level control.
    name: "pan",
    defaultValue: 0,
    minValue: -1,
    maxValue: 1,
    automationRate: "k-rate",
  },
  {
    // Per-grain pan randomisation, as **a half width** in pan units and clamped
    // to the field: at 1 with `pan` centred, grains land anywhere in it.
    //
    // A half width rather than a total one because `pan` is already bipolar on
    // +/-1 while this is 0 to 1: under the total-width reading the knob's top
    // would span half the field and the full field would be unreachable.
    //
    // This is the parameter that turns a stream into a cloud spatially, and it
    // is nearly free - the pan gains are drawn into the grain at activation and
    // the render loop multiplies by them either way.
    name: "panSpread",
    defaultValue: 0,
    minValue: 0,
    maxValue: 1,
    automationRate: "k-rate",
  },
  {
    // Per-grain gain, and the ceiling `levelSpread` hangs from. 1 is a bypass.
    //
    // It is deliberately not a second `wet`: this multiplies each grain *before*
    // the overlap sum and the normalisation, so with `levelSpread` up it changes
    // the texture, where `wet` changes the balance.
    name: "level",
    defaultValue: 1,
    minValue: 0,
    maxValue: 1,
    automationRate: "k-rate",
  },
  {
    // Per-grain gain randomisation, **downward from `level`**: at 1, grains are
    // drawn uniformly over the whole range below it.
    //
    // Truax 1988's "Future Directions" names its absence as his own
    // implementation's limitation - "the current implementation does not
    // include a maximum amplitude parameter for each grain, only a global
    // amplitude control" - and `level` is that maximum, which is why this is
    // one-sided. Spraying upward from a `level` of 1 would put grains past full
    // scale, and spraying upward from anything else would make the knob a level
    // control at high settings.
    //
    // One multiply, which is Truax's own estimate of the cost.
    name: "levelSpread",
    defaultValue: 0,
    minValue: 0,
    maxValue: 1,
    automationRate: "k-rate",
  },
  {
    // Stops recording into the buffer, so the last few seconds become a
    // playable object rather than a window that slides. It is the one button
    // every hardware granulator ships, and Truax's: "the continuous model also
    // allows the memory to be 'frozen' at particular moments, similar to the
    // fixed-sample model."
    //
    // **The gate is `> 0`, not `>= 0.5`** - the repo-wide rule, and it is the
    // comparison that survives `Param`'s `input * gain + offset`, so a gate
    // driven from a scaled control still opens.
    //
    // It costs the DSP one subtraction. A grain's playhead is a delay measured
    // from the write head, so a head that stops moving *is* the frozen
    // addressing; `dsp.ts` derives it, and the read index is continuous across
    // both edges, which is why entering freeze cannot click and leaving it needs
    // a 100-sample fade against the splice it writes.
    //
    // `feedback` is inert while this is on. That is the ticket's decision and
    // not an accident of the code: letting the loop write while `freeze` says
    // not to would make the button a lie.
    //
    // Truax's variable-rate time-shifting - the `off:on` ratio, which
    // interpolates continuously between live and frozen - is the sequel this
    // parameter is the endpoint of, and it is deferred.
    name: "freeze",
    defaultValue: 0,
    minValue: 0,
    maxValue: 1,
    automationRate: "k-rate",
  },
  {
    // The granulator's own output, summed back into the delay line ahead of the
    // dry input. Bencina: "the output of the Delay Line Granulator may be mixed
    // back into the delay line input to create feedback effects... for example,
    // feedback combined with pitch shifted grains creates stacked
    // transpositions (chords) spaced according to the transposition factor."
    // Truax's continuous model carries the same control, "the amplitude of
    // samples being fed back into the delay line".
    //
    // **0.95 is not a loop gain of 0.95**, which is why the ceiling alone does
    // not make it safe - Bencina again: "due to the non-linear time and
    // amplitude response of the sum of active grains it may be necessary to
    // insert a compression or limiting element in the feedback loop to avoid
    // instability." The sum of `n` overlapping grains is not a gain of 1, so
    // the path carries a `tanh` saturator and a one-pole high-pass whose corner
    // rises with the setting. Both are in `dsp.ts` and both are mandatory.
    //
    // The tap is the wet grain sum rather than the dry/wet mix, so `wet` is not
    // secretly a second feedback control.
    //
    // **A bet**, and an arguable one: the multiply is per sample, but it is
    // *inside* the loop, where a per-sample gain change is a modulated
    // resonator rather than a level control - the same reason
    // `reverb-delay.feedback` stays k-rate.
    name: "feedback",
    defaultValue: 0,
    minValue: 0,
    maxValue: 0.95,
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
    //
    // **A bet.** Unlike everything above it this is not read per grain - it is
    // a crossfade applied per sample at the output, so an envelope on it would
    // be meaningful and cheap. It is the nearest candidate in this file, and it
    // sits alongside `dattorro-reverb.dryWet` and the two delays' `mix` in the
    // automation-rate folder's list.
    name: "wet",
    defaultValue: 1,
    minValue: 0,
    maxValue: 1,
    automationRate: "k-rate",
  },
];
