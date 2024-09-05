"use client";

import { useState } from "react";
import { NoiseType, synthlet } from "synthlet";
import { ExamplePane } from "./components/ExamplePane";
import { Slider } from "./components/Slider";
import { useSynth } from "./useSynth";

const createSynth = synthlet((op) => {
  const volume = op.param.db(-100);
  const noiseType = op.param(NoiseType.WHITE);
  return op.synth(op.conn(op.noise(noiseType), op.amp(volume)), {
    volume,
    noiseType,
  });
});

function Example() {
  const [currentNoise, setCurrentNoise] = useState<NoiseType>(NoiseType.WHITE);
  const synth = useSynth(createSynth);
  if (!synth) return null;

  return (
    <div className="grid grid-cols-4 gap-4">
      <p>Noise type:</p>
      <select
        value={currentNoise}
        onChange={(e) => {
          const type = parseInt(e.target.value);
          setCurrentNoise(type);
          synth.noiseType.value = type;
        }}
      >
        <option value={NoiseType.WHITE}>White</option>
        <option value={NoiseType.PINK_TRAMMEL}>Pink</option>
      </select>
      <Slider
        label="Volume"
        inputClassName="col-span-2"
        min={-100}
        max={0}
        initial={-100}
        initialize
        units="dB"
        onChange={(value) => {
          synth.volume.value = value;
        }}
      />
    </div>
  );
}

export default () => (
  <ExamplePane label="Noise">
    <Example />
  </ExamplePane>
);
