"use client";

import { AdsrAmp, Chorus, Compound, Oscillator, Param } from "synthlet";
import { ExamplePane, GateButton } from "./components/ExamplePane";
import { Slider } from "./components/Slider";
import { useSynth } from "./useSynth";

function ChorusSynth(ac: AudioContext) {
  const gate = Param(ac, { input: 0.1 });
  const osc = Oscillator(ac, { frequency: 440 });
  const amp = AdsrAmp(ac, { gate });
  const chorus = Chorus(ac, {});

  osc.connect(amp).connect(chorus);

  return Compound({
    output: chorus,
    owns: [osc, amp, gate],
    exposes: {
      osc,
      amp,
      chorus,
      gate: gate.input,
    },
  });
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
      <GateButton gate={synth.gate} />
    </>
  );
}

export default () => (
  <ExamplePane label="Chorus">
    <Example />
  </ExamplePane>
);
