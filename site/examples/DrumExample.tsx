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
import { CreateSynth, Synth, useSynth } from "./useSynth";

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

function getSynth(instrumentName: string) {
  const instrument = INSTRUMENTS[instrumentName];
  if (instrument) return instrument;
  else throw Error(`Unknown instrument: ${instrumentName}`);
}

class PolyDrumSynth {
  context: AudioContext;
  synths: Map<string, DrumSynth>;
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

  getSynth(name: string): DrumSynth {
    if (!this.synths.has(name)) {
      console.log("CREATE SYNTH", name);
      const synth = INSTRUMENTS[name];
      if (!synth) throw Error(`Unknown instrument: ${name}`);
      const node = synth(this.context);
      node.connect(this.output);
      this.synths.set(name, node);
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
  if (!synth) return null;
  return (
    <>
      <div className="flex flex-wrap gap-2">
        {synth.getNames().map((name) => (
          <button
            key={name}
            className="border px-2 py-1 rounded bg-fd-secondary"
            onMouseDown={() => {
              synth.getSynth(name).trigger.value = 1;
            }}
            onMouseUp={() => {
              synth.getSynth(name).trigger.value = 0;
            }}
          >
            {name.slice(0, -4)}
          </button>
        ))}
      </div>
    </>
  );
}

function DrumExampleUI<T extends DrumSynth>({
  instrumentName,
  onClose,
  createSynth,
}: {
  instrumentName: string;
  onClose: () => void;
  createSynth: CreateSynth<DrumSynth>;
}) {
  const [selectedNoiseType, setSelectedNoiseType] = useState(0);
  const [volume, setVolume] = useState(-60);
  const synth = useSynth(createSynth);
  if (!synth) return null;

  return (
    <div className="bg-fd-card text-fd-foreground p-2 border rounded">
      <div className="text-xl mb-4">{instrumentName} example</div>

      <div className="flex items-center gap-2">
        <Slider
          label="Tone"
          labelClassName="w-20 text-right mr-2"
          onChange={(value) => {
            synth.tone.value = value;
          }}
        />
      </div>
      <div className="flex gap-2">
        <Slider
          label="Decay"
          labelClassName="w-20 text-right mr-2"
          initial={0.4}
          param={synth.decay}
          units="s"
        />
      </div>
      <div className="flex items-center gap-2 my-4">
        <button
          className="border px-2 py-1 rounded bg-fd-primary text-fd-primary-foreground"
          onMouseDown={() => {
            synth.trigger.value = 1;
          }}
          onMouseUp={() => {
            synth.trigger.value = 0;
          }}
        >
          Trigger
        </button>
      </div>

      <button
        className="border px-2 py-1 rounded bg-fd-secondary"
        onClick={onClose}
      >
        Close
      </button>
    </div>
  );
}

export default () => (
  <ExamplePane label="Drums">
    <Example />
  </ExamplePane>
);
