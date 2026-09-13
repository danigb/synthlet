import {
  createRegistrar,
  createWorkletConstructor,
  ParamInput,
} from "./_worklet";
import { clampMaxModes, FIELDS, packModes } from "./dsp";
import { MODES, ResonatorMode } from "./modes";
import { PARAMS } from "./params";
import { PROCESSOR } from "./processor";

export const registerModalResonatorWorklet = createRegistrar(
  "MODAL",
  PROCESSOR,
);

export type ModalResonatorInputs = {
  /** Frequency of a ratio-1 mode in Hz; every other mode is a ratio of it. */
  frequency: ParamInput;
  /** Seconds for a mode whose table decay is 1 to fall 60 dB. */
  decay: ParamInput;
  /** Tilt: mode n's level is scaled by `brightness^(n-1)`. 1 is the table as written. */
  brightness: ParamInput;
};

export type ModalResonatorOptions = Partial<ModalResonatorInputs> & {
  /**
   * Resonators allocated at construction (default 32, at most 256). Not an
   * `AudioParam`: it sizes the pool, which is why a table swap never
   * allocates. A table longer than this is truncated with a warning.
   */
  maxModes?: number;
  /**
   * The table the node starts with (default `ModalResonator.modes.harmonic(8)`).
   * Handed to the processor with the node, so the first block already rings
   * the right modes.
   */
  modes?: readonly ResonatorMode[];
};

export type ModalResonatorWorkletNode = AudioWorkletNode & {
  frequency: AudioParam;
  decay: AudioParam;
  brightness: AudioParam;
  /** The pool size this node was built with. */
  readonly maxModes: number;
  /**
   * Replace the mode table. Takes effect on the next render quantum; modes in
   * both tables keep ringing from where they are. A table longer than
   * `maxModes` is truncated with a `console.warn`, not thrown.
   *
   * ```ts
   * node.setModes(ModalResonator.modes.kettleDrum());
   * node.setModes([{ ratio: 1, level: 1, decay: 1 }, { ratio: 2.76, level: 0.5, decay: 0.4 }]);
   * ```
   */
  setModes(modes: readonly ResonatorMode[]): void;
  dispose(): void;
};

/** Pack a table for the port, warning once per call when it does not fit. */
function toWire(modes: readonly ResonatorMode[], maxModes: number) {
  if (modes.length > maxModes) {
    console.warn(
      `ModalResonator: ${modes.length} modes given, maxModes is ${maxModes}; ` +
        `the last ${modes.length - maxModes} are dropped. ` +
        `Construct the node with a larger maxModes to play them.`,
    );
  }
  return packModes(modes, maxModes);
}

const create = createWorkletConstructor<
  ModalResonatorWorkletNode,
  ModalResonatorInputs
>({
  processorName: "ModalResonatorProcessor",
  descriptors: PARAMS,
  // `maxModes` and `modes` are not `ParamInput`s, so they cannot be members of
  // `ModalResonatorInputs`, whose values `connectParams` walks. The
  // construction options reach `workletOptions` whole, which is how they get
  // to the processor; widening the parameter type-checks because every member
  // is optional - `WavetableOscillator`'s `phase` does the same.
  //
  // **One input, summed to mono; one output, one channel.** A body is one
  // object and the excitation of a drum is mono anyway, while sixty-four
  // resonators per channel would double the cost for a stereo image that a
  // `StereoPannerNode` after the node gives for free. This is a documented
  // exception to the library's rule that amplifiers process every channel
  // (envelopes/04), which was about amplifiers.
  workletOptions: (inputs: Partial<ModalResonatorOptions>) => {
    const maxModes = clampMaxModes(inputs.maxModes);
    return {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [1],
      processorOptions: {
        maxModes,
        modes: inputs.modes ? toWire(inputs.modes, maxModes) : undefined,
      },
    };
  },
});

/**
 * A bank of tuned, decaying resonators played from a mode table: Synth
 * Secrets' kettle drums, bells and cowbells, each as one node.
 *
 * ```ts
 * const strike = Impulse(ac, { trigger: clock.gate });
 * const timp = ModalResonator(ac, {
 *   frequency: 150,
 *   decay: 2,
 *   modes: ModalResonator.modes.kettleDrum(),
 * });
 * strike.connect(timp).connect(ac.destination);
 * ```
 *
 * There is no built-in exciter: `Impulse` is a strike, `Noise` through an
 * `AdAmp` is a scrape, an oscillator makes it a resonant filter bank.
 *
 * **Levels are normalised for a strike**, so a unit impulse puts each mode's
 * envelope at its table level. Continuous input is amplified by the
 * resonance - a unit sine held on a mode with `decay: 1` peaks around 3000 -
 * so put a `Gain` in front of anything that is not an impulse.
 *
 * The wrapper around `createWorkletConstructor` exists for `setModes`:
 * `postCreate` does not see the construction inputs, and truncating a table
 * needs `maxModes`. `Object.assign` keeps `descriptors` on the factory and adds
 * the tables as `ModalResonator.modes`.
 */
export const ModalResonator = Object.assign(
  (context: BaseAudioContext, options: ModalResonatorOptions = {}) => {
    const node = create(context, options);
    const maxModes = clampMaxModes(options.maxModes);
    Object.defineProperty(node, "maxModes", { value: maxModes });
    node.setModes = (modes) => {
      const data = toWire(modes, maxModes);
      node.port.postMessage(
        { type: "MODES", modes: data, count: data.length / FIELDS },
        [data.buffer],
      );
    };
    return node;
  },
  { descriptors: PARAMS, modes: MODES },
);

export type { ResonatorMode } from "./modes";

export { Compound, disposable } from "./_worklet";
export type {
  CompoundNode,
  ConnectedUnit,
  Connector,
  Disposable,
  ParamDescriptor,
  ParamInput,
} from "./_worklet";
