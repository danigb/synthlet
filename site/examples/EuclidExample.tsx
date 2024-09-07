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

  return s.withParams(s.conn([clave, kick], s.gain()), { bpm, volume });
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
          param={synth.bpm}
          units="bpm"
        />
      </div>
      <div className="flex px-1 pt-2 mt-2 border-t border-fd-border gap-4">
        <Slider
          label="Volume"
          inputClassName="flex-grow"
          min={-36}
          max={0}
          param={synth.volume}
          units="dB"
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
