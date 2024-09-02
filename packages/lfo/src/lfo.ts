/**
 * Convert unipolar [0, 1] to bipolar [-1, 1]
 * @param value unipolar value
 * @returns bipolar value
 */
export function bipolar(value: number): number {
  return 2.0 * value - 1.0;
}

/**
 * Create a concave/convex transform function using the correction factor
 * @param correctionFactor
 * @returns
 */
function concaveTransform(coeff = 5.0 / 12.0) {
  // concave/convex transform correction factor at x = 0
  const zero = Math.pow(10.0, -1.0 / coeff);
  // concave/convex transform correction factor
  const antiLog = coeff * Math.log10(1.0 + zero);
  // concave/convex transform scaling factor
  const scale = 1.0 / (-coeff * Math.log10(zero) + antiLog);

  // Perform the MMA concave transform on a unipolar value
  return (xn: number) => {
    if (xn >= 1.0) return 1.0;
    if (xn <= 0.0) return 0.0;
    const value = -coeff * scale * Math.log10(1.0 - xn + zero) + antiLog;
    return Math.max(0.0, Math.min(1.0, value));
  };
}

function createSampleAndHold(): Gen {
  let value = rand();
  return (phase, nextPhase) => {
    const out = value;
    if (nextPhase < phase) value = rand();
    return out;
  };
}

function createImpulse(): Gen {
  let active = true;

  return (phase, nextPhase) => {
    const out = active ? 1 : 0;
    active = nextPhase < phase;
    return out;
  };
}

const concave = concaveTransform();
type Gen = (phase: number, prev: number) => number;
const impulse = createImpulse();
const sine: Gen = (phase) => Math.sin(phase * 2 * Math.PI);
const triangle: Gen = (phase) => 1.0 - 2.0 * Math.abs(bipolar(phase));
const rampUp: Gen = (phase) => bipolar(phase);
const rampDown: Gen = (phase) => -bipolar(phase);
const square: Gen = (phase) => (phase <= 0.5 ? +1.0 : -1.0);
const rand = () => bipolar(Math.random());
const expRampUp: Gen = (phase) => bipolar(concave(phase));
const expRampDown: Gen = (phase) => bipolar(concave(1 - phase));
const expTriangle: Gen = (phase) => bipolar(concave(Math.abs(bipolar(phase))));
const randSampleHold: Gen = createSampleAndHold();

type Params = {
  waveform: number[];
  frequency: number[];
  gain: number[];
  offset: number[];
};

export enum LfoWaveform {
  Impulse,
  Sine,
  Triangle,
  RampUp,
  RampDown,
  Square,
  ExpRampUp,
  ExpRampDown,
  ExpTriangle,
  RandSampleHold,
  // Remember to update worklet PARAMS waveform.max value when adding new waveform
  // Remember to update index LfoTypes
}

export function Lfo(sampleRate: number, initialWaveform = LfoWaveform.Sine) {
  const dt = 1 / sampleRate;

  // Init gen functions
  const generators: Gen[] = [
    impulse,
    sine,
    triangle,
    rampUp,
    rampDown,
    square,
    expRampUp,
    expRampDown,
    expTriangle,
    randSampleHold,
  ];

  // Params
  let $waveform = initialWaveform;
  let $frequency = 10;
  let $gain = 1;
  let $offset = 0;

  // State
  let gen: Gen = generators[initialWaveform] ?? sine;
  let phase = 0;

  function read(params: Params) {
    if (params.waveform[0] !== $waveform) {
      $waveform = params.waveform[0];
      gen = generators[Math.floor($waveform)] ?? sine;
    }
    $frequency = params.frequency[0];
    $offset = params.offset[0];
    $gain = params.gain[0];
  }

  function kgen(output: Float32Array, params: Params) {
    read(params);
    let nextPhase = phase + output.length * dt * $frequency;
    if (nextPhase >= 1) {
      nextPhase -= 1;
    }
    const value = gen(phase, nextPhase) * $gain + $offset;
    output.fill(value);
    phase = nextPhase;
  }

  function agen(output: Float32Array, params: Params) {
    read(params);
    for (let i = 0; i < output.length; i++) {
      let nextPhase = phase + dt * $frequency;
      if (nextPhase >= 1) {
        nextPhase -= 1;
      }
      output[i] = gen(phase, nextPhase) * $gain + $offset;
      phase = nextPhase;
    }
  }

  return { kgen, agen };
}
