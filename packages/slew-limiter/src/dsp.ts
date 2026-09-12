import { smoothCoefficient } from "./_smooth";

/**
 * Rate-limit a control signal, in either of the two laws the name covers.
 *
 * A *slew limiter*, strictly, caps the rate of change: the output moves toward
 * the input at no more than R units per second, which turns a step into a
 * straight ramp. That is what Serge and Buchla build, and it is `Linear`.
 *
 * The book depicts the other one - *"I've depicted the slew as an exponential
 * glide between voltages, as it would be on most vintage synths"* - the RC
 * network on the keyboard CV that gives Part 16's Figure 16 its shark's tooth.
 * That is `Exponential`, and it is the default.
 *
 * The default is about **units**, not taste. A linear rate is expressed per
 * unit of the signal, so its musical meaning depends entirely on what the
 * signal is: 1 unit/second is a lifetime on a `[0,1]` CV and imperceptible on a
 * frequency in hertz. An exponential move is proportional, so its duration is
 * the same whatever the step size and whatever the unit - which is also why it
 * can share `envelope-follower`'s definition of seconds unchanged.
 */
export enum SlewType {
  /** `out += (in - out) x (1 - c)`. `rise`/`fall` are 99 % of a step. */
  Exponential = 0,
  /** `out += clamp(in - out, -fallStep, riseStep)`. Seconds per unit. */
  Linear = 1,
}

export type SlewParamInputs = {
  type: ArrayLike<number>;
  rise: ArrayLike<number>;
  fall: ArrayLike<number>;
};

/**
 * A slew generator over as many channels as it is given.
 *
 * `rise` applies when the input is above the current output and `fall` when it
 * is below, so an S&H staircase through an asymmetric setting gets the book's
 * shark's tooth and a symmetric one is a plain glide.
 *
 * **State is `Float64`.** The linear law accumulates one step per sample -
 * 4410 of them for a 100 ms ramp at 44.1 kHz - and in single precision that
 * drift is several times 1e-6, which is the tolerance the ramp is supposed to
 * hold. Only the write to the output block is single precision.
 */
export function createSlew(sampleRate: number) {
  let $rise = -1;
  let $fall = -1;
  let riseCoefficient = 0;
  let fallCoefficient = 0;
  let riseStep = 0;
  let fallStep = 0;

  let state = new Float64Array(16);

  return function slew(
    inputs: Float32Array[],
    outputs: Float32Array[],
    params: SlewParamInputs,
  ) {
    _update(params.rise[0], params.fall[0]);

    const linear = params.type[0] >= SlewType.Linear;
    const channels = inputs.length;

    // Growing is an allocation, but only when the channel count changes -
    // never per block.
    if (channels > state.length) {
      const grown = new Float64Array(channels);
      grown.set(state);
      state = grown;
    }

    for (let c = 0; c < channels && c < outputs.length; c++) {
      const input = inputs[c];
      const output = outputs[c];
      let out = state[c];

      if (linear) {
        for (let i = 0; i < input.length; i++) {
          const difference = input[i] - out;
          // The clamp is the whole law, and it is what makes `Linear` *arrive*:
          // once the remaining distance is smaller than one step, the step is
          // the remaining distance, so the output lands exactly on the input.
          // A gate slewed this way still reaches 0 and still closes.
          out +=
            difference > riseStep
              ? riseStep
              : difference < -fallStep
                ? -fallStep
                : difference;
          output[i] = out;
        }
      } else {
        for (let i = 0; i < input.length; i++) {
          const difference = input[i] - out;
          const c1 = difference > 0 ? riseCoefficient : fallCoefficient;
          out += difference * (1 - c1);
          output[i] = out;
        }
      }

      state[c] = out;
    }
  };

  function _update(rise: number, fall: number) {
    if ($rise !== rise) {
      $rise = rise;
      riseCoefficient = smoothCoefficient(rise, sampleRate);
      // Seconds *per unit*: a rate limiter has no notion of a step, so a
      // 2-unit move takes twice as long as a 1-unit one, by definition.
      // Zero is a bypass - the step is infinite and the clamp is the identity.
      riseStep = rise <= 0 ? Infinity : 1 / (rise * sampleRate);
    }
    if ($fall !== fall) {
      $fall = fall;
      fallCoefficient = smoothCoefficient(fall, sampleRate);
      fallStep = fall <= 0 ? Infinity : 1 / (fall * sampleRate);
    }
  }
}
