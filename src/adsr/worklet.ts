import { ParamsDef, toWorkletParams } from "../worklet-utils";
import { Adsr } from "./adsr";
import { AdsrExp } from "./adsr-exp";
import { AdsrLinear } from "./adsr-linear";

export const AdsrParams: ParamsDef = {
  gate: { min: 0, max: 1, def: 0 },
  attack: { min: 0, max: 10, def: 0.01 },
  decay: { min: 0, max: 10, def: 0.1 },
  sustain: { min: 0, max: 1, def: 0.5 },
  release: { min: 0, max: 10, def: 0.3 },
} as const;

const PARAMS_DESCRIPTORS = toWorkletParams(AdsrParams);

type CurrentAdsr =
  | ReturnType<typeof AdsrLinear>
  | ReturnType<typeof AdsrExp>
  | Adsr;
type AdsrType = "linear" | "exp";

export class AdsrWorklet extends AudioWorkletProcessor {
  p: CurrentAdsr;
  t: AdsrType;

  constructor(options) {
    super();
    this.#set(options?.processorOptions?.type === "linear" ? "linear" : "exp");

    this.port.onmessage = (event) => {
      const newType = event.data?.type === "linear" ? "linear" : "exp";
      if (this.t !== newType) this.#set(newType);
    };
  }

  #set(newType: AdsrType) {
    this.t = newType;
    this.p =
      newType === "linear" ? AdsrLinear(sampleRate) : new Adsr(sampleRate);
    this.p.setParams(0, 0.01, 0.1, 0.5, 0.3);
  }

  process(
    inputs: Float32Array[][],
    outputs: Float32Array[][],
    parameters: any
  ) {
    this.p.setParams(
      parameters.gate[0],
      parameters.attack[0],
      parameters.decay[0],
      parameters.sustain[0],
      parameters.release[0]
    );

    const input = inputs[0];
    const output = outputs[0];
    const channels = Math.min(input.length, output.length);
    if (channels === 0) return true;
    const length = input[0].length;

    for (let i = 0; i < length; i++) {
      for (let j = 0; j < channels; j++) {
        output[j][i] = input[j][i] * this.p.process();
      }
    }

    return true;
  }

  static get parameterDescriptors() {
    return PARAMS_DESCRIPTORS;
  }
}

registerProcessor("AdsrWorklet", AdsrWorklet);
