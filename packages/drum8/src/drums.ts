import {
  createClick,
  createEnvelope,
  createFilter,
  createFixedSin2,
  createNoise,
  decaySine,
} from "./dsp";

type Params = {
  gate: number[];
  attack: number[];
  decay: number[];
  tone: number[];
  snap: number[];
};

export type Generator = (output: Float32Array, params: Params) => void;
type Instrument = (sampleRate: number) => Generator;

export const Kick: Instrument = (sampleRate) => {
  const sin = decaySine(sampleRate, 90, 48);
  const click = createClick(sampleRate, 1);
  const env = createEnvelope(sampleRate, 0.1, 0.1);
  const lpf = createFilter(sampleRate, 0, 1.0);
  const softClip = Math.tanh;

  return (output, params) => {
    sin.update(params.gate[0], params.decay[0] * 0.5);
    env.update(params.gate[0], params.attack[0], params.decay[0]);
    lpf.update(200 + 200 * params.tone[0]);
    for (let i = 0; i < output.length; i++) {
      output[i] = softClip(lpf.process(sin.next() * env.next() + click.next()));
    }
  };
};

export const Snare: Instrument = (sampleRate) => {
  const noise = createNoise(sampleRate);
  const envNoise = createEnvelope(sampleRate, 0.1, 0.1);
  const snap = createFixedSin2(sampleRate, 238, 1, 476, 1);
  const snapEnv = createEnvelope(sampleRate, 0.01, 0.1);
  const lpf = createFilter(sampleRate, 0, 1.0);

  return (output, params) => {
    envNoise.update(params.gate[0], params.attack[0], params.decay[0]);
    snapEnv.update(params.gate[0], 0.01, params.snap[0]);
    lpf.update(500 + 500 * params.tone[0]);
    for (let i = 0; i < output.length; i++) {
      output[i] = lpf.process(
        noise.next() * envNoise.next() + snap.next() * snapEnv.next()
      );
    }
  };
};
