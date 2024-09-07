"use client";

import { getSynthlet } from "synthlet";
import { ExamplePane, TriggerButton } from "./components/ExamplePane";
import { useSynth } from "./useSynth";

const ImpulseSynth = (context: AudioContext) => {
  const s = getSynthlet(context);
  const trigger = s.param();
  return s.synth({
    out: s.impulse.trigger(trigger),
    inputs: { trigger },
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
