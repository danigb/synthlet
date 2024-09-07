"use client";

import { useState } from "react";
import {
  Arp,
  ArpChord,
  ArpType,
  Clock,
  DattorroReverb,
  Euclid,
  MonoSynth,
  NoiseType,
} from "synthlet";
import { ExamplePane } from "./components/ExamplePane";
import { Slider } from "./components/Slider";
import { useSynth } from "./useSynth";

function ArpSynth(context: AudioContext) {
  const clock = Clock(context, { bpm: 120 });

  const euclid = Euclid(context, {
    clock,
    beats: 5,
    steps: 16,
  });
  const arp = Arp(context, {
    trigger: euclid,
    type: ArpType.Random,
    chord: ArpChord.Major,
    octaves: 2,
  });

  const synth1 = MonoSynth(context, {
    gate: euclid,
    frequency: arp,
  });

  const reverb = DattorroReverb(context, {
    decay: 0.9,
    dryWet: 0.5,
  });
  synth1.connect(reverb);

  return Object.assign(reverb, { synth1, arp, clock, euclid });
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
