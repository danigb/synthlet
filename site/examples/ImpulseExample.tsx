"use client";

import { Impulse, WithParams } from "synthlet";
import { ExamplePane, TriggerButton } from "./components/ExamplePane";
import { useSynth } from "./useSynth";

const ImpulseSynth = WithParams(
  (p) => ({ trigger: p() }),
  (p) => Impulse.trigger(p.trigger)
);

export function ImpulseExample() {
  const synth = useSynth(ImpulseSynth);

  if (!synth) return null;

  return (
    <ExamplePane label="Impulse">
      <div className="flex ">
        <TriggerButton trigger={synth.trigger} />
      </div>
    </ExamplePane>
  );
}
