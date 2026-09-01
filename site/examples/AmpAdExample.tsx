"use client";

import { AdAmp, disposable, Oscillator, Param } from "synthlet";
import { ExamplePane, TriggerButton } from "./components/ExamplePane";
import { Slider } from "./components/Slider";
import { useSynth } from "./useSynth";

const VcaSynth = (ac: AudioContext) => {
  const trigger = Param(ac);
  const attack = Param(ac, { input: 0.01 });
  const release = Param(ac, { input: 0.3 });

  const osc = Oscillator(ac, { type: "sine", frequency: 440 });
  const amp = AdAmp(ac, { trigger, attack, decay: release });

  osc.connect(amp);

  return Object.assign(disposable(amp, [osc, trigger, attack, release]), {
    trigger: trigger.input,
    attack: attack.input,
    release: release.input,
  });
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
