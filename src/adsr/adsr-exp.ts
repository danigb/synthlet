import { EPSILON, clamp } from "../shared/math";
import { RcFilter } from "../shared/rc-filter";
import { Trigger } from "../shared/trigger";

export function AdsrExp(sampleRate: number) {
  // state machine
  let $gate = false;
  let $isAttack = false;
  let $isRunning = false;
  const detect = new Trigger();

  // parameters
  let $tauA = 0;
  let $tauD = 0;
  let $sustain = 0;
  let $tauR = 0;

  // output
  const rcf = RcFilter(sampleRate);
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
    $tauA = clamp(attack, EPSILON, 10.0);
    $tauD = clamp(decay, EPSILON, 10.0);
    $tauR = clamp(release, EPSILON, 10.0);
  }

  function process() {
    if (!$isRunning) return 0;

    if ($gate) {
      if ($isAttack) {
        rcf.setTau($tauA);
        $env = rcf.process(1.0);
        if ($env >= 1 - 0.001) {
          $isAttack = false;
        }
      } else {
        rcf.setTau($tauD);
        $env = $env < $sustain + 0.001 ? $sustain : rcf.process($sustain);
      }
    } else {
      rcf.setTau($tauR);
      $env = rcf.process(0.0);
      if ($env <= 0.001) {
        $isRunning = false;
      }
    }
    return $env;
  }

  return { setParams, process };
}
