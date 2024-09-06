"use client";

import {
  assignParams,
  ClaveDrum,
  Clock,
  Euclid,
  KickDrum,
  Param,
  ParamInput,
} from "synthlet";
import { ExamplePane } from "./components/ExamplePane";
import { Slider } from "./components/Slider";
import { useSynth } from "./useSynth";

const RhythmBox = (params: { clock?: ParamInput } = {}) => {
  const bpm = Param(60);
  const clock = Clock({ bpm });
  const volume = Param.db(-12);
  const clave = ClaveDrum({
    trigger: Euclid({
      clock,
      steps: 16,
      beats: 7,
      subdivison: 4,
      rotation: 3,
    }),
    volume,
  });
  const kick = KickDrum({
    trigger: Euclid({
      clock,
      steps: 16,
      beats: 5,
      subdivison: 4,
    }),
    volume,
  });
  return (context: AudioContext) => {
    console.log("context", context);
    const out = context.createGain();
    clave(context).connect(out);
    kick(context).connect(out);
    const synth = Object.assign(out, {
      dispose() {
        // TODO
      },
    });
    return assignParams(context, synth, { bpm, volume });
  };
};

function Example() {
  const synth = useSynth(RhythmBox());
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
