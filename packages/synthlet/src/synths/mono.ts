import { AdsrAmp, AdsrEnv, AdsrInputs } from "@synthlet/adsr";
import { Lfo, LfoInputs, LfoType } from "@synthlet/lfo";
import { Param } from "@synthlet/param";
import {
  PolyblepOscillator,
  PolyblepOscillatorInputs,
} from "@synthlet/polyblep-oscillator";
import { Svf, SvfInputs } from "@synthlet/state-variable-filter";
import { Compound, ParamInput } from "../_worklet";
import { Gain } from "../waa";

export type MonoSynthInputs = {
  gate?: ParamInput;
  frequency?: ParamInput;
  volume?: ParamInput;
  vibrato?: LfoInputs;
  osc?: PolyblepOscillatorInputs;
  filter?: SvfInputs;
  filterEnv?: AdsrInputs;
  amp?: AdsrInputs;
};

export function MonoSynth(
  context: BaseAudioContext,
  inputs: MonoSynthInputs = {},
) {
  // Params: the inlets. Each is a Param node because it has to be scaled
  // (volume, in decibels) or fanned out (gate, to two envelopes).
  const gate = Param(context, { input: inputs.gate });
  const volume = Param.db(context, inputs.volume ?? 0);

  // Modules
  const osc = PolyblepOscillator(context, {
    frequency: inputs.frequency,
    ...inputs.osc,
  });
  // Delayed vibrato, the way every wind player and every synth patch since
  // 1970 does it: the note's own gate restarts the LFO's depth ramp, so the
  // vibrato arrives a moment after the note rather than on it.
  //
  // This used to be `gain: 0` and a note in the docs telling the caller to
  // automate it up. An instrument whose vibrato only works if the caller
  // remembers to write an automation curve does not have vibrato.
  const vibrato = Lfo(context, {
    type: LfoType.Sine,
    gain: 5,
    frequency: 5,
    attack: 0.6,
    gate,
    ...inputs.vibrato,
  });
  // The filter envelope's floor and its travel: 2000 Hz, plus 3000 Hz at the
  // peak. They were unreachable constants and are now *defaults* - the spread
  // comes last, so `MonoSynth(ctx)` still builds exactly this envelope, and a
  // caller (`monoVoice` is one) can reach the whole ADSR through `filterEnv`.
  const filterEnv = AdsrEnv(context, {
    gate,
    gain: 3000,
    offset: 2000,
    ...inputs.filterEnv,
  });
  const filter = Svf(context, { frequency: filterEnv, ...inputs.filter });
  const amp = AdsrAmp(context, { gate, ...inputs.amp });
  const out = Gain(context, { gain: volume });

  vibrato.connect(osc.frequency);
  osc.connect(filter).connect(amp).connect(out);

  return Compound({
    output: out,
    owns: [gate, volume, osc, vibrato, filterEnv, filter, amp],
    exposes: {
      // Params are flat AudioParams: the performance surface.
      gate: gate.input,
      volume: volume.input,
      // The note. `inputs.frequency` is connected to `osc.frequency` above, so
      // this is the same `AudioParam` seen from outside - writable as long as
      // nothing is connected to it, which is the case whenever the compound is
      // built as a voice rather than patched into a generative graph.
      frequency: osc.frequency,
      // MonoSynth is a kit, so it exposes the modules it's made of.
      osc,
      vibrato,
      filterEnv,
      filter,
      amp,
    },
  });
}
