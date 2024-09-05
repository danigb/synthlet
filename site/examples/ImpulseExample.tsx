"use client";

import { synthlet } from "synthlet";
import { ExamplePane, TriggerButton } from "./components/ExamplePane";
import { useSynth } from "./useSynth";

export function ImpulseExample() {
  const synth = useSynth(
    synthlet((op) => {
      const trigger = op.param();
      return op.synth(op.impulse(trigger), { trigger });
    })
  );

  if (!synth) return null;

  return (
    <ExamplePane label="Impulse">
      <div className="flex ">
        <TriggerButton trigger={synth.trigger} />
      </div>
    </ExamplePane>
  );
}
