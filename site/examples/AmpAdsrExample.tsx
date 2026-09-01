"use client";

import { AdsrAmp, Compound, Oscillator, Param } from "synthlet";
import { ExamplePane, GateButton } from "./components/ExamplePane";
import { useSynth } from "./useSynth";

const VcaSynth = (ac: AudioContext) => {
  const gate = Param(ac);

  const osc = Oscillator(ac, { type: "sine", frequency: 440 });
  const amp = AdsrAmp(ac, { gate });

  osc.connect(amp);

  return Compound({
    output: amp,
    owns: [osc, gate],
    exposes: { gate: gate.input },
  });
};

function WavetableExample() {
  const synth = useSynth(VcaSynth);
  if (!synth) return null;

  return (
    <div className="flex ">
      <GateButton gate={synth.gate} />
    </div>
  );
}

export default () => (
  <ExamplePane label="ADSR">
    <WavetableExample />
  </ExamplePane>
);
