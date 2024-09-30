"use client";

import { useState } from "react";
import { ConnSerial, Gain, NoiseType, Param } from "synthlet";
import { KarplusStrong } from "../../packages/karplus-strong/src";
import { ExamplePane, TriggerButton } from "./components/ExamplePane";
import { Slider } from "./components/Slider";
import { useSynth } from "./useSynth";

function createSynth(ac: AudioContext) {
  const trigger = Param.input(ac);
  const volume = Param.db(ac, -24);
  const ks = KarplusStrong(ac, { trigger });

  return Object.assign(ConnSerial([ks, Gain.val(ac, volume)]), {
    ks,
    volume: volume.input,
    trigger: trigger.input,
  });
}

function Example() {
  const [currentNoise, setCurrentNoise] = useState<NoiseType>(NoiseType.White);
  const synth = useSynth(createSynth);
  if (!synth) return null;

  return (
    <div className="grid grid-cols-4 gap-4">
      <Slider
        label="Frequency"
        inputClassName="col-span-2"
        min={100}
        max={2000}
        param={synth.ks.frequency}
      />
      <Slider
        label="Decay"
        inputClassName="col-span-2"
        param={synth.ks.decay}
        min={0.01}
        max={1}
      />
      <div className="col-span-4">
        <TriggerButton trigger={synth.trigger} />
      </div>
      <Slider
        label="Volume"
        inputClassName="col-span-2"
        min={-100}
        max={0}
        param={synth.volume}
        units="dB"
      />
    </div>
  );
}

export default () => (
  <ExamplePane label="Noise">
    <Example />
  </ExamplePane>
);
