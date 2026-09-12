/**
 * The follower, with no Web Audio anywhere near it.
 *
 * Part 15's circuit is a rectifier into a capacitor: *"If successive peaks of
 * the input signal are of increasing amplitude, the capacitor is charged up,
 * and if the peaks are decreasing in amplitude the capacitor discharges at a
 * rate determined by the value of the variable resistor."* That is an
 * asymmetric one-pole on a rectified input, and it is what `createFollower`
 * is - kept a small closure rather than fused into the processor, so a bank of
 * them is reachable later (the vocoder is Part 15's second half).
 */

export enum EnvelopeFollowerType {
  /**
   * The book's, *"strictly speaking, a 'peak amplitude follower'"*. Rectify,
   * then charge and discharge. With `attack: 0` it is a true peak detector.
   */
  Peak = 0,
  /**
   * Root mean square: what a sidechain wants, and what reads the same for a
   * sine and for the square wave of the same loudness rather than of the same
   * height. Two stages - see `createFollower`.
   */
  Rms = 1,
}

/**
 * `ln(100)`. The library's one meaning for a time in seconds, fixed by the
 * envelopes folder's ticket 02: **the number is how long the move takes**, and
 * "the move" is 99 % of a step.
 *
 * Analogue followers, and most plugin ones, label their attack and release as
 * *time constants* - 63.2 % of a step, τ. Adopting that here would put two
 * meanings of "seconds" in one library. To port a setting from a plugin that
 * means τ, multiply it by this: `t = τ × 4.605`.
 */
export const NINETY_NINE_PERCENT = Math.log(100);

/**
 * The pole of a one-pole that covers 99 % of a step in `seconds`.
 *
 * Derived from the sample rate, so 44.1 and 48 kHz behave identically rather
 * than differing by 8 %. `seconds <= 0` is instantaneous: the coefficient is 0
 * and the filter takes its input. (`exp(-x/0)` is already 0, but relying on
 * that is a puzzle for the next reader.)
 */
export function followerCoefficient(seconds: number, sampleRate: number) {
  if (seconds <= 0) return 0;
  return Math.exp(-NINETY_NINE_PERCENT / (seconds * sampleRate));
}

export type FollowerParamInputs = {
  type: ArrayLike<number>;
  gain: ArrayLike<number>;
  attack: ArrayLike<number>;
  release: ArrayLike<number>;
};

/**
 * An envelope follower: audio in, one control signal out.
 *
 * ```
 * Peak: d = max |gain·c| over channels
 * Rms:  ms = cAvg·ms + (1-cAvg)·mean(gain·c)²   then  d = sqrt(ms)
 *       env = c·env + (1-c)·d                   c = attack if d > env else release
 * ```
 *
 * **Why `Rms` has two stages.** The obvious one-stage version - run the
 * asymmetric filter directly on the squared signal - is not RMS. A rectified
 * sine's square swings between 0 and 1 at twice the signal frequency, so a
 * fast attack and a slow release *ratchet* the mean-square up towards its peak
 * instead of averaging it: at 1 kHz with the defaults it settles near 0.87,
 * whose root is 0.93 rather than 0.707. A mean needs a symmetric filter, so the
 * averaging stage uses `release` in both directions and the asymmetric stage
 * then shapes the result. It is how a compressor's RMS detector is built, and
 * the cost - an RMS follower is always slower than a peak one - is real and
 * documented.
 *
 * Channels fold into the detector rather than being followed separately: a
 * stereo input yields one envelope that responds to whichever channel is
 * loudest, which is what a sidechain wants and what makes the output a control
 * signal rather than two inconsistently timed copies of one decision.
 */
export function createFollower(sampleRate: number) {
  let $attack = -1;
  let $release = -1;
  let attackCoefficient = 0;
  let releaseCoefficient = 0;

  let env = 0;
  let ms = 0;

  return function follow(
    inputs: Float32Array[],
    output: Float32Array,
    params: FollowerParamInputs,
  ) {
    _update(params.attack[0], params.release[0]);

    const rms = params.type[0] >= EnvelopeFollowerType.Rms;
    const gain = params.gain[0];
    const channels = inputs.length;
    const frames = output.length;

    for (let i = 0; i < frames; i++) {
      let d = 0;

      if (rms) {
        let sum = 0;
        for (let c = 0; c < channels; c++) {
          const x = (inputs[c][i] ?? 0) * gain;
          sum += x * x;
        }
        const mean = channels > 0 ? sum / channels : 0;
        ms = releaseCoefficient * ms + (1 - releaseCoefficient) * mean;
        d = Math.sqrt(ms);
      } else {
        for (let c = 0; c < channels; c++) {
          const x = Math.abs((inputs[c][i] ?? 0) * gain);
          if (x > d) d = x;
        }
      }

      const coefficient = d > env ? attackCoefficient : releaseCoefficient;
      env = coefficient * env + (1 - coefficient) * d;
      // The detector is non-negative and so is every coefficient, so the
      // envelope cannot go negative - but a denormal can, and a control signal
      // that dips below zero would invert whatever it is driving.
      output[i] = env > 0 ? env : 0;
    }
  };

  function _update(attack: number, release: number) {
    if ($attack !== attack) {
      $attack = attack;
      attackCoefficient = followerCoefficient(attack, sampleRate);
    }
    if ($release !== release) {
      $release = release;
      releaseCoefficient = followerCoefficient(release, sampleRate);
    }
  }
}
