import {
  Compound,
  CompoundNode,
  createRegistrar,
  createWorkletConstructor,
  ParamInput,
} from "./_worklet";
import { PARAMS } from "./params";
import { PROCESSOR } from "./processor";

export type ClockInputs = {
  bpm?: ParamInput;
  pulseWidth?: ParamInput;
  reset?: ParamInput;
  beatsPerBar?: ParamInput;
};

export type ClockWorkletNode = AudioWorkletNode & {
  bpm: AudioParam;
  pulseWidth: AudioParam;
  reset: AudioParam;
  beatsPerBar: AudioParam;
};

/**
 * A clock node: the beat phase on its own output, the beat gate on `.gate`,
 * and the same pair one level up on `.bar` and `.downbeat`.
 *
 * A phase and a gate are different kinds of signal and are not interchangeable.
 * A phase is a rising `[0, 1)` ramp - what `Euclid` needs, because subdividing
 * a clock means multiplying its phase. A gate is high for `pulseWidth` of each
 * cycle - what an envelope needs. Feeding a phase to an envelope's trigger used
 * to work by accident and does not any more.
 *
 * The bar pair exists for exactly the same reason as the beat pair, and it is
 * on the clock rather than in each consumer because a bar cannot be recovered
 * downstream: the beat ramp during beat 1 is bit-identical to the ramp during
 * beat 3, so the bar position is a count that has to be owned by whoever owns
 * the phase origin.
 *
 * ```ts
 * const clock = Clock(ac, { bpm: 120, beatsPerBar: 4 });
 * Euclid(ac, { clock }); // the beat ramp
 * KickDrum(ac, { trigger: clock.gate }); // the beat gate
 * Snare(ac, { trigger: clock.downbeat }); // once per bar
 * // eight steps across the bar - `subdivision` is what divides a cycle
 * Euclid(ac, { clock: clock.bar, subdivision: 8, steps: 8, beats: 3 });
 * ```
 *
 * `.downbeat` is a subset of `.gate`: both take their width from the same
 * `pulseWidth` and the same phase at the same sample, so they rise and fall
 * together.
 */
export type ClockNode = CompoundNode<
  ClockWorkletNode,
  { gate: GainNode; bar: GainNode; downbeat: GainNode }
>;

const createClockNode = createWorkletConstructor<ClockWorkletNode, ClockInputs>(
  {
    processorName: "ClockWorkletProcessor",
    descriptors: PARAMS,
    workletOptions: () => ({
      numberOfInputs: 0,
      numberOfOutputs: 4,
      outputChannelCount: [1, 1, 1, 1],
    }),
  },
);

export const Clock = Object.assign(
  (context: AudioContext, inputs: ClockInputs = {}): ClockNode => {
    const node = createClockNode(context, inputs);
    // Each secondary output needs to be a node a caller can connect *from*, so
    // each gets its own gain to hang off. One clock, one phase accumulator and
    // one beat counter: a second Clock node holds a constant offset from this
    // one, which is why these are outputs rather than sibling modules.
    //
    // Three idle gain nodes per clock whether or not anyone connects to them.
    // That is cheap, and it is also a precedent worth being deliberate about:
    // if a fifth output is ever proposed, creating these lazily should be
    // reconsidered rather than the count grown by reflex.
    const gate = new GainNode(context);
    const bar = new GainNode(context);
    const downbeat = new GainNode(context);
    node.connect(gate, 1);
    node.connect(bar, 2);
    node.connect(downbeat, 3);
    return Compound({
      output: node,
      owns: [gate, bar, downbeat],
      exposes: { gate, bar, downbeat },
    });
  },
  { descriptors: PARAMS },
);

export const registerClockWorklet = createRegistrar("CLOCK", PROCESSOR);

export { Compound, disposable } from "./_worklet";
export type {
  CompoundNode,
  ConnectedUnit,
  Connector,
  Disposable,
  ParamDescriptor,
  ParamInput,
} from "./_worklet";
