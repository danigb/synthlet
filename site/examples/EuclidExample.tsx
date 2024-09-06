"use client";

import { ClaveDrum, getSynthlet, KickDrum } from "synthlet";
import { ExamplePane } from "./components/ExamplePane";
import { Slider } from "./components/Slider";
import { useSynth } from "./useSynth";

const RhythmBox = (context: AudioContext) => {
  const s = getSynthlet(context).use({
    clave: ClaveDrum,
    kick: KickDrum,
  });
  const bpm = s.param(100);
  const clock = s.clock({ bpm });
  const volume = s.param.db(-12);
  const clave = s.clave({
    trigger: s.euclid({
      clock,
      steps: 16,
      beats: 7,
      subdivison: 4,
      rotation: 3,
    }),
    volume,
  });
  const kick = s.kick({
    trigger: s.euclid({
      clock,
      steps: 16,
      beats: 5,
      subdivison: 4,
    }),
    volume,
  });

  return s.synth({
    out: s.conn([clave, kick], s.gain()),
    inputs: { bpm, volume },
  });

  // const synth = s.conn([clave, kick], s.gain());
  // return AssignParams(synth, { bpm, volume });
};

function Example() {
  const synth = useSynth(RhythmBox);
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
