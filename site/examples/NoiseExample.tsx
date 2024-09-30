"use client";

import { useState } from "react";
import { ConnSerial, Gain, Noise, NoiseType, Param } from "synthlet";
import { ExamplePane } from "./components/ExamplePane";
import { Slider } from "./components/Slider";
import { useSynth } from "./useSynth";

function createSynth(ac: AudioContext) {
  const volume = Param.db(ac, -24);
  const noise = Noise(ac, { type: NoiseType.White });
  const amp = Gain.val(ac, volume);
  return Object.assign(ConnSerial([noise, amp]), {
    noise,
    volume: volume.input,
  });
}

function Example() {
  const [currentNoise, setCurrentNoise] = useState<NoiseType>(NoiseType.White);
  const synth = useSynth(createSynth);
  if (!synth) return null;

  return (
    <div className="grid grid-cols-4 gap-4">
      <div>Noise type:</div>
      <select
        value={currentNoise}
        onChange={(e) => {
          const type = parseInt(e.target.value);
          setCurrentNoise(type);
          synth.noise.type.value = type;
        }}
      >
        <option value={NoiseType.White}>White</option>
        <option value={NoiseType.Pink}>Pink</option>
      </select>
      <div className="col-span-2"></div>
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
