"use client";

import { getSynthlet } from "synthlet";
import { ExamplePane, TriggerButton } from "./components/ExamplePane";
import { Slider } from "./components/Slider";
import { useSynth } from "./useSynth";

const VcaSynth = (context: AudioContext) => {
  const s = getSynthlet(context);
  const trigger = s.param();
  const attack = s.param(0.01);
  const release = s.param(0.3);

  return s.withParams(
    s.conn.serial(s.osc.sin(440), s.amp.perc(trigger, attack, release)),
    {
      trigger,
      attack,
      release,
    }
  );
};

function WavetableExample() {
  const synth = useSynth(VcaSynth);
  if (!synth) return null;

  return (
    <>
      <div className="grid grid-cols-4 gap-2">
        <Slider
          label="Attack"
          inputClassName="col-span-2"
          param={synth.attack}
        />
        <Slider
          label="Release"
          inputClassName="col-span-2"
          max={5}
          param={synth.release}
        />
      </div>
      <div className="mt-4">
        <TriggerButton trigger={synth.trigger} />
      </div>
    </>
  );
}

export default () => (
  <ExamplePane label="AD">
    <WavetableExample />
  </ExamplePane>
);
