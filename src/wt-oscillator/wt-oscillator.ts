import {
  ReadAudioBufferLinear,
  readBufferLinear,
} from "../audio-buffer/read-buffer-linear";
import { GenerateParamsMap, ParamsDef } from "../params-utils";

export const WtOscillatorParamsDef: ParamsDef = {
  frequency: { min: 0, max: 20000, def: 440 },
  morphFrequency: { min: 0, max: 10, def: 0.005 },
};

type WtOscillatorParamsMap = GenerateParamsMap<typeof WtOscillatorParamsDef>;

export function WtOscillator(sampleRate: number) {
  let $frequency = 440;
  let $morphFrequency = 0.005;
  let $buffer: ReadAudioBufferLinear | null;
  let $wtLen = 256;
  let $wtCount = 0;
  let $wtCurrent = 0;
  let $wtOffset = 0;

  function setBuffer(buffer: Float32Array, wavetableLength) {
    $buffer = readBufferLinear(buffer);
    $wtLen = Math.min(wavetableLength, buffer.length);
    $wtCount = Math.floor(buffer.length / $wtLen);
    $wtCurrent = 0;
    $wtOffset = 0;
    $buffer.set(0, $wtCurrent * $wtLen, $wtLen);
  }

  function setParams(params: WtOscillatorParamsMap) {
    $frequency = params.frequency[0];
    $morphFrequency = params.morphFrequency[0];
  }
  function fillAudioMono(output: Float32Array) {
    if (!$buffer || !$wtCount) return;

    const inc = $frequency / 440;
    for (let i = 0; i < output.length; i++) {
      output[i] = $buffer.read(inc);
    }
  }

  return { setBuffer, setParams, fillAudioMono };
}
