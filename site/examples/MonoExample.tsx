"use client";

import { getSynthlet, LfoType } from "synthlet";
import { AdsrControls } from "./components/AdsrControls";
import { ExamplePane, GateButton } from "./components/ExamplePane";
import { useSynth } from "./useSynth";

function FlyMonoSynth(context: AudioContext) {
  const s = getSynthlet(context);
  // Params
  const gate = s.param();
  const frequency = s.param(400);
  const vibrato = s.param(1);
  const lfo = s.lfo({
    type: LfoType.Sine,
    offset: frequency,
    gain: vibrato,
    frequency: 1,
  });
  // Modules
  const osc = s.polyblep({ frequency: lfo });
  const filterEnv = s.env.adsr(gate, { gain: 3000, offset: 2000 });
  const filter = s.svf({ frequency: filterEnv });
  const amp = s.amp.adsr(gate);

  return s.synth({
    out: s.conn.serial(osc, filter, amp),
    inputs: { gate, frequency, vibrato },
    modules: { osc, filterEnv, filter, amp },
  });
}

function Example() {
  const synth = useSynth(FlyMonoSynth);

  if (!synth) return null;

  return (
    <div>
      <div>Filter</div>
      <AdsrControls adsr={synth.filterEnv} />
      <div>Amplifier</div>
      <AdsrControls adsr={synth.amp} />
      <div className="flex mt-2">
        <GateButton gate={synth.gate} />
      </div>
    </div>
  );
}

export default () => (
  <ExamplePane label="Fly Mono Synth">
    <Example />
  </ExamplePane>
);
