"use client";

import { MonoSynth } from "synthlet";
import { AdsrControls } from "./components/AdsrControls";
import { ExamplePane, GateButton, ModulePane } from "./components/ExamplePane";
import { Slider } from "./components/Slider";
import { useSynth } from "./useSynth";

function Example() {
  const synth = useSynth((ac) => MonoSynth(ac));

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
          param={synth.vibrato.gain}
        />
        <Slider
          label="Vibrato freq"
          inputClassName="col-span-2"
          min={0}
          max={100}
          param={synth.vibrato.frequency}
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
