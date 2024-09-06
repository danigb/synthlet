import { Adsr } from "@synthlet/adsr";
import { Lfo, LfoType } from "@synthlet/lfo";
import { Noise } from "@synthlet/noise";
import { Param } from "@synthlet/param";
import { PolyblepOscillator } from "@synthlet/polyblep-oscillator/src";
import { StateVariableFilter } from "@synthlet/state-variable-filter";
import { Connector, ParamInput } from "./_worklet";
import { Conn } from "./connectors";
import { Operators, WithParams } from "./operators";

const MonoSynth = (context: AudioContext) => {
  const gate = Param();
  const osc = PolyblepOscillator();
  const lfoOsc = Lfo({ type: LfoType.Sine });
  const filterEnv = Adsr();
  const filter = StateVariableFilter();
};

export type DrumInputs = {
  volume?: ParamInput;
  trigger?: ParamInput;
  decay?: ParamInput;
  tone?: ParamInput;
};

export type DrumNode = AudioNode & {
  trigger: AudioParam;
  volume: AudioParam;
  tone: AudioParam;
  decay: AudioParam;
  dispose(): void;
};
export type KickDrumNode = DrumNode & {};

export const KickDrum = (inputs: DrumInputs = {}): Connector<DrumNode> =>
  WithParams(
    (p) => ({
      trigger: p.in(inputs.trigger),
      decay: p.in(inputs.decay ?? 0.8),
      volume: p.in(inputs.volume ?? 0),
      tone: p.lin(20, 100, inputs.tone ?? 0.2),
    }),
    (p, op) =>
      op.Conn.serial(
        op.Conn.mix(
          op.Osc.sin(
            op.Env.ad(p.trigger, 0.1, p.decay, { offset: p.tone, gain: 50 })
          ),
          op.Impulse.trigger(p.trigger)
        ),
        op.Amp.perc(p.trigger, 0.01, p.decay),
        op.ClipAmp.soft(5, 0.6)
      )
  );

export const SnareDrum = (inputs: DrumInputs = {}): Connector<DrumNode> => {
  const { Param, Conn, Osc, Amp, AssignParams } = Operators;
  const trigger = Param.in(inputs.trigger);
  const decay = Param.in(inputs.decay ?? 0.8);
  const volume = Param.db(inputs.volume ?? 0);
  const tone = Param.lin(20, 100, inputs.tone ?? 0.2);

  const snap = Conn.mixInto(
    [Osc.sin(100), Osc.sin(200)],
    Amp.perc(trigger, 0.01, decay)
  );

  const splash = Conn.serial(Noise.white(), Amp.perc(trigger, 0.01, decay));
  const synth = Conn.mixInto([snap, splash], Amp());
  return AssignParams(synth, { trigger, volume, tone, decay });
};

export const ClaveDrum = (inputs: DrumInputs = {}): Connector<DrumNode> => {
  const { Param, Osc, Amp, AssignParams, Bqf } = Operators;
  const trigger = Param.in(inputs.trigger);
  const decay = Param.in(inputs.decay ?? 0.8);
  const volume = Param.db(inputs.volume ?? 0);
  const tone = Param.lin(1200, 1800, inputs.tone ?? 0.1);

  const synth = Conn.serial(
    Osc.tri(tone),
    Amp.perc(trigger, 0.01, decay),
    Bqf.lp(tone),
    Amp.vol(volume)
  );
  return AssignParams(synth, { trigger, volume, tone, decay });
};
