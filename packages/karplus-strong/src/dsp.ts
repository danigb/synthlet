export function createKS(sampleRate: number, minFrequency: number) {
  const targetAmplitude = 0.001; // Amplitude decays to 0.1% of initial value
  const maxDelayLineLength = Math.ceil(sampleRate / minFrequency) + 2; // Extra samples for interpolation

  const delayLine = new Float32Array(maxDelayLineLength);

  let delayInSamples = maxDelayLineLength - 2;
  let writeIndex = 0;

  let isPlaying = false;
  let prevTrigger = 0;

  return (
    output: Float32Array,
    trigger: number,
    frequency: number,
    decay: number
  ) => {
    const outputLength = output.length;

    const decayTimeInSamples = 0.1 * decay * sampleRate;
    const filterCoefficient = Math.pow(targetAmplitude, 1 / decayTimeInSamples);

    if (trigger >= 1 && prevTrigger < 0.9) {
      // Some hysterisis to avoid double triggering
      delayInSamples = sampleRate / frequency;
      delayInSamples = Math.min(
        Math.max(delayInSamples, 1),
        maxDelayLineLength - 2
      );

      for (let i = 0; i < maxDelayLineLength; i++) {
        delayLine[i] = Math.random() * 2 - 1;
      }
      writeIndex = 0;
      isPlaying = true;
    }
    prevTrigger = trigger;

    if (isPlaying) {
      for (let i = 0; i < outputLength; i++) {
        let readIndex = writeIndex - delayInSamples;
        if (readIndex < 0) {
          readIndex += maxDelayLineLength;
        }

        const readIndexInt = Math.floor(readIndex);
        const frac = readIndex - readIndexInt;

        // Wrap around the delay line
        const index0 = readIndexInt % maxDelayLineLength;
        const index1 = (readIndexInt + 1) % maxDelayLineLength;

        // Linear interpolation between two samples
        const sample0 = delayLine[index0];
        const sample1 = delayLine[index1];
        const currentSample = sample0 + frac * (sample1 - sample0);

        const nextSample = filterCoefficient * currentSample;
        delayLine[writeIndex] = nextSample;
        output[i] = currentSample;

        writeIndex = (writeIndex + 1) % maxDelayLineLength;

        // Stop playing if the signal has decayed below a threshold
        if (Math.abs(currentSample) < 1e-8) {
          isPlaying = false;
          for (let j = i + 1; j < outputLength; j++) {
            output[j] = 0;
          }
          break;
        }
      }
    } else {
      // Output silence when not playing
      output.fill(0);
    }
  };
}
