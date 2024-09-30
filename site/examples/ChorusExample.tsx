"use client";

import { AdsrAmp, Chorus, Oscillator, Param } from "synthlet";
import { ExamplePane, GateButton } from "./components/ExamplePane";
import { Slider } from "./components/Slider";
import { useSynth } from "./useSynth";

function ChorusSynth(context: AudioContext) {
  const gate = Param(context, { input: 0.1 });
  const osc = Oscillator(context, { frequency: 440 });
  const amp = AdsrAmp(context, { gate });
  const chorus = Chorus(context, {});

  osc.connect(amp).connect(chorus);

  return Object.assign(chorus, { osc, amp, gate, chorus });
}

function Example() {
  const synth = useSynth(ChorusSynth);
  if (!synth) return null;

  return (
    <>
      <div className="grid grid-cols-4 gap-2">
        <Slider
          label="Delay"
          inputClassName="col-span-2"
          param={synth.chorus.delay}
        />
        <Slider
          label="Rate"
          inputClassName="col-span-2"
          param={synth.chorus.rate}
        />
        <Slider
          label="Depth"
          inputClassName="col-span-2"
          param={synth.chorus.depth}
        />
        <Slider
          label="Deviation"
          inputClassName="col-span-2"
          param={synth.chorus.deviation}
        />
      </div>
      <GateButton gate={synth.gate.input} />
    </>
  );
}

export default () => (
  <ExamplePane label="Chorus">
    <Example />
  </ExamplePane>
);
