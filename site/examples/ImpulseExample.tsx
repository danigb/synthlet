"use client";

import { disposable, Impulse, Param } from "synthlet";
import { ExamplePane, TriggerButton } from "./components/ExamplePane";
import { useSynth } from "./useSynth";

const ImpulseSynth = (ac: AudioContext) => {
  const trigger = Param(ac);
  const impulse = Impulse(ac, { trigger });

  return Object.assign(disposable(impulse, [trigger]), {
    trigger: trigger.input,
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
