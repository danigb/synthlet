import { createGateDetector } from "./_gate";

export function createKS(sampleRate: number, minFrequency: number) {
  const targetAmplitude = 0.001; // Amplitude decays to 0.1% of initial value
  const maxDelayLineLength = Math.ceil(sampleRate / minFrequency) + 2; // Extra samples for interpolation

  // The note ends on an envelope of |y|, not on an instantaneous sample: the
  // signal is noise-derived, so a bare threshold on one sample is satisfied by
  // a zero crossing at any amplitude. -100 dBFS is inaudible under any
  // playback gain.
  const stopThreshold = 1e-5; // -100 dBFS
  // One-pole follower with a 5 ms time constant. It settles (5 tau, 1103
  // samples) inside half a period at 20 Hz - the lowest pitch params.ts
  // declares, 2205 samples - so it never mistakes a trough for silence at any
  // supported pitch.
  const envelopeCoefficient = 1 - Math.exp(-1 / (0.005 * sampleRate));

  const delayLine = new Float32Array(maxDelayLineLength);

  let delayInSamples = maxDelayLineLength - 2;
  let writeIndex = 0;
  let envelope = 0;

  let isPlaying = false;
  const detectGate = createGateDetector();

  return (
    output: Float32Array,
    trigger: number,
    frequency: number,
    decay: number,
  ) => {
    const outputLength = output.length;

    const decayTimeInSamples = 0.1 * decay * sampleRate;
    const filterCoefficient = Math.pow(targetAmplitude, 1 / decayTimeInSamples);

    // The rising edge is the whole anti-double-trigger rule: re-plucking needs
    // the trigger to return to <= 0 first, which is a genuine retrigger.
    if (detectGate(trigger) === true) {
      delayInSamples = sampleRate / frequency;
      delayInSamples = Math.min(
        Math.max(delayInSamples, 1),
        maxDelayLineLength - 2,
      );

      for (let i = 0; i < maxDelayLineLength; i++) {
        delayLine[i] = Math.random() * 2 - 1;
      }
      writeIndex = 0;
      // The burst is full scale, so the follower starts there rather than at
      // zero - a zeroed envelope is below the threshold and would stop the
      // note on its first sample.
      envelope = 1;
      isPlaying = true;
    }

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

        // Stop playing once the envelope - not one sample - is inaudible
        envelope += envelopeCoefficient * (Math.abs(currentSample) - envelope);
        if (envelope < stopThreshold) {
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
