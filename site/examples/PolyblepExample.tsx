"use client";

import { PolyblepWaveformType, synthlet } from "synthlet";
import { ExamplePane, TriggerButton } from "./components/ExamplePane";
import { useSynth } from "./useSynth";

const createSynth = synthlet((op) => {
  const trigger = op.param();
  const type = op.param(PolyblepWaveformType.SAWTOOTH);
  const freq = op.param(440);
  return op.synth(op.serial(op.oscp(type, freq), op.vca(trigger)), {
    trigger,
    freq,
  });
});

function WavetableExample() {
  const synth = useSynth(createSynth);
  if (!synth) return null;

  return (
    <div className="flex ">
      <TriggerButton trigger={synth.trigger} />
    </div>
  );
}

export default () => (
  <ExamplePane label="Polyblep oscillator">
    <WavetableExample />
  </ExamplePane>
);
