"use client";

import { PolyblepWaveformType, synthlet } from "synthlet";
import { ExamplePane, GateButton } from "./components/ExamplePane";
import { Slider } from "./components/Slider";
import { useSynth } from "./useSynth";

const createSynth = synthlet((op) => {
  const gate = op.param();
  const type = op.param(PolyblepWaveformType.SAWTOOTH);
  const freq = op.param(200);
  return op.synth(op.conn(op.oscp(type, freq)), {
    gate,
    freq,
  });
});

function WavetableExample() {
  const synth = useSynth(createSynth);
  if (!synth) return null;

  return (
    <div className="grid grid-cols-4 gap-4">
      <Slider
        label="Frequency"
        inputClassName="col-span-2"
        min={20}
        max={3000}
        initial={220}
        units="Hz"
        onChange={(value) => {
          synth.freq.setValueAtTime(value, 0);
        }}
      />

      <div></div>

      <div className="flex col-span-3">
        <GateButton gate={synth.gate} />
      </div>
    </div>
  );
}

export default () => (
  <ExamplePane label="Polyblep oscillator">
    <WavetableExample />
  </ExamplePane>
);
