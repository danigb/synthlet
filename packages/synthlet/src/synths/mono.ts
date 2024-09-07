import { LfoType } from "@synthlet/lfo";
import { ParamInput } from "../_worklet";
import { getSynthlet } from "../synthlet";

export type MonoSynthInputs = {
  gate?: ParamInput;
  frequency?: ParamInput;
  volume?: ParamInput;
};

export function MonoSynth(context: AudioContext, inputs: MonoSynthInputs = {}) {
  const s = getSynthlet(context);
  // Params
  const gate = s.param(inputs.gate);
  const frequency = s.param(inputs.frequency ?? 440);
  const vibrato = s.lfo({
    type: LfoType.Sine,
    offset: frequency,
    gain: 5,
    frequency: 10,
  });
  const volume = s.param.db(inputs.volume ?? 0);
  // Modules
  const osc = s.polyblep({ frequency: vibrato });
  const filterEnv = s.env.adsr(gate, { gain: 3000, offset: 2000 });
  const filter = s.svf({ frequency: filterEnv });
  const amp = s.amp.adsr(gate);

  return s.synth({
    out: s.conn.serial(osc, filter, amp, s.amp(volume)),
    params: { gate, frequency, volume },
    modules: { osc, vibrato, filterEnv, filter, amp },
  });
}
