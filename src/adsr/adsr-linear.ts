import { EPSILON, clamp, max } from "../shared/math";
import { Trigger } from "../shared/trigger";

// An linear ADSR envelope generator
export function AdsrLinear(sampleRate: number) {
  // state machine
  let $gate = false;
  let $isAttack = false;
  let $isRunning = false;
  const detect = new Trigger();

  // parameters
  let $attackStep = 0;
  let $decayStep = 0;
  let $sustain = 0;
  let $releaseStep = 0;

  // output
  let $env = 0;

  function setParams(
    gate: number,
    attack: number,
    decay: number,
    sustain: number,
    release: number
  ) {
    $gate = gate >= 1;
    if (detect.process(gate)) {
      $isAttack = true;
      $isRunning = true;
    }
    $sustain = sustain;
    $attackStep = clamp(1 / (EPSILON + sampleRate * attack), EPSILON, 0.5);
    $decayStep = max(-0.5, ($sustain - 1) / (EPSILON + sampleRate * decay));
    $releaseStep = max(
      -1.0,
      -($sustain + EPSILON) / (EPSILON + sampleRate * release)
    );
  }

  function process() {
    if (!$isRunning) return 0;

    if ($gate) {
      if ($isAttack) {
        $env += $attackStep;
        if ($env >= 1) {
          $env = 1;
          $isAttack = false;
        }
      } else {
        if ($env < $sustain + 0.001) {
          $env = $sustain;
        } else {
          $env += $decayStep;
        }
      }
    } else {
      $env += $releaseStep;
      if ($env <= $releaseStep) {
        $isRunning = false;
      }
    }

    return $env;
  }

  return { setParams, process };
}
