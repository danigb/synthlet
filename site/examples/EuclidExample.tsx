"use client";

import {
  assignParams,
  ClaveDrum,
  createClockNode,
  createEuclidNode,
  createParamNode,
} from "synthlet";
import { ExamplePane } from "./components/ExamplePane";
import { Slider } from "./components/Slider";
import { useSynth } from "./useSynth";

const createSynth = (context: AudioContext) => {
  const bpm = createParamNode(context, { input: 120 });
  const clock = createClockNode(context, { bpm });
  const euclid = createEuclidNode(context, {
    steps: 16,
    beats: 7,
    subdivison: 4,
    clock,
  });
  const clave = ClaveDrum(context, { trigger: euclid });
  return assignParams(clave, { bpm });
};

function Example() {
  const synth = useSynth(createSynth);
  if (!synth) return null;

  return (
    <>
      <div className="grid grid-cols-4 gap-4">
        <Slider
          label="Tempo"
          inputClassName="col-span-2"
          min={1}
          max={1000}
          initial={100}
          initialize
          units="bpm"
          onChange={(value) => {
            synth.bpm.value = value;
          }}
        />
      </div>
      <div className="flex px-1 pt-2 mt-2 border-t border-fd-border gap-4">
        <Slider
          label="Volume"
          inputClassName="flex-grow"
          min={-36}
          max={0}
          initial={-24}
          initialize
          units="dB"
          onChange={(value) => {
            synth.volume.value = value;
          }}
        />
      </div>
    </>
  );
}

export default () => (
  <ExamplePane label="Euclid">
    <Example />
  </ExamplePane>
);
