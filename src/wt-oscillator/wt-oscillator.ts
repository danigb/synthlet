import { ParamsDef } from "../params-utils";

export const WtOscillatorParamsDef: ParamsDef = {};

export function WtOscillator(sampleRate: number) {
  function setBuffer(buffer: Float32Array) {}
  function setParams(frequency: number, speed: number) {}
  function fillAudioMono(output: Float32Array) {}

  return { setBuffer, setParams, fillAudioMono };
}
