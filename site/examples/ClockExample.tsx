"use client";

import { ClaveDrum, createClockNode, createParamNode } from "synthlet";
import { ExamplePane } from "./components/ExamplePane";
import { Slider } from "./components/Slider";
import { useSynth } from "./useSynth";

function ExampleSynth(context: AudioContext) {
  const bpm = createParamNode(context, { input: 60 });
  const clock = createClockNode(context, { bpm });
  const clave = ClaveDrum(context, { trigger: clock });
  return Object.assign(clave, { bpm: bpm.input });
}

function Example() {
  const synth = useSynth(ExampleSynth);
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
  <ExamplePane label="Clock">
    <Example />
  </ExamplePane>
);
