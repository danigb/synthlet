import { GenerateParamsMap, ParamsDef } from "../params-utils";

export const WtOscillatorParamsDef: ParamsDef = {
  frequency: { min: 0, max: 20000, def: 440 },
  morphFrequency: { min: 0, max: 10, def: 0.005 },
};

type WtOscillatorParamsMap = GenerateParamsMap<typeof WtOscillatorParamsDef>;

export function WtOscillator(sampleRate: number) {
  let $frequency = 440;
  let $morphFrequency = 0.005;
  let $buffer: Float32Array | null = null;
  let $wtLen = 256;
  let $wtCount = 0;
  let $wtCurrent = 0;
  let $wtOffset = 0;

  function setBuffer(buffer: Float32Array, wavetableLength) {
    $buffer = buffer;
    $wtLen = Math.min(wavetableLength, buffer.length);
    $wtCount = Math.floor(buffer.length / $wtLen);
    $wtCurrent = 0;
    $wtOffset = 0;
  }

  function setParams(params: WtOscillatorParamsMap) {
    $frequency = params.frequency[0];
    $morphFrequency = params.morphFrequency[0];
  }
  function fillAudioMono(output: Float32Array) {
    if (!$buffer || !$wtCount) return;

    let baseIndex = $wtCurrent * $wtLen;
    const inc = 1;
    $frequency / $wtLen / 44100;
    let index = baseIndex + $wtOffset;

    for (let i = 0; i < output.length; i++) {
      output[i] = $buffer[index];
      index += 1;
      if (index === $wtLen) {
        index = 0;
      }
    }
  }

  return { setBuffer, setParams, fillAudioMono };
}
