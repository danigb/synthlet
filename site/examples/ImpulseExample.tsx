"use client";

import { Compound, Impulse, Param } from "synthlet";
import { ExamplePane, TriggerButton } from "./components/ExamplePane";
import { useSynth } from "./useSynth";

const ImpulseSynth = (ac: AudioContext) => {
  const trigger = Param(ac);
  const impulse = Impulse(ac, { trigger });

  return Compound({
    output: impulse,
    owns: [trigger],
    exposes: {
      trigger: trigger.input,
    },
  });
};

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
