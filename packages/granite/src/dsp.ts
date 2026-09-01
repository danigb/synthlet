export type UpdateFn = ReturnType<typeof createDsp>["update"];
export type ComputeFn = ReturnType<typeof createDsp>["compute"];

export function createDsp(sampleRate: number) {
  const GRAIN_DURATION_MS = 200;
  const NUMBER_OF_GRAINS = 16;

  let wet = 0;
  let freq = 0;
  let freqPhasorInc = 0;
  let freqPhasor = 0;
  let density = 0;
  let densityPhasorInc = 0;
  let densityPhasor = 0;
  let spread = 0;

  let currentGrain = 0;
  const grainLength = Math.floor(sampleRate * (GRAIN_DURATION_MS / 1000));
  const window = createWindow(grainLength);
  const grains = Array.from(
    { length: NUMBER_OF_GRAINS },
    () => new Grain(grainLength),
  );

  function update(
    wetParam: number,
    freqParam: number,
    densityParam: number,
    spreadParam: number,
  ) {
    wet = wetParam;
    freq = freqParam;
    density = densityParam;
    spread = spreadParam;
    freqPhasorInc = freq / sampleRate;
    densityPhasorInc = density / sampleRate;
  }

  function compute(
    inputs: Float32Array[],
    outputs: Float32Array[],
    count: number,
  ) {
    const input = inputs[0];
    const outLeft = outputs[0];
    const outRight = outputs[1];

    // Update the read speed phasor and trigger grain read
    freqPhasor += freqPhasorInc * count;
    if (freqPhasor > 1) {
      freqPhasor -= 1;
      grains[currentGrain].startRead();
      currentGrain = (currentGrain + 1) % NUMBER_OF_GRAINS;
    }

    // Update the write speed phasor
    densityPhasor += densityPhasorInc * count;
    if (densityPhasor > 1) {
      densityPhasor -= 1;
      const randomIndex =
        Math.floor(Math.random() * NUMBER_OF_GRAINS) % NUMBER_OF_GRAINS;
      const grain = grains[randomIndex];
      if (grain.startWrite()) {
        grain.pan(Math.random() * spread * 2 - 1);
        grain.filter(Math.random() * 2000);
      }
    }

    // Read and write the grains
    for (let i = 0; i < NUMBER_OF_GRAINS; i++) {
      grains[i].read(input, window);
      grains[i].write(wet, outLeft, outRight);
    }

    // Add the dry signal to the output
    const dry = 1 - wet;
    for (let i = 0; i < count; i++) {
      outLeft[i] += dry * input[i];
      outRight[i] += dry * input[i];
    }
  }

  return {
    update,
    compute,
  };

  function createWindow(length: number) {
    const window = new Float32Array(length);
    for (let i = 0; i < length; i++) {
      window[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (length - 1)));
    }

    let sum = 0;
    for (let i = 0; i < length; i++) {
      sum += window[i];
    }
    const normalizationFactor = length / sum;

    for (let i = 0; i < length; i++) {
      window[i] *= normalizationFactor;
    }

    return window;
  }
}

function createHiPassFilter(sampleRate: number) {
  let cutoffFrequency: number = 0;
  let alpha: number = 0;
  let previousInput: number = 0;
  let previousOutput: number = 0;

  function freq(speed: number): void {
    cutoffFrequency = speed;
    const rc = 1 / (2 * Math.PI * cutoffFrequency);
    alpha = rc / (rc + 1 / sampleRate);
  }

  function process(buffer: Float32Array, length: number) {
    for (let i = 0; i < length; i++) {
      const input = buffer[i];
      const output = alpha * (previousOutput + input - previousInput);
      buffer[i] = output;
      previousInput = input;
      previousOutput = output;
    }
  }
  freq(1000);
  return {
    freq,
    process,
  };
}

class Grain {
  private buffer: Float32Array;
  private readSamples = 0;
  private writeSamples = 0;
  private leftGain = 0;
  private rightGain = 0;
  private readPosition = 0;
  private writePosition = 0;
  private hipass = createHiPassFilter(sampleRate);

  constructor(grainLength: number) {
    this.buffer = new Float32Array(grainLength);
  }

  startRead() {
    if (this.readSamples > 0 || this.writeSamples > 0) return;
    this.readSamples = this.buffer.length;
    this.readPosition = 0;
  }

  startWrite() {
    if (this.writeSamples > 0) {
      return false;
    }
    this.writeSamples = this.buffer.length;
    this.writePosition = 0;
    return true;
  }

  pan(pan: number) {
    this.leftGain = Math.cos((Math.PI / 4) * (pan + 1));
    this.rightGain = Math.sin((Math.PI / 4) * (pan + 1));
  }

  filter(speed: number) {
    this.hipass.freq(speed);
  }

  read(input: Float32Array, window: Float32Array) {
    if (this.readSamples === 0) return;
    const samples = Math.min(this.readSamples, input.length);

    for (let i = 0; i < samples; i++) {
      this.buffer[this.readPosition] = input[i] * window[this.readPosition];
      this.readPosition++;
    }

    this.readSamples -= samples;

    if (this.readSamples == 0) {
      this.hipass.process(this.buffer, this.buffer.length);
    }
  }

  write(wet: number, outLeft: Float32Array, outRight: Float32Array) {
    if (this.writeSamples === 0) return;
    const samples = Math.min(this.writeSamples, outLeft.length);

    const leftVol = this.leftGain * wet;
    const rightVol = this.rightGain * wet;

    for (let i = 0; i < samples; i++) {
      outLeft[i] += this.buffer[this.writePosition] * leftVol;
      outRight[i] += this.buffer[this.writePosition] * rightVol;
      this.writePosition++;
    }

    this.writeSamples -= samples;
  }
}
