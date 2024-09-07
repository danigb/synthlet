"use client";

import { getSynthlet, LfoType } from "synthlet";
import { AdsrControls } from "./components/AdsrControls";
import { ExamplePane, GateButton, ModulePane } from "./components/ExamplePane";
import { Slider } from "./components/Slider";
import { useSynth } from "./useSynth";

function FlyMonoSynth(context: AudioContext) {
  const s = getSynthlet(context);
  // Params
  const gate = s.param();
  const frequency = s.param(440);
  const oscLfo = s.lfo({
    type: LfoType.Sine,
    offset: frequency,
    gain: 5,
    frequency: 10,
  });
  const volume = s.param.db(-24);
  // Modules
  const osc = s.polyblep({ frequency: oscLfo });
  const filterEnv = s.env.adsr(gate, { gain: 3000, offset: 2000 });
  const filter = s.svf({ frequency: filterEnv });
  const amp = s.amp.adsr(gate);

  return s.synth({
    out: s.conn.serial(osc, filter, amp, s.amp(volume)),
    inputs: { gate, frequency, volume },
    modules: { osc, oscLfo, filterEnv, filter, amp },
  });
}

function Example() {
  const synth = useSynth(FlyMonoSynth);

  if (!synth) return null;

  return (
    <>
      <ModulePane label="Oscillator" paneClassName="grid grid-cols-4 gap-2">
        <Slider
          label="Frequency"
          inputClassName="col-span-2"
          min={20}
          max={3000}
          param={synth.frequency}
        />
        <Slider
          label="Vibrato depth"
          inputClassName="col-span-2"
          max={20}
          param={synth.oscLfo.gain}
        />
        <Slider
          label="Vibrato freq"
          inputClassName="col-span-2"
          min={0}
          max={100}
          param={synth.oscLfo.frequency}
        />
      </ModulePane>
      <ModulePane label="Filter" paneClassName="grid grid-cols-4 gap-2">
        <AdsrControls adsr={synth.filterEnv} />
      </ModulePane>
      <ModulePane label="Amplifier" paneClassName="grid grid-cols-4 gap-2">
        <AdsrControls adsr={synth.amp} />
      </ModulePane>
      <div className="flex mt-2">
        <GateButton gate={synth.gate} />
      </div>

      <div className="grid grid-cols-4 mt-4 pt-2 border-t">
        <Slider
          label="Volume"
          inputClassName="col-span-2"
          min={-48}
          max={0}
          units="dB"
          param={synth.volume}
        />
      </div>
    </>
  );
}

export default () => (
  <ExamplePane label="Mono Synth">
    <Example />
  </ExamplePane>
);
