import { DelayLine } from "./delay-line";

/**
 * Special purpose object for use as Karplus Strong resonator
 * - implements single delay-line version of KS algorithm
 * - initial state of delay is EMPTY and the exciter feeds the 
 * delay free path directly

 * @author Will Pirkle http://www.willpirkle.com
 * This object is included and described in further detail in
 * Designing Software Synthesizer Plugins in C++ 2nd Ed. by Will Pirkle
 */
export class Resonator {
  // --- sample rate
  sampleRate: number = 1.0; // sample rate
  decay: number = 0.0; // feedback coefficient controls rate
  delayLine: DelayLine = new DelayLine(); // delay line for KD
  fracDelayAPF: FracDelayAPF = new FracDelayAPF(); // APF for fractional delay
  loopFilter: ResLoopFilter = new ResLoopFilter(); // 1st order 1/2 sample delay LPF

  reset(sampleRate: number): boolean {
    this.sampleRate = sampleRate;

    // reset with lowest f0 = 8.176 Hz (MIDI 0)
    this.delayLine.reset(sampleRate, 8.176);
    this.loopFilter.reset();
    this.fracDelayAPF.reset();

    return true;
  }

  process(xn: number): number {
    const delayOut = this.delayLine.readDelay();
    // filter input + delay output
    const filterOut = this.loopFilter.processAudioSample(xn + delayOut);
    // create fractional delay with APF
    const yn = this.fracDelayAPF.processAudioSample(filterOut);
    // write the value into the delay and scale
    this.delayLine.writeDelay(yn * this.decay);
    // done
    return yn;
  }

  setParameters(frequency: number, decay: number): number {
    // store for render
    this.decay = decay;

    // calculate delay time for this pitch
    const delayTime = this.sampleRate / frequency;

    // the tube + LPF = L + 1/2 samples, so back calculate to get the delay length
    const delayLength = delayTime - 0.5;

    // now take integer portion
    const intDelayLen = Math.floor(delayLength);

    // this guarantees that apfDelta will be betwen [0.0, 1.0] or fractional delay
    const apfDelta = delayTime - (intDelayLen + 0.5);

    // calculate normalized frequency in Hz
    const omega_0 = (2 * Math.PI * frequency) / this.sampleRate;
    const omega_0_half = omega_0 / 2.0;

    // calcuate APF coefficients using desired fractional delay, apfDelta
    const alpha =
      Math.sin((1.0 - apfDelta) * omega_0_half) /
      Math.sin((1.0 + apfDelta) * omega_0_half);

    // delay is -1 because of the way the CircularBuffer works, expecting read/write
    this.delayLine.setDelayInSamples(intDelayLen - 1);

    // set APF for fractional delay
    this.fracDelayAPF.setAlpha(alpha);

    return delayTime;
  }

  // flush out delay
  flushDelays(): void {
    this.delayLine.clear();
    this.loopFilter.reset();
    this.fracDelayAPF.reset();
  }
}
