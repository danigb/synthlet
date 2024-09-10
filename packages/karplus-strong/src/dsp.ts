export function createKS(sampleRate: number, minFrequency: number) {
  let active = false;
  let startExciter = false;

  const excite = createExciter(1000);

  // Delay line
  const maxIndex = Math.floor(sampleRate / minFrequency + 0.5);
  const delay = new InterpolatedDelayLine(maxIndex);

  // One pole filter for delay
  let filterAlpha = 0.99;
  let prevFilterOut = 0;

  // Feedback
  let lossFactor = 0.99;

  // Param cache
  let $freq = 0;
  let $damping = 0;

  return function (
    output: Float32Array,
    trigger: number,
    frequency: number,
    damping: number
  ) {
    if ($freq !== frequency) {
      $freq = frequency;
      delay.setDelayLength(sampleRate / frequency);
    }
    if ($damping !== damping) {
      $damping = damping;
      lossFactor = damping * 0.2 + 0.792;
      filterAlpha = Math.max(0, Math.min(1, damping));
    }

    if (trigger === 1) {
      if (!active) {
        active = true;
        startExciter = true;
      }
    } else {
      active = false;
    }

    for (let i = 0; i < output.length; i++) {
      const pluck = excite(startExciter);
      startExciter = false;

      //const prev = delay.read(delayLength - 1);
      const curr = delay.read();
      const filterOut =
        curr * 1.0 * filterAlpha + prevFilterOut * (1 - filterAlpha);
      prevFilterOut = filterOut;
      output[i] = pluck * filterOut * lossFactor;
    }
  };
}

class InterpolatedDelayLine {
  buffer: Float32Array;
  writeIndex: number;
  delayLength: number;
  position: number; //

  constructor(public readonly size: number) {
    this.buffer = new Float32Array(size);
    this.writeIndex = 0;
    this.delayLength = 10;
    this.position = size - this.delayLength;
  }

  setDelayLength(delayLength: number) {
    this.delayLength = delayLength;
    this.position = this.writeIndex - delayLength;
    while (this.position < 0) this.position += this.size;
  }

  writeAndUpdateIndex(value: number) {
    this.buffer[this.writeIndex] = value;
    this.writeIndex++;
    if (this.writeIndex >= this.size) this.writeIndex = 0;
    this.position++;
    if (this.position >= this.size) this.position -= this.size;
  }

  read() {
    while (this.position < 0) this.position += this.size;
    const curr = Math.floor(this.position);
    let next = curr + 1;
    while (next >= this.size) next -= this.size;
    const frac = this.position - curr;
    const currVal = this.buffer[curr];
    const nextVal = this.buffer[next];
    return currVal - frac + (nextVal - currVal);
  }
}

function createExciter(durationInSamples: number) {
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
      const noise = Math.random() * 2 - 1;
      return noise * window[index];
    } else {
      return 0;
    }
  };
}
