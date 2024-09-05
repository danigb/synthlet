"use client";

import { synthlet } from "synthlet";
import { ExamplePane, TriggerButton } from "./components/ExamplePane";
import { useSynth } from "./useSynth";

const createSynth = synthlet((op) => {
  const trigger = op.param();
  const freq = op.param(440);
  const table = op.table("ACCESS_V");
  const osc = op.wt(table, freq);
  const synth = op.synth(op.serial(osc, op.vca(trigger)), {
    trigger,
    freq,
  });
  return Object.assign(synth, { osc });
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
  <ExamplePane label="Wavetable">
    <WavetableExample />
  </ExamplePane>
);
