import { readBufferLinear } from "../audio-buffer/read-buffer-linear";
import { Counter } from "../dsp/counter";
import { Phasor } from "../dsp/phasor";
import { GenerateParamsMap, ParamsDef } from "../params-utils";

export const PARAMS: ParamsDef = {
  frequency: { min: 0, max: 20000, init: 440 },
  morphFrequency: { min: 0, max: 10, init: 0.005 },
};

type WtOscillatorParamsMap = GenerateParamsMap<typeof PARAMS>;

export function WtOscillator(sampleRate: number) {
  const NO_BUFFER = new Float32Array(0);
  let $frequency = 440;
  // Used to interpolate between wavetables
  let $morphPhasor = new Phasor(sampleRate, 0.5);
  // Current wavetable
  let $wavetable = new Counter(0);
  // Length of each wavetable
  let $len = 0;
  // Total number of wavetables in the buffer
  let $wavetableCount = 0;
  // Two buffer readers for interpolation
  let $currentBuffer = readBufferLinear(NO_BUFFER);
  let $nextBuffer = readBufferLinear(NO_BUFFER);

  // Internal
  function setWindow(window: number) {
    $currentBuffer.window((window % $len) * $len, $len);
    $nextBuffer.window(((window + 1) % $len) * $len, $len);
  }

  function setWavetable(buffer: Float32Array, len: number) {
    $len = Math.min(len, buffer.length);
    $wavetableCount = Math.floor(buffer.length / $len);
    $currentBuffer = readBufferLinear(buffer);
    $nextBuffer = readBufferLinear(buffer);
    $wavetable = new Counter($wavetableCount - 1);

    setWindow($wavetable.val);
  }

  function setParams(params: WtOscillatorParamsMap) {
    $frequency = params.frequency[0];
    if ($wavetableCount > 0) {
      $morphPhasor.freq(params.morphFrequency[0]);
    }
  }
  function fillAudioMono(output: Float32Array) {
    if (!$currentBuffer || !$wavetableCount || !$len) return;

    const inc = $frequency / 220;
    for (let i = 0; i < output.length; i++) {
      const morph = $morphPhasor.tick();
      const current = $currentBuffer.read(inc);
      const next = $nextBuffer.read(inc);

      output[i] = (1 - morph) * current + morph * next;
      const currentWindow = $wavetable.val;
      const nextWindow = $wavetable.tick(morph);
      if (currentWindow !== nextWindow) {
        setWindow(nextWindow);
      }
    }
    return $wavetable.val;
  }

  return { setWavetable, setParams, fillAudioMono };
}
