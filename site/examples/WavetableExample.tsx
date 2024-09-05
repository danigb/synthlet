"use client";

import { synthlet } from "synthlet";
import { ExamplePane } from "./components/ExamplePane";
import { Trigger } from "./components/Trigger";
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
      <Trigger trigger={synth.trigger} />
    </div>
  );
}

export default () => (
  <ExamplePane label="Wavetable">
    <WavetableExample />
  </ExamplePane>
);
