import { AdsrInputs } from "@synthlet/adsr";
import { PolyblepOscillatorInputs } from "@synthlet/polyblep-oscillator";
import { StateVariableFilterInputs } from "@synthlet/state-variable-filter";
import { ParamInput } from "../_worklet";
import { getSynthlet } from "../synthlet";

export type MonoSynthInputs = {
  gate?: ParamInput;
  frequency?: ParamInput;
  volume?: ParamInput;
  osc?: PolyblepOscillatorInputs;
  filter?: StateVariableFilterInputs;
  amp?: AdsrInputs;
};

export function MonoSynth(context: AudioContext, inputs: MonoSynthInputs = {}) {
  const s = getSynthlet(context);
  // Params
  const gate = s.param(inputs.gate);
  const volume = s.param.db(inputs.volume ?? 0);

  // Modules
  const osc = s.polyblep({ frequency: inputs.frequency, ...inputs.osc });
  const filterEnv = s.env.adsr(gate, { gain: 3000, offset: 2000 });
  const filter = s.svf({ frequency: filterEnv });
  const amp = s.amp.adsr(gate, { ...inputs.amp });

  return s.synth({
    out: s.conn.serial(osc, filter, amp, s.amp(volume)),
    params: { gate, volume },
    modules: { osc, filterEnv, filter, amp },
  });
}
