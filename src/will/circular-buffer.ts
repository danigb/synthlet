const linearInterpolation = (y1: number, y2: number, fractional: number) =>
  fractional * y2 + (1.0 - fractional) * y1;

class CircularBuffer {
  private buffer: number[];
  private writeIndex = 0;
  private bufferLength = 1024;
  private wrapMask = 1023;
  private interpolate = true;

  // use a linear interpolator by default
  interpolator: (y1: number, y2: number, fractional: number) => number =
    linearInterpolation;

  constructor() {}

  flushBuffer(): void {
    if (this.buffer) {
      this.buffer.fill(0, 0, this.bufferLength);
    }
  }

  createCircularBuffer(bufferLength: number): void {
    const bufferLengthPowerOfTwo = Math.pow(
      2,
      Math.ceil(Math.log(bufferLength) / Math.log(2))
    );
    this.createCircularBufferPowerOfTwo(bufferLengthPowerOfTwo);
  }

  createCircularBufferPowerOfTwo(bufferLengthPowerOfTwo: number): void {
    this.writeIndex = 0;
    this.bufferLength = bufferLengthPowerOfTwo;
    this.wrapMask = bufferLengthPowerOfTwo - 1;
    this.buffer = new Array(bufferLengthPowerOfTwo);
    this.flushBuffer();
  }

  writeBuffer(input: number): void {
    if (this.buffer) {
      this.buffer[this.writeIndex++] = input;
      this.writeIndex &= this.wrapMask;
    }
  }

  readBuffer(delayInSamples: number): number {
    if (!this.buffer) {
      throw new Error("Circular buffer not created");
    }
    const readIndex =
      ((this.writeIndex - 1 - delayInSamples) & this.wrapMask) >>> 0;
    return this.buffer[readIndex];
  }

  readBufferWithFractionalDelay(delayInFractionalSamples: number): number {
    if (!this.buffer) {
      throw new Error("Circular buffer not created");
    }
    const intPart = Math.floor(delayInFractionalSamples);
    const y1 = this.readBuffer(intPart);

    if (!this.interpolate) {
      return y1;
    }
    const readIndexNext = ((intPart + 1) & this.wrapMask) >>> 0;
    const y2 = this.readBuffer(readIndexNext);
    const fraction = delayInFractionalSamples - intPart;
    // implementation of linear interpolation, you can replace it with other interpolation types
    return this.interpolator(y1, y2, fraction);
  }

  setInterpolate(b: boolean): void {
    this.interpolate = b;
  }
}
