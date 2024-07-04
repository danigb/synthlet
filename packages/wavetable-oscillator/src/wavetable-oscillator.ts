type Inputs = {
  baseFrequency: number[];
  frequency: number[];
  morphFrequency: number[];
};

export function WavetableOscillator(sampleRate: number) {
  let $baseFrequency = 220;
  let $frequency = 440;
  let $morphFrequency = 0.005;
  let $wavetable = new Float32Array(0);

  let len = 0;
  let planes = 0;
  let planeA = 0;
  let planeB = 0;
  let offset = 0;
  let inc = 2;
  let morphPhase = Phasor(sampleRate);
  let morphChange = Trigger();

  function read(inputs: Inputs) {
    if (
      inputs.frequency[0] !== $frequency ||
      inputs.baseFrequency[0] !== $baseFrequency
    ) {
      $baseFrequency = inputs.baseFrequency[0];
      $frequency = inputs.frequency[0];
      inc = $frequency / $baseFrequency;
    }
    $morphFrequency = inputs.morphFrequency[0];
  }

  function set(wavetable: Float32Array, length: number) {
    $wavetable = wavetable;
    len = Math.min(length, wavetable.length);
    planes = Math.floor(wavetable.length / len);
    planeA = 0;
    planeB = (planeA + 1) % planes;
  }

  function agen(output: Float32Array, inputs: Inputs) {
    if (len === 0 || planes === 0) {
      output.fill(0);
      return;
    }

    read(inputs);
    for (let i = 0; i < output.length; i++) {
      let morph = morphPhase($morphFrequency);
      const a = interpolateLinear2d($wavetable, len, planeA, offset);
      if (planeB !== planeA) {
        const b = interpolateLinear2d($wavetable, len, planeB, offset);
        output[i] = (1 - morph) * a + morph * b;
      } else {
        output[i] = a;
      }
      offset += inc;
      if (offset >= len) offset -= len;
      if (offset < 0) offset += len;

      if (morphChange(morph)) {
        // TODO: on plane change a click is audible (fix it)
        planeA = planeB;
        planeB = (planeB + 1) % planes;
      }
    }
  }

  return { agen, set };
}

/**
 * Linear interpolation for a 2d buffer
 */
function interpolateLinear2d(
  buffer: Float32Array,
  len: number,
  plane: number,
  offset: number
) {
  const index = Math.floor(offset);
  const frac = offset - index;
  const next = (index + 1) % len;
  const y1 = buffer[plane * len + index];
  const y2 = buffer[plane * len + next];
  const y = y1 + (y2 - y1) * frac;
  return y;
}

/**
 * A Phasor is a signal generator that produces a sawtooth wave with a range of -1 to 1 in a specified frequency.
 */
function Phasor(sampleRate: number) {
  let isr = 1 / sampleRate;
  let phase = 0;

  return (frequency: number) => {
    phase += frequency * isr;
    while (phase >= 1.0) phase -= 1.0;
    while (phase < 0.0) phase += 1.0;
    return phase;
  };
}

/**
 * Convert a ramp into a trigger
 * @returns
 */
function Trigger() {
  let prev = 0;
  let prevWasTrigger = false;

  return function trigger(input: number) {
    const diff = Math.abs(input - prev);
    const trigger = diff > 0.5;
    prev = input;
    if (input === 0 || prevWasTrigger === true) {
      prevWasTrigger = false;
      return false;
    } else {
      prevWasTrigger = trigger;
      return trigger;
    }
  };
}
