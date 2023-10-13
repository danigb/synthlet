import { readBufferLinear } from "../audio-buffer/read-buffer-linear";
import { Counter } from "../dsp/counter";
import { Phasor } from "../dsp/phasor";
import { GenerateParamsMap, ParamsDef } from "../params-utils";

export const WtOscillatorParamsDef: ParamsDef = {
  frequency: { min: 0, max: 20000, def: 440 },
  morphFrequency: { min: 0, max: 10, def: 0.005 },
};

type WtOscillatorParamsMap = GenerateParamsMap<typeof WtOscillatorParamsDef>;

export function WtOscillator(sampleRate: number) {
  const NO_BUFFER = new Float32Array(0);
  let $frequency = 440;
  let $morphPhasor = new Phasor(sampleRate, 0.5);
  let $window = new Counter(0);
  let $currentBuffer = readBufferLinear(NO_BUFFER);
  let $nextBuffer = readBufferLinear(NO_BUFFER);
  let $wtLen = 0;
  let $wtCount = 0;

  // Internal
  function setWindow(window: number) {
    $currentBuffer.window((window % $wtLen) * $wtLen, $wtLen);
    $nextBuffer.window(((window + 1) % $wtLen) * $wtLen, $wtLen);
  }

  function setBuffer(buffer: Float32Array, wavetableLength: number) {
    $wtLen = Math.min(wavetableLength, buffer.length);
    $wtCount = Math.floor(buffer.length / $wtLen);
    $currentBuffer = readBufferLinear(buffer);
    $nextBuffer = readBufferLinear(buffer);
    $window = new Counter($wtCount);
    setWindow($window.val);
  }

  function debug() {
    return {
      $frequency,
      $window: $window.val,
      $wtCount,
      $wtLen,
    };
  }

  function setParams(params: WtOscillatorParamsMap) {
    $frequency = params.frequency[0];
    if ($wtCount > 0) {
      $morphPhasor.freq(params.morphFrequency[0]);
    }
  }
  function fillAudioMono(output: Float32Array) {
    if (!$currentBuffer || !$wtCount) return;

    const inc = $frequency / 440;
    for (let i = 0; i < output.length; i++) {
      const morph = $morphPhasor.tick();
      const current = $currentBuffer.read(inc);
      const next = $nextBuffer.read(inc);

      output[i] = (1 - morph) * current + morph * next;
      const currentWindow = $window.val;
      const nextWindow = $window.tick(morph);
      if (currentWindow !== nextWindow) {
        setWindow(nextWindow);
      }
    }
    return $window.val;
  }

  return { setBuffer, setParams, fillAudioMono, debug };
}
