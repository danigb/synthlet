function createGateDetector() {
  let current = false;
  return (gate: number): boolean | undefined => {
    if (current === false && gate >= 0.9) {
      current = true;
      return true;
    }
    if (current === true && gate < 0.1) {
      current = false;
      return false;
    }
    return undefined;
  };
}

enum Stage {
  Zero,
  Attack,
  Decay,
  Sustain,
  Release,
}

export type AdsrParamInputs = {
  gate: number[];
  attack: number[];
  decay: number[];
  sustain: number[];
  release: number[];
  offset: number[];
  gain: number[];
};

/**
 * An Adsr Generator
 *
 * Based on Nigel Redmon's ADSR code and Will Pirkle's SynthLab Adsr Generator
 *
 * @see https://www.earlevel.com/main/2013/06/01/EG-generators/
 * @see https://github.com/willpirkleaudio/SynthLab/blob/main/source/analogegcore.h
 */
export function createAdsr(sampleRate: number) {
  // TCO values taken from Will Pirkle's SynthLab
  const FADE_IN_TCO = Math.exp(-1.5);
  const FADE_OUT_TCO = Math.exp(-4.95);

  // Params
  let $attack = 0;
  let $decay = 0;
  let $release = 0;
  let $sustain = 0;

  // One pole filters (with b and coefficient)
  const attack = { b: 0, c: 0 };
  const decay = { b: 0, c: 0 };
  const release = { b: 0, c: 0 };

  // Internal state
  const detectGate = createGateDetector();
  let stage: Stage = Stage.Zero;
  let current = 0;

  _updateAdsr(0.01, 0.1, 0.5, 0.3);

  return function adsr(
    input: Float32Array,
    output: Float32Array,
    modifier: boolean,
    params: AdsrParamInputs
  ) {
    _readParams(params);
    const offset = params.offset[0];
    const gain = params.gain[0];

    for (let i = 0; i < output.length; i++) {
      switch (stage) {
        case Stage.Attack:
          current = attack.b + current * attack.c;
          if (current >= 1.0 || $attack <= 0) {
            current = 1.0;
            stage = Stage.Decay;
          }
          break;
        case Stage.Decay:
          current = decay.b + current * decay.c;
          if (current <= $sustain || $decay <= 0) {
            current = $sustain;
            stage = Stage.Sustain;
          }
          break;
        case Stage.Sustain:
          current = $sustain;
          break;
        case Stage.Release:
          current = release.b + current * release.c;
          if (current <= 0.0 || $release <= 0) {
            current = 0.0;
            stage = Stage.Zero;
          }
      }
      const value = modifier ? input[i] * current : current;
      output[i] = value * gain + offset;
    }
  };

  function _readParams(params: AdsrParamInputs) {
    _updateAdsr(
      params.attack[0],
      params.decay[0],
      params.sustain[0],
      params.release[0]
    );

    const gate = detectGate(params.gate[0]);
    if (gate === true) {
      stage = Stage.Attack;
    } else if (gate === false) {
      stage = Stage.Release;
    }
  }

  function _updateAdsr(
    _attack: number,
    _decay: number,
    _sustain: number,
    _release: number
  ) {
    if ($sustain !== _sustain || $decay !== _decay) {
      $sustain = _sustain;
      $decay = _decay;
      _updateFilter(decay, $decay, $sustain, FADE_OUT_TCO);
    }
    if ($attack !== _attack) {
      $attack = _attack;
      _updateFilter(attack, $attack, 1 + 2 * FADE_IN_TCO, FADE_IN_TCO);
    }
    if ($release !== _release) {
      $release = _release;
      _updateFilter(release, $release, 0, FADE_OUT_TCO);
    }
  }

  function _updateFilter(
    filter: { b: number; c: number },
    time: number,
    level: number,
    tco: number
  ) {
    const samples = time * sampleRate;
    filter.c = Math.exp(-Math.log((1.0 + tco) / tco) / samples);
    filter.b = (level - tco) * (1.0 - filter.c);
  }
}
