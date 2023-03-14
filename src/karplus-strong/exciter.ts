import { DCRemovalFilter } from "../filters/dc-removal-filter";
import { ExciterEG } from "./exciter-eg";

/**
 * Special purpose object for use as Karplus Strong exciter
 * - does not use a base class or interface
 * - custom designed for use with KS algorithm
 *
 * @author Will Pirkle http://www.willpirkle.com
 */
export class Exciter {
  noiseGen = new NoiseGenerator(); ///< noise maker
  noiseEG = new ExciterEG(); ///< EG to shape the noise
  dcFilter = new DCRemovalFilter(); ///< DC removal for short term random bias

  /** Similar functions as SynthModule, only simpler */
  reset(_sampleRate: number): boolean {
    this.noiseEG.reset(_sampleRate);
    this.dcFilter.reset(_sampleRate);
    return true;
  }

  render(coupledInput: number = 0.0): number {
    const noise = this.noiseGen.doWhiteNoise();
    const eg = this.noiseEG.render();
    const ahr = noise * eg + coupledInput;
    return this.dcFilter.processAudioSample(ahr);
  }
  startExciter(): void {
    this.noiseEG.startEG();
  }
  setParameters(
    attackTime_mSec: number,
    holdTime_mSec: number,
    releaseTime_mSec: number
  ): void {
    this.noiseEG.setParameters(
      attackTime_mSec,
      holdTime_mSec,
      releaseTime_mSec
    );
  }
}
