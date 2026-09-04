type Inputs = {
  baseFrequency: number[];
  frequency: number[];
  morphFrequency: number[];
};

export function WavetableOscillator(sampleRate: number) {
  let $baseFrequency = 220;
  let $frequency = 440;
  let $morphFrequency = 0.05;
  let $wavetable = new Float32Array(0);

  let len = 0;
  let planes = 0;
  let planeA = 0;
  let planeB = 0;
  let offset = 0;
  let inc = 2;
  let morphPhase = Phasor(sampleRate);
  let morphChange = Trigger();

  // `baseFrequency` has minValue 0, and _worklet.ts writes 0 into every connected
  // param before its driver produces output, so the divisor is reachably zero. An
  // unguarded ratio makes `inc` Infinity (or NaN for 0/0), `offset` follows it and
  // never comes back. The comparison form resolves NaN to 0 instead of propagating.
  // The ceiling is one table cycle every four output samples (sampleRate / 4), so
  // it depends on `len` and set() has to recompute it after a table swap.
  function updateInc() {
    const raw = $frequency / $baseFrequency;
    const max = len / 4;
    inc = raw > 0 ? (raw < max ? raw : max) : 0;
  }

  function read(inputs: Inputs) {
    if (
      inputs.frequency[0] !== $frequency ||
      inputs.baseFrequency[0] !== $baseFrequency
    ) {
      $baseFrequency = inputs.baseFrequency[0];
      $frequency = inputs.frequency[0];
      updateInc();
    }
    $morphFrequency = inputs.morphFrequency[0];
  }

  function set(wavetable: Float32Array, length: number) {
    $wavetable = wavetable;
    len = Math.min(length, wavetable.length);
    planes = Math.floor(wavetable.length / len);
    planeA = 0;
    planeB = (planeA + 1) % planes;
    // Without this a swap mid-note keeps the old read position — out of range for a
    // shorter table, so it reads undefined and emits NaN until it walks back — and
    // the old morph phase, so the crossfade steps into the new plane pair.
    offset = 0;
    morphPhase.reset();
    morphChange.reset();
    updateInc();
  }

  function agen(output: Float32Array, inputs: Inputs) {
    if (len === 0 || planes === 0) {
      output.fill(0);
      return;
    }

    read(inputs);
    for (let i = 0; i < output.length; i++) {
      const morph = morphPhase($morphFrequency);
      // The phasor wraps on the same sample this writes, so the pair has to advance
      // first: a morph of ~0 against the old pair is a one-sample jump back to
      // planeA, and its size is |planeA - planeB| — a full-scale click.
      if (morphChange(morph)) {
        planeA = planeB;
        planeB = (planeB + 1) % planes;
      }
      const a = interpolateLinear2d($wavetable, len, planeA, offset);
      if (planeB !== planeA) {
        const b = interpolateLinear2d($wavetable, len, planeB, offset);
        output[i] = (1 - morph) * a + morph * b;
      } else {
        output[i] = a;
      }
      offset += inc;
      // One step back into range whatever the overshoot; `len` is at least 1 here
      // because agen() returns early on len === 0.
      offset -= len * Math.floor(offset / len);
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
  offset: number,
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

  const phasor = (frequency: number) => {
    phase += frequency * isr;
    while (phase >= 1.0) phase -= 1.0;
    while (phase < 0.0) phase += 1.0;
    return phase;
  };
  phasor.reset = () => {
    phase = 0;
  };
  return phasor;
}

/**
 * Convert a ramp into a trigger
 * @returns
 */
function Trigger() {
  let prev = 0;
  let prevWasTrigger = false;

  const detect = (input: number) => {
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
  detect.reset = () => {
    prev = 0;
    prevWasTrigger = false;
  };
  return detect;
}
