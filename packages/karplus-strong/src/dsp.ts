export function createKS(sampleRate: number) {
  let active = false;
  let activationSamples = 0;

  // Delay line
  const maxDelaySecs = 0.5;
  const delayLine = new Float32Array(maxDelaySecs * sampleRate);
  let writeIndex = 0;

  // One pole filter

  return function (output: Float32Array, trigger: number) {
    if (trigger === 1) {
      if (!active) {
        active = true;
        activationSamples = 100;
      }
    } else {
      active = false;
    }

    for (let i = 0; i < output.length; i++) {
      let output = 0;
      if (activationSamples) {
        const noise = Math.random() * 2 - 1;
        activationSamples--;
        // Write to the delay line
        delayLine[writeIndex] = noise;
        output = noise;
      }

      writeIndex++;
      if (writeIndex >= delayLine.length) writeIndex = 0;

      output[i] = output;
    }
  };
}
