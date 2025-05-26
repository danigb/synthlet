const RENDER_QUANTUM = 128;
const MIN_ENVELOPE_GAIN = 1e-6; // Approx -120 dB
const MIN_DB_GAIN = -120.0; // Min practical dB for gain values

// Helper functions (must be defined or imported)
function dbToGain(db: number): number {
  return Math.pow(10, db / 20);
}
function gainToDb(gain: number): number {
  if (gain < MIN_ENVELOPE_GAIN) return MIN_DB_GAIN; // Avoid log(0) or very small numbers
  return 20 * Math.log10(gain);
}

// https://github.com/DanielRudrich/SimpleCompressor/blob/master/docs/lookAheadLimiter.md
class LookAheadLimiterProcessor extends AudioWorkletProcessor {
  // Configuration (fixed after construction)
  private readonly thresholdDb: number;
  private readonly lookAheadFrames: number;
  private readonly releaseCoeff: number;

  // Audio Delay Buffers
  private audioDelayBufferL: Float32Array;
  private audioDelayBufferR: Float32Array;
  private audioWriteReadPos: number = 0; // Single pointer for audio circular buffer

  // Gain Smoothing Buffer
  private gainSmoothingBuffer: Float32Array;
  private gainBlockWriteStartPos: number = 0; // Start index for writing the current block's raw gains

  // Envelope follower state
  private envelopeGain: number = 0.0;

  constructor(options?: AudioWorkletNodeOptions) {
    super();

    const processorOptions = options?.processorOptions || {};
    this.thresholdDb =
      typeof processorOptions.thresholdDb === "number"
        ? processorOptions.thresholdDb
        : -1.0;
    const lookAheadSeconds =
      typeof processorOptions.lookAheadSeconds === "number" &&
      processorOptions.lookAheadSeconds >= 0
        ? processorOptions.lookAheadSeconds
        : 0.005;
    const releaseSeconds =
      typeof processorOptions.releaseSeconds === "number" &&
      processorOptions.releaseSeconds > 0
        ? processorOptions.releaseSeconds
        : 0.1;

    this.lookAheadFrames = Math.max(
      1,
      Math.ceil(lookAheadSeconds * sampleRate)
    );
    this.releaseCoeff = Math.exp(-1.0 / (sampleRate * releaseSeconds));

    this.audioDelayBufferL = new Float32Array(this.lookAheadFrames);
    this.audioDelayBufferR = new Float32Array(this.lookAheadFrames);

    const gainSmoothingBufferLength = RENDER_QUANTUM + this.lookAheadFrames;
    this.gainSmoothingBuffer = new Float32Array(gainSmoothingBufferLength);
    this.gainSmoothingBuffer.fill(0.0);
  }

  process(inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    const inputL = inputs[0][0];
    const inputR = inputs[0][1] || inputL;
    const outputL = outputs[0][0];
    const outputR = outputs[0][1] || outputL;
    const numSamplesInBlock = inputL.length; // Should be RENDER_QUANTUM

    for (let i = 0; i < numSamplesInBlock; i++) {
      const currentInputL = inputL[i];
      const currentInputR = inputR[i];

      const peakInput = Math.max(
        Math.abs(currentInputL),
        Math.abs(currentInputR)
      );
      if (this.envelopeGain < peakInput) {
        this.envelopeGain = peakInput;
      } else {
        this.envelopeGain =
          peakInput + this.releaseCoeff * (this.envelopeGain - peakInput);
      }
      const envelopeDb = gainToDb(this.envelopeGain);
      const rawGainDb = Math.min(0.0, this.thresholdDb - envelopeDb);

      const gainWriteIdx =
        (this.gainBlockWriteStartPos + i) % this.gainSmoothingBuffer.length;
      this.gainSmoothingBuffer[gainWriteIdx] = rawGainDb;
    }

    let nextSmoothedGainDb = 0.0;
    let stepDb = 0.0;
    let currentIndex =
      (this.gainBlockWriteStartPos +
        numSamplesInBlock -
        1 +
        this.gainSmoothingBuffer.length) %
      this.gainSmoothingBuffer.length;

    for (let k = 0; k < numSamplesInBlock; ++k) {
      const sampleDb = this.gainSmoothingBuffer[currentIndex];
      if (sampleDb > nextSmoothedGainDb) {
        this.gainSmoothingBuffer[currentIndex] = nextSmoothedGainDb;
      } else {
        stepDb =
          this.lookAheadFrames > 0 ? -sampleDb / this.lookAheadFrames : 0.0;
        nextSmoothedGainDb = sampleDb;
      }
      nextSmoothedGainDb += stepDb;
      if (nextSmoothedGainDb > 0.0) nextSmoothedGainDb = 0.0;
      currentIndex =
        (currentIndex - 1 + this.gainSmoothingBuffer.length) %
        this.gainSmoothingBuffer.length;
    }

    for (let k = 0; k < this.lookAheadFrames; ++k) {
      const sampleDb = this.gainSmoothingBuffer[currentIndex];
      if (sampleDb > nextSmoothedGainDb) {
        this.gainSmoothingBuffer[currentIndex] = nextSmoothedGainDb;
      } else {
        break;
      }
      nextSmoothedGainDb += stepDb;
      if (nextSmoothedGainDb > 0.0) nextSmoothedGainDb = 0.0;
      currentIndex =
        (currentIndex - 1 + this.gainSmoothingBuffer.length) %
        this.gainSmoothingBuffer.length;
    }

    for (let i = 0; i < numSamplesInBlock; i++) {
      const delayedAudioL = this.audioDelayBufferL[this.audioWriteReadPos];
      const delayedAudioR = this.audioDelayBufferR[this.audioWriteReadPos];

      this.audioDelayBufferL[this.audioWriteReadPos] = inputL[i];
      this.audioDelayBufferR[this.audioWriteReadPos] = inputR[i];

      const smoothedGainReadIdx =
        (this.gainBlockWriteStartPos +
          i -
          this.lookAheadFrames +
          this.gainSmoothingBuffer.length) %
        this.gainSmoothingBuffer.length;

      const finalSmoothedGainDb = this.gainSmoothingBuffer[smoothedGainReadIdx];
      const finalGainLinear = dbToGain(
        Math.max(MIN_DB_GAIN, finalSmoothedGainDb)
      );

      outputL[i] = delayedAudioL * finalGainLinear;
      outputR[i] = delayedAudioR * finalGainLinear;

      this.audioWriteReadPos =
        (this.audioWriteReadPos + 1) % this.lookAheadFrames; // Advance for next sample
    }

    this.gainBlockWriteStartPos =
      (this.gainBlockWriteStartPos + numSamplesInBlock) %
      this.gainSmoothingBuffer.length;

    return true;
  }
}

registerProcessor("LookaheadLimiterProcessor", LookAheadLimiterProcessor);
