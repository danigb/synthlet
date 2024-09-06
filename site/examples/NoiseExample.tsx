"use client";

import { useState } from "react";
import { getSynthlet, NoiseType } from "synthlet";
import { ExamplePane } from "./components/ExamplePane";
import { Slider } from "./components/Slider";
import { useSynth } from "./useSynth";

function NoiseSynth(context: AudioContext) {
  const s = getSynthlet(context);
  const volume = s.param.db(-100);
  const noiseType = s.param(NoiseType.WHITE);
  return s.withParams(
    s.conn.serial(s.noise({ type: noiseType }), s.amp(volume)),
    { volume, noiseType }
  );
}

function Example() {
  const [currentNoise, setCurrentNoise] = useState<NoiseType>(NoiseType.WHITE);
  const synth = useSynth(NoiseSynth);
  if (!synth) return null;

  return (
    <div className="grid grid-cols-4 gap-4">
      <div>Noise type:</div>
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
      <div className="col-span-2"></div>
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
