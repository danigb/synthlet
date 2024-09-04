"use client";

import { createSynthAudioContext } from "@/app/audio-context";
import { Drum8Type, Drum8WorkletNode } from "@synthlet/drum8";
import { useEffect, useState } from "react";
import { createDrum8Node } from "synthlet";

export function Drum8() {
  return (
    <div className="flex flex-col bg-orange-600 p-4 rounded border border-orange-400">
      <h1 className="text-xl border-b border-orange-400">
        Drum8 drums synthesizer
      </h1>
      <div className="mt-4 flex flex-col gap-2">
        <Drum8Sound type={Drum8Type.KICK} tone snap />
        <Drum8Sound type={Drum8Type.SNARE} tone snap />
      </div>
    </div>
  );
}

function Drum8Sound({
  type,
  tone,
  snap,
}: {
  type: Drum8Type;
  tone?: boolean;
  snap?: boolean;
}) {
  const [synth, setSynth] = useState<Drum8Synth | null>(null);
  const [toneValue, setToneValue] = useState<number>(20);
  const [snapValue, setSnapValue] = useState<number>(20);

  useEffect(() => {
    createSynthAudioContext().then((context) => {
      setSynth(new Drum8Synth(context, type));
    });
  }, [type]);

  if (!synth) return null;

  return (
    <div className="flex items-end gap-2">
      <button
        className="capitalize border p-1 rounded border-orange-300"
        onMouseDown={() => {
          synth.node.setGate(true);
        }}
        onMouseUp={() => {
          synth.node.setGate(false);
        }}
      >
        {type}
      </button>

      <SynthParam
        name="Decay"
        max={2}
        onChange={(value) => {
          synth.node.decay.value = value;
        }}
      />
      {tone && (
        <SynthParam
          name="Tone"
          onChange={(tone) => {
            synth.node.tone.value = tone;
          }}
        />
      )}
      {snap && (
        <SynthParam
          name="Snap"
          onChange={(tone) => {
            synth.node.snap.value = tone;
          }}
        />
      )}
    </div>
  );
}

function SynthParam({
  name,
  max = 1,
  step = 0.01,
  onChange,
}: {
  name: string;
  max?: number;
  step?: number;
  onChange: (value: number) => void;
}) {
  const [value, setValue] = useState<number>(0.2 * max);

  return (
    <>
      <label htmlFor={name}>{name}</label>
      <input
        type="range"
        min={0}
        max={max}
        step={step}
        value={value}
        onChange={(event) => {
          const value = event.target.valueAsNumber;
          setValue(value);
          onChange(value);
        }}
      />
      <p>{max !== 1 ? value.toFixed(2) : (value * 100).toFixed(0)}</p>
    </>
  );
}

export class Drum8Synth {
  node: Drum8WorkletNode;
  constructor(context: AudioContext, type: Drum8Type) {
    this.node = createDrum8Node(context, { type });
    this.node.connect(context.destination);
  }
}
