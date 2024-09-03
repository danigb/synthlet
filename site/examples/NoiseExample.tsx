"use client";

import { useState } from "react";
import { createNoiseNode, getNoiseTypes, NoiseWorkletNode } from "synthlet";
import { useSynth } from "./useSynth";

export function NoiseExample() {
  const [open, setOpen] = useState(false);

  return open ? (
    <NoiseSynthUI onClose={() => setOpen(false)} />
  ) : (
    <button
      className="border px-2 py-1 rounded bg-fd-secondary"
      onClick={() => setOpen(true)}
    >
      Start Noise example
    </button>
  );
}

function NoiseSynthUI({ onClose }: { onClose: () => void }) {
  const [selectedNoiseType, setSelectedNoiseType] = useState(0);
  const [volume, setVolume] = useState(-60);
  const synth = useSynth((context) => new NoiseSynth(context));
  if (!synth) return null;

  return (
    <div className="bg-fd-card text-fd-foreground p-2 border rounded">
      <div className="text-xl mb-4">Noise generator example</div>
      <div className="flex items-center gap-2">
        <div className="w-16 text-right">Type:</div>
        <select
          className="p-1 rounded bg-slate-700 text-slate-200"
          value={selectedNoiseType}
          onChange={(e) => {
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
      <div className="flex items-center gap-2 mb-4">
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

      <button
        className="border px-2 py-1 rounded bg-fd-secondary"
        onClick={onClose}
      >
        Close
      </button>
    </div>
  );
}

class NoiseSynth {
  gain: GainNode;
  noise: NoiseWorkletNode;
  connect: typeof GainNode.prototype.connect;

  constructor(context: AudioContext) {
    this.gain = new GainNode(context, { gain: 0 });

    this.noise = createNoiseNode(context, {
      type: "White Random",
    });
    this.noise.connect(this.gain);
    this.connect = this.gain.connect.bind(this.gain);
  }

  dispose() {
    this.gain.disconnect();
    this.noise.dispose();
  }
}
