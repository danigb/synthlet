import {
  Compound,
  CompoundNode,
  createRegistrar,
  createWorkletConstructor,
  ParamInput,
} from "./_worklet";
import { euclidPattern } from "./dsp";
import { PARAMS } from "./params";
import { PROCESSOR } from "./processor";

export const registerEuclidWorklet = createRegistrar("EUCLID", PROCESSOR);

export type EuclidInputs = {
  clock?: ParamInput;
  steps?: ParamInput;
  beats?: ParamInput;
  subdivision?: ParamInput;
  rotation?: ParamInput;
  pulseWidth?: ParamInput;
  reset?: ParamInput;
};

export type EuclidWorkletNode = AudioWorkletNode & {
  clock: AudioParam;
  steps: AudioParam;
  beats: AudioParam;
  subdivision: AudioParam;
  rotation: AudioParam;
  pulseWidth: AudioParam;
  reset: AudioParam;
};

/**
 * A Euclidean rhythm node: the pattern's hits on its own output, and the steps
 * the hits leave empty on `.rests`.
 *
 * The complement of a Euclidean rhythm is a Euclidean rhythm - Morrill 2022's
 * Lemma 3, "Euclidean rhythms distribute their rests in the same manner as
 * their notes" - so `.rests` is E(steps - beats, steps) at some rotation, and
 * it is a rhythm rather than a leftover.
 *
 * It is an output rather than a second node because that rotation is never 0:
 * over all 2016 pairs with 1 <= beats < steps <= 64, the complement of
 * E(k,n) is never E(n-k,n) at `rotation: 0`. A second `Euclid` at
 * `beats: steps - beats` plays the right necklace from the wrong place and
 * collides with the first instead of interlocking, and there is no rotation
 * value to compute by ear. Both outputs also share one step counter, one
 * pattern, one clamped `pulseWidth` and one `reset`, so they cannot skew.
 *
 * ```ts
 * const rhythm = Euclid(ac, { clock, steps: 8, beats: 3 });
 * KickDrum(ac, { trigger: rhythm });        // x . . x . . x .
 * HiHatDrum(ac, { trigger: rhythm.rests }); // . x x . x x . x
 * ```
 */
export type EuclidNode = CompoundNode<EuclidWorkletNode, { rests: GainNode }>;

const createEuclidNode = createWorkletConstructor<
  EuclidWorkletNode,
  EuclidInputs
>({
  processorName: "EuclidProcessor",
  descriptors: PARAMS,
  workletOptions: () => ({
    numberOfInputs: 0,
    numberOfOutputs: 2,
    // Declared explicitly rather than left to the spec's default, matching
    // `Clock`: both outputs are one-channel gates and cannot be widened by a
    // channel-count negotiation.
    outputChannelCount: [1, 1],
  }),
});

export const Euclid = Object.assign(
  (context: AudioContext, inputs: EuclidInputs = {}): EuclidNode => {
    const node = createEuclidNode(context, inputs);
    // A second output needs to be a node a caller can connect *from*, so it
    // gets a gain to hang off - `Clock.gate` exactly. One idle gain per node
    // whether or not anyone reads `.rests`; see `packages/clock/src/index.ts`
    // for why that is deliberate, and euclid ticket 06 - which takes this
    // module to five outputs - for when to revisit it.
    const rests = new GainNode(context);
    node.connect(rests, 1);
    return Compound({ output: node, owns: [rests], exposes: { rests } });
  },
  {
    descriptors: PARAMS,
    // The pattern this node is playing, as an array of 1s and 0s - the same
    // expression `dsp.ts`'s `update()` rebuilds from, so it cannot be a
    // different answer. A necklace has no canonical origin, so `rotation: 0`
    // is not the named rhythm in 9 of the 22 cases Toussaint publishes and
    // there is no rule that says which: the only way to find out which
    // rotation is the cinquillo is to look, and this is looking.
    //
    //   Euclid.pattern(8, 5, 6)  // [1,0,1,1,0,1,1,0]  the cinquillo
    //   EuclidRhythm.Cinquillo   // the same three numbers, named
    //
    // Pure and control-thread: no `AudioContext`, no worklet, callable in node.
    // It also draws: a UI ring of LEDs is `Euclid.pattern(...).map(...)`.
    pattern: euclidPattern,
  },
);

// The table of named rhythms, and only that. `euclidPattern`, `euclid` and
// `rotate` stay unexported from here: `packages/synthlet/src/index.ts` does
// `export * from "@synthlet/euclid"`, so every name in this file becomes a
// top-level `synthlet` export, and `pattern`, `euclid` and `rotate` are all
// words another module could plausibly want. `EuclidRhythm*` is prefixed and
// safe, and the function is namespaced by its factory as `Euclid.pattern` -
// exactly as `Euclid.descriptors` is.
export { EuclidRhythm } from "./dsp";
export type { EuclidRhythmName, EuclidRhythmPreset } from "./dsp";

export { Compound, disposable } from "./_worklet";
export type {
  CompoundNode,
  ConnectedUnit,
  Connector,
  Disposable,
  ParamDescriptor,
  ParamInput,
} from "./_worklet";

// The parameter list is declared once, in `params.ts`. These two assertions make
// the two hand-written copies of it answer to that list: a parameter added there
// without a matching field here is a compile error naming the missing field,
// rather than an `AudioParam` that works at runtime and cannot be typed.
// `pulseWidth` was exactly that for two releases - the release whose changeset
// announced that this class of bug was fixed. The single list fixed the
// processor and the factory; this is the third copy.
//
// It fails `npm run build`, not just an editor: `tsup --dts` type-checks, and CI
// runs the build. Verify by deleting a field and watching it break - a
// type-level test that cannot fail is decoration.
//
// One direction only. `keyof EuclidInputs extends ParamName` would also hold
// today and would break the moment a factory takes a non-parameter option -
// several already do, through `workletOptions`. Note also that
// `keyof EuclidWorkletNode` carries everything `AudioWorkletNode` inherits, so
// a parameter named `port` would pass the second assertion falsely; the first
// has no such hole.
//
// The second assertion stays pointed at `EuclidWorkletNode` and not at
// `EuclidNode`, even though `Euclid()` now returns the latter. `EuclidNode` is
// `EuclidWorkletNode` plus `.rests` plus `dispose`, so asserting against it
// would still hold - but it would be asserting that the *compound* carries the
// parameters, which is true only because the worklet node underneath does.
// The hand-written copy this guards is `EuclidWorkletNode`'s field list, so
// that is what it names. A parameter dropped from it is still a build failure
// naming the parameter, which is the guard working.
type ParamName = (typeof PARAMS)[number]["name"];
type Assert<T extends true> = T;
type Undeclared<Declared> = [Exclude<ParamName, Declared>] extends [never]
  ? true
  : Exclude<ParamName, Declared>;
type _EveryParamIsAnInput = Assert<Undeclared<keyof EuclidInputs>>;
type _EveryParamIsOnTheNode = Assert<Undeclared<keyof EuclidWorkletNode>>;
