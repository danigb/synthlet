"use client";

import { Slider } from "@/examples/components/Slider";
import { useState } from "react";
import {
  ClaveDrum,
  CongaDrum,
  CowBellDrum,
  CymbalDrum,
  HandclapDrum,
  HiHatDrum,
  KickDrum,
  MaracasDrum,
  SnareDrum,
  TomDrum,
} from "synthlet";
import { ExamplePane } from "./components/ExamplePane";
import { Synth, useSynth } from "./useSynth";

type DrumSynth = Synth & {
  trigger: AudioParam;
  volume: AudioParam;
  tone: AudioParam;
  decay: AudioParam;
  dispose(): void;
};

const INSTRUMENTS: Record<string, typeof KickDrum> = {
  KickDrum,
  SnareDrum,
  ClaveDrum,
  HiHatDrum,
  CowBellDrum,
  CymbalDrum,
  MaracasDrum,
  HandclapDrum,
  TomDrum,
  CongaDrum,
} as const;

type Named<T> = T & { name: string };

class PolyDrumSynth {
  context: AudioContext;
  synths: Map<string, Named<DrumSynth>>;
  output: GainNode;
  connect: typeof GainNode.prototype.connect;

  constructor(context: AudioContext) {
    this.context = context;
    this.output = context.createGain();
    this.synths = new Map();
    this.connect = this.output.connect.bind(this.output);
  }

  getNames() {
    return Object.keys(INSTRUMENTS);
  }

  getSynth(name: string): Named<DrumSynth> {
    if (!this.synths.has(name)) {
      console.log("CREATE SYNTH", name);
      const synth = INSTRUMENTS[name];
      if (!synth) throw Error(`Unknown instrument: ${name}`);
      const node = synth(this.context);
      node.connect(this.output);
      this.synths.set(name, Object.assign(node, { name }));
    }
    return this.synths.get(name)!;
  }

  dispose() {
    for (const synth of this.synths.values()) {
      synth.dispose();
    }
  }
}

export function Example({}: {}) {
  const synth = useSynth((context) => new PolyDrumSynth(context));
  const [drum, setDrum] = useState<Named<DrumSynth> | null>(null);

  if (!synth) return null;
  return (
    <>
      {drum && (
        <div className="grid grid-cols-4 gap-2 mb-4">
          <div className="col-span-4 font-bold border-b">
            {drum.name.slice(0, -4)}
          </div>
          <Slider
            label="Tone"
            inputClassName="col-span-2"
            min={0}
            max={1}
            step={0.01}
            param={drum.tone}
          />

          <Slider
            label="Decay"
            inputClassName="col-span-2"
            min={0}
            max={1}
            step={0.01}
            param={drum.decay}
          />
          <Slider
            label="Volume"
            inputClassName="col-span-2"
            min={-60}
            max={0}
            step={1}
            units="dB"
            param={drum.volume}
          />
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        {synth.getNames().map((name) => (
          <button
            key={name}
            className="border px-2 py-1 rounded bg-fd-secondary"
            onMouseDown={() => {
              const drum = synth.getSynth(name);
              drum.trigger.value = 1;
              setDrum(drum);
            }}
            onMouseUp={() => {
              const drum = synth.getSynth(name);
              drum.trigger.value = 0;
              setDrum(drum);
            }}
          >
            {name.slice(0, -4)}
          </button>
        ))}
      </div>
    </>
  );
}

export default () => (
  <ExamplePane label="Drums">
    <Example />
  </ExamplePane>
);
