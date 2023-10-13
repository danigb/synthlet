import { Phasor } from "../dsp/phasor";
import { GenerateParamsMap, ParamsDef } from "../params-utils";
import { Sequence } from "./events";

export const PARAMS: ParamsDef = {
  bpm: { min: 0, max: 300, init: 100 },
};

export type Sequencer = ReturnType<typeof Sequencer>;
type SequencerParamsMap = GenerateParamsMap<typeof PARAMS>;

export function Sequencer(sampleRate: number) {
  let $bpm = 100;
  let $seq: Sequence = { events: [{ time: 0, value: 1 }], duration: 1 };
  let $phasor = new Phasor(sampleRate, $bpm / 60);
  let $current = 0;
  let $prevTime = 0;

  function setParams(params: SequencerParamsMap) {
    $bpm = params.bpm[0];
    $phasor.freq((params.bpm[0] / 60) * $seq.duration);
  }

  function setSequence(sequence: Sequence) {
    $seq = sequence;
    $current = $current % $seq.duration;
    $phasor.freq($bpm / (60 * $seq.duration));
  }

  function fillControl(control: Float32Array) {
    if (!$seq.duration) return;

    let time = $phasor.tick(control.length) * $seq.duration;
    if (time <= $prevTime) {
      $current = 0;
    }

    if ($current >= $seq.events.length) {
      return;
    }

    if (time > $seq.events[$current].time) {
      control[0] = $seq.events[$current].value;
      $current = $current + 1;
    }
    $prevTime = time;
  }

  return { setParams, setSequence, fillControl };
}
