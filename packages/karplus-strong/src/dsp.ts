export function createKS(sampleRate: number) {
  let active = false;
  let startEnvelope = false;

  const ad = createEnvelope(100);

  // Delay line
  const maxDelaySecs = 0.5;
  const maxIndex = maxDelaySecs * sampleRate - 1;
  const delayLine = new Float32Array(maxIndex + 1);
  let writeIndex = 0;
  let readIndex = Math.floor(0.2 * sampleRate);
  let fracA = 1;
  let fracB = 0;

  // One pole filter for delay
  let zNoise = 0;

  // One pole filter for output
  let zDelay = 0;

  // Feedback
  let fb = 0;

  // Param cache
  let $freq = 0;
  let $feedback = 0;

  return function (
    output: Float32Array,
    trigger: number,
    frequency: number,
    feedback: number
  ) {
    if ($freq !== frequency) {
      $freq = frequency;
      const delaySamples = sampleRate / frequency;
      let offset = Math.floor(delaySamples);
      readIndex = writeIndex + delayLine.length - offset;
      fracA = delaySamples - offset;
      fracB = 1 - fracA;
      while (readIndex > maxIndex) readIndex -= delayLine.length;
      console.log("DELAY SAMPLES", {
        delaySamples,
        offset,
        readIndex,
        writeIndex,
        fracA,
        fracB,
      });
    }
    if ($feedback !== feedback) {
      fb = Math.max(0.01, Math.min(0.99, feedback));
    }

    if (trigger === 1) {
      if (!active) {
        active = true;
        startEnvelope = true;
        console.log("START!", fb);
      }
    } else {
      active = false;
    }

    for (let i = 0; i < output.length; i++) {
      let env = ad(startEnvelope);
      startEnvelope = false;
      const noise = env !== 0 ? env * Math.random() * 2 - 1 : 0;
      const filteredNoise = noise - zNoise * 0.999;
      zNoise = noise;

      // Read delay with
      let a = delayLine[readIndex];
      let b = readIndex === maxIndex ? delayLine[0] : delayLine[readIndex + 1];
      const delayRead = a * fracA + b * fracB;

      // Apply one pole filter delay
      const filteredDelay = delayRead + zDelay * 0.999;
      zDelay = filteredDelay;

      delayLine[writeIndex] = noise + fb * delayRead;

      readIndex++;
      if (readIndex > maxIndex) readIndex = 0;
      writeIndex++;
      if (writeIndex > maxIndex) writeIndex = 0;

      output[i] = filteredNoise + delayRead;
    }
  };
}

function createEnvelope(durationInSamples: number) {
  const window = new Float32Array(durationInSamples);

  // Create a triangular envelope
  for (let i = 0; i < durationInSamples; i++) {
    window[i] = 1 - Math.abs(i / (durationInSamples / 2) - 1);
  }

  let index = window.length;

  return function (start: boolean) {
    if (start) index = 0;
    if (index < window.length) {
      index++;
      return window[index];
    } else {
      return 0;
    }
  };
}
