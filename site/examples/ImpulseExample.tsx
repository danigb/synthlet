"use client";

import { synthlet } from "synthlet";
import { ExamplePane } from "./components/ExamplePane";
import { Trigger } from "./components/Trigger";
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
        <Trigger trigger={synth.trigger} />
      </div>
    </ExamplePane>
  );
}
