"use client";

import { useState } from "react";
import { createNoiseNode, getNoiseTypes, NoiseWorkletNode } from "synthlet";
import { useSynth } from "./useSynth";

export function NoiseExample() {
  return (
    <ExampleButton label="Start Noise example">
      <NoiseSynthUI />
    </ExampleButton>
  );
}

function NoiseSynthUI() {
  const [selectedNoiseType, setSelectedNoiseType] = useState(0);
  const [volume, setVolume] = useState(-60);
  const synth = useSynth((context) => new NoiseSynth(context));
  if (!synth) return null;

  return (
    <div className="bg-slate-800 text-white p-2 border border-slate-600 rounded">
      <div className="text-xl mb-4">Noise generator example</div>
      <div className="flex items-center gap-2">
        <div className="w-16 text-right">Type:</div>
        <select
          className="p-1 rounded bg-slate-700 text-slate-200"
          value={selectedNoiseType}
          onChange={(e) => {
            console.log(e.target.value);
            const noiseType = parseInt(e.target.value);
            setSelectedNoiseType(noiseType);
            synth.noise.type.setValueAtTime(noiseType, 0);
          }}
        >
          {getNoiseTypes().map((type) => (
            <option key={type.value} value={type.value}>
              {type.name}
            </option>
          ))}
        </select>
      </div>
      <div className="flex items-center gap-2 mt-1">
        <div className="w-16 text-right">Volume:</div>
        <input
          type="range"
          className="w-64"
          min={-60}
          max={0}
          step={1}
          value={volume}
          onChange={(e) => {
            const db = e.target.valueAsNumber;
            setVolume(db);
            const gain = db < -60 ? 0 : Math.pow(10, db / 20);
            synth.gain.gain.setValueAtTime(gain, 0);
          }}
        />
        <div>{volume <= -60 ? "Muted" : volume + "dB"}</div>
      </div>
    </div>
  );
}

class NoiseSynth {
  gain: GainNode;
  noise: NoiseWorkletNode;
  constructor(context: AudioContext) {
    this.gain = new GainNode(context, { gain: 0 });

    this.noise = createNoiseNode(context, {
      type: "White Random",
    });
    this.noise.connect(this.gain).connect(context.destination);
  }

  disconnect() {
    this.gain.disconnect();
    this.noise.disconnect();
  }
}

function ExampleButton({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  const [show, setShow] = useState(false);
  if (show) return children;

  return (
    <button
      className="border border-white p-2 rounded opacity-50"
      onClick={() => {
        setShow(true);
      }}
    >
      {label}
    </button>
  );
}
