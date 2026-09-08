"use client";

import { useState } from "react";
import {
  Arp,
  ArpScale,
  Clock,
  DattorroReverb,
  Compound,
  Euclid,
  EuclidRhythm,
  MonoSynth,
  NoiseType,
} from "synthlet";
import { ExamplePane } from "./components/ExamplePane";
import { Slider } from "./components/Slider";
import { useSynth } from "./useSynth";

function ArpSynth(context: AudioContext) {
  const clock = Clock(context, { bpm: 120 });

  // The bossa-nova, from the table: at the default `rotation: 0` these same
  // 16 steps and 5 beats play a rotation of the necklace that is not the
  // bossa-nova, which is what this used to do. The `Beats` slider below then
  // moves `beats` away from 5, so you hear the family around the named rhythm.
  const euclid = Euclid(context, { clock, ...EuclidRhythm.BossaNova });
  const arp = Arp(context, {
    trigger: euclid,
    scale: ArpScale.Major,
    octaves: 2,
  });

  const synth1 = MonoSynth(context, {
    gate: euclid,
    frequency: arp,
  });

  const reverb = DattorroReverb(context, {
    decay: 0.9,
  });
  synth1.connect(reverb);

  return Compound({
    output: reverb,
    owns: [synth1, arp, euclid, clock],
    exposes: {
      synth1,
      arp,
      clock,
      euclid,
    },
  });
}

function Example() {
  const [currentNoise, setCurrentNoise] = useState<NoiseType>(NoiseType.White);
  const synth = useSynth(ArpSynth);
  if (!synth) return null;

  return (
    <div className="grid grid-col-4 gap-2">
      <Slider
        label="Tempo"
        inputClassName="col-span-2"
        min={60}
        max={180}
        units="bpm"
        param={synth.clock.bpm}
      />
      <Slider
        label="Beats"
        inputClassName="col-span-2"
        min={1}
        max={16}
        step={1}
        param={synth.euclid.beats}
      />
    </div>
  );
}

export default () => (
  <ExamplePane label="Arpeggiator">
    <Example />
  </ExamplePane>
);
