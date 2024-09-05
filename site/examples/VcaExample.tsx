"use client";

import { synthlet } from "synthlet";
import { ExamplePane, TriggerButton } from "./components/ExamplePane";
import { useSynth } from "./useSynth";

const createSynth = synthlet((op) => {
  const trigger = op.param();
  return op.synth(op.serial(op.white(), op.vca(trigger)), {
    trigger,
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
  <ExamplePane label="VCA">
    <WavetableExample />
  </ExamplePane>
);
