import {
  createRegistrar,
  createWorkletConstructor,
  ParamInput,
} from "./_worklet";
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
  dispose(): void;
};

export const Euclid = createWorkletConstructor<EuclidWorkletNode, EuclidInputs>(
  {
    processorName: "EuclidProcessor",
    descriptors: PARAMS,
    workletOptions: () => ({
      numberOfInputs: 0,
      numberOfOutputs: 1,
    }),
  },
);

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
type ParamName = (typeof PARAMS)[number]["name"];
type Assert<T extends true> = T;
type Undeclared<Declared> = [Exclude<ParamName, Declared>] extends [never]
  ? true
  : Exclude<ParamName, Declared>;
type _EveryParamIsAnInput = Assert<Undeclared<keyof EuclidInputs>>;
type _EveryParamIsOnTheNode = Assert<Undeclared<keyof EuclidWorkletNode>>;
