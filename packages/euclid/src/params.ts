import type { ParamDescriptor } from "./_worklet";

// The single list of this module's parameters: the processor registers it,
// the factory wires inputs by it, and it is exposed as `X.descriptors`.
//
// Nine parameters, two of them a-rate.
//
// `AudioParamDescriptor.automationRate` defaults to `"a-rate"` in the spec, so
// every `k-rate` below is an explicit opt-out and carries a reason for being
// one. `scripts/_worklet.ts`, next to `ParamDescriptor`, has the two grounds.
export const PARAMS = [
  {
    // Not a gate: a phase ramp, rising 0 towards 1 over each beat, and the step
    // boundary is the wrap. a-rate so that boundary lands on its own sample
    // rather than at the top of the next render quantum - the same quantity as
    // every other event parameter in the library, arrived at differently.
    // A `Clock` is a node by construction, so k-rate here bought nothing: the
    // ramp was rendered either way and 127 of its 128 samples thrown away.
    //
    // That justification was aspirational until clock ticket 03. `Clock` used
    // to advance its phase by a whole block and fill the block with one value,
    // so the boundary *was* at the top of the next render quantum by
    // construction and the 128 values read here were identical. It now renders
    // per sample, and a hit lands on the same sample as `Clock.gate` - which
    // `packages/euclid/src/clock-skew.test.ts` is what keeps true.
    name: "clock",
    defaultValue: 0,
    minValue: 0,
    maxValue: 1,
    automationRate: "a-rate",
  },
  {
    // How many steps the cycle has. Structural: the pattern is generated when
    // this changes and cached, so a per-sample value would rebuild the pattern
    // 128 times a block for a sequence that has not advanced.
    //
    // Defaults to 8, with `beats` at 3, because `Euclid(ac, { clock })` has to
    // make a sound. 0 is the natural default for a count and it was the wrong
    // one: `euclid(0, 0)` is the empty pattern, `pattern[0] * gate` is
    // `undefined * 1`, and the README's own usage block emitted `NaN` on every
    // sample from block 0 - which in Chrome silences that branch of the graph
    // for the lifetime of the context. `E(3,8)` is the tresillo, the rhythm
    // this module is named for and the README's own worked example.
    //
    // 0 is still a legal setting and now means silence, which is the honest
    // reading of "a pattern with no steps". `dsp.ts` guards it in three places.
    name: "steps",
    defaultValue: 8,
    minValue: 0,
    maxValue: 100,
    automationRate: "k-rate",
  },
  {
    // How many of those steps are hits. Structural, and cached alongside
    // `steps` for the same reason - the two are one Euclidean pattern.
    //
    // 3 of `steps`' 8: the pair is chosen together, and it is the tresillo.
    // See `steps` for why neither default is 0 any more.
    name: "beats",
    defaultValue: 3,
    minValue: 0,
    maxValue: 100,
    automationRate: "k-rate",
  },
  {
    // How many pattern cycles fit in one clock cycle: a multiplier on the
    // incoming phase ramp. It scales the *clock*, and the clock is what
    // carries the timing - so this is a setting and `clock` is the signal.
    name: "subdivision",
    defaultValue: 1,
    minValue: 1,
    maxValue: 20,
    automationRate: "k-rate",
  },
  {
    // The long-short division of the beat that makes a groove feel like a
    // groove. A ratio: the second step of each pair starts at
    // `swing / (1 + swing)` of the pair rather than halfway, so 1 is straight
    // (0.5), 2 is triplet feel (0.667) and 3 is dotted-eighth feel (0.75).
    //
    // It lives here rather than in `Clock` because swing is defined against a
    // *subdivision* and `Clock` has none: a warp on the beat phase has its
    // breakpoint at the beat, so it swings eighths correctly and gives a
    // half-bar shuffle at `subdivision: 4`. Measured, at `subdivision: 4` and
    // one beat of 3840 samples, this gives 1280/640/1281/639 - 2:1 pairs to
    // within the sample a Float32 clock ramp quantises to - where a beat-phase
    // warp gives 720/720/960/1440.
    //
    // **This is the MPC/DAW convention, not a model of jazz swing.** Honing &
    // de Haas 2008 test exactly the constant-ratio-at-any-tempo model every DAW
    // implements and reject it: the swing ratio "is not kept constant, but it is
    // systematically adapted to a global tempo", and swing performance "cannot
    // be transposed in tempo by multiplying all durations with a constant
    // factor". They also reject the linear alternative - "no evidence was found
    // for a linear interpretation" - and Friberg & Sundstrom's ~100 ms
    // short-note floor, find their own data stabilising "around a swing ratio
    // close to 2.2:1" at slower tempi, and decline to fit a curve: "a more
    // complex model is needed". So: ship the constant ratio, because it is the
    // convention users expect and can control, and say what it is.
    // `docs/papers-md/rhythm/honing-dehaas-2008-swing-once-more-timing-tempo-jazz-drumming-music-perception.md`.
    //
    // A ratio and not a 0-to-1 percentage: the ratio is the unit the papers use,
    // and a knob whose 0.5 means straight has caught out everyone who has read
    // an MPC manual. The cost is a non-zero number in the "off" position, which
    // is unusual for this library, and it is the smaller of the two costs.
    //
    // `minValue: 1` is arithmetic, not taste. Below 1 the short step comes
    // first, which is a pushed feel rather than swing, and at an odd
    // `subdivision` it puts an extra boundary inside the leftover half-pair - so
    // a clock cycle would stop containing exactly `subdivision` steps. An
    // `AudioParam` clamps to its declared range, so it is unreachable from here.
    // `maxValue: 3` keeps `1 - swingPoint` at or above 0.25, so neither divide
    // in `dsp.ts` can approach zero, and is already past everything the corpus
    // reports.
    //
    // k-rate for `pulseWidth`'s reason: it describes the *shape of a step*, and
    // the boundary that places the step is carried by `clock`.
    name: "swing",
    defaultValue: 1,
    minValue: 1,
    maxValue: 3,
    automationRate: "k-rate",
  },
  {
    // How far the pattern is rotated. Structural, cached with `steps` and
    // `beats`: rotating a pattern is choosing a different pattern.
    name: "rotation",
    defaultValue: 0,
    minValue: 0,
    maxValue: 100,
    automationRate: "k-rate",
  },
  {
    // How far apart the fan's four channels are, in steps. Channel `i` plays
    // the pattern at `rotation + i * spread`, so this is a *rotation
    // increment* and it is in `rotation`'s own units - which is why it carries
    // `rotation`'s range and sits next to it.
    //
    // 0 is unison: every channel is the pattern at `rotation`, which is what
    // the module played before this parameter existed. The whole feature is
    // opt-in by turning one knob off zero, and nothing that does not turn it
    // changes what it plays.
    //
    // k-rate for `rotation`'s stated reason: rotating a pattern is choosing a
    // different pattern, not interpolating toward one. Unlike `rotation` it is
    // not structural - it rebuilds nothing, because the fan is an offset
    // applied when the pattern is read rather than a second pattern - so it is
    // read once per block in `generate()` and never reaches `update()`.
    //
    // No negative half to the range, matching `rotation`. A fan that runs the
    // other way is the same four patterns in the other order: `{rotation: r,
    // spread: -s}` is `{rotation: r - 3s, spread: s}` read d-c-b-a, verified.
    // A second sign on the knob would be a second way to spell one thing.
    name: "spread",
    defaultValue: 0,
    minValue: 0,
    maxValue: 100,
    automationRate: "k-rate",
  },
  {
    // How much of each step a hit is high for, the same beat-fraction shape
    // `Clock`'s pulseWidth has. It is what makes adjacent hits two triggers
    // instead of one held level.
    //
    // k-rate because it describes the *shape of a step*, which the step
    // boundary - carried by `clock` - is what places. Changing it mid-pulse
    // would move a gate's falling edge without moving anything that reads it.
    name: "pulseWidth",
    defaultValue: 0.5,
    minValue: 0,
    maxValue: 1,
    automationRate: "k-rate",
  },
  {
    // Re-align the pattern. On the trigger's rising edge the next step boundary
    // is step 0 of the pattern rather than a continuation.
    //
    // a-rate for the same reason `clock` is: the reset lands on its own sample,
    // and two resets inside one block are two resets. Edge triggered, so
    // holding it high does not pin the pattern at step 0.
    //
    // The step counter is otherwise private and starts at 0 whenever *this
    // node* was built, so two `Euclid`s on one clock play different rotations
    // of the same pattern unless they happened to be constructed together.
    // Measured: 28 of 32 birth offsets diverge. A pattern's step 0 is a shared
    // musical fact, and this is the only way to say so - patch both from one
    // gate and they agree.
    name: "reset",
    defaultValue: 0,
    minValue: 0,
    maxValue: 1,
    automationRate: "a-rate",
  },
] as const satisfies readonly ParamDescriptor[];
