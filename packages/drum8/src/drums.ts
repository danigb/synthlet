import {
  createClick,
  createEnvelope,
  createFilter,
  createFixedSin2,
  createGate,
  createNoise,
  createSine,
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
  const sin = createSine(sampleRate, 200);
  const click = createClick(sampleRate, 1);
  const env = createEnvelope(sampleRate, 0.1, 0.1);
  const lpf = createFilter(sampleRate, 0, 1.0);
  const gate = createGate();

  return (output, params) => {
    env.update(params.gate[0], params.attack[0], params.decay[0]);
    lpf.update(200 + 20 * params.tone[0]);
    gate.update(params.gate[0]);
    for (let i = 0; i < output.length; i++) {
      output[i] = lpf.process(sin.next() * env.next() + click.next());
    }
  };
};

export const Snare: Instrument = (sampleRate) => {
  const noise = createNoise(sampleRate);
  const envNoise = createEnvelope(sampleRate, 0.1, 0.1);
  const snap = createFixedSin2(sampleRate, 238, 1, 476, 1);
  const snapEnv = createEnvelope(sampleRate, 0.01, 0.1);

  return (output, params) => {
    envNoise.update(params.gate[0], params.attack[0], params.decay[0]);
    snapEnv.update(params.gate[0], 0.01, params.snap[0]);
    for (let i = 0; i < output.length; i++) {
      output[i] = noise.next() * envNoise.next() + snap.next() * snapEnv.next();
    }
  };
};
