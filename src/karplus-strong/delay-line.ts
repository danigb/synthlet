import { CircularBuffer } from "./circular-buffer";

/**
 * Simple delay line object implements audio delay as a circular buffer.
 * - used as the delay line for the Resonator object with Karplus-Strong string simulation
 * - initialized with lowest oscillator value (in Hz) that the resonator can synthesize
 * rather than the usual delay time
 * - taken directly from the AudioDelay object 
 * - Heavily detailed in the book Designing Audio Effects Plugins in C++ 2nd Ed and
 * at http://aspikplugins.com/sdkdocs/html/index.html

 * @author Will Pirkle http://www.willpirkle.com
 */
export class DelayLine {
  private delaySamples: number = 0; // delay time in samples
  private delayBuffer = new CircularBuffer(); // circular buffer to implement delay

  public clear(): void {
    this.delayBuffer.flushBuffer();
  }

  public reset(sampleRate: number, minimumPitch: number = 8.176): void {
    // 8.176 = MIDI note 0
    this.delayBuffer.createCircularBuffer(
      Math.floor(sampleRate / minimumPitch)
    );
    this.clear();
  }

  public setDelayInSamples(delaySamples: number): void {
    this.delaySamples = delaySamples;
  }

  public writeDelay(xn: number): void {
    this.delayBuffer.writeBuffer(xn);
  }

  public readDelay(): number {
    return this.delayBuffer.readBuffer(this.delaySamples);
  }
}
