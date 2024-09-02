"use client";

import { createSynthAudioContext } from "@/audio-context";
import { Drum8ModuleType, Drum8WorkletNode } from "@synthlet/drum8";
import { useEffect, useState } from "react";
import { createDrum8 } from "synthlet";

export function Drum8() {
  return (
    <div className="flex flex-col bg-orange-600 p-4 rounded border border-orange-400">
      <h1 className="text-xl border-b border-orange-400">
        Drum8 drums synthesizer
      </h1>
      <div className="mt-4 flex flex-col gap-2">
        <Drum8Sound type="kick" tone snap />
        <Drum8Sound type="snare" tone snap />
      </div>
    </div>
  );
}

function Drum8Sound({
  type,
  tone,
  snap,
}: {
  type: Drum8ModuleType;
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
          synth.node.gateOn();
        }}
        onMouseUp={() => {
          synth.node.gateOff();
        }}
      >
        {type}
      </button>
      {tone && <p>Tone:</p>}
      {tone && (
        <input
          type="range"
          min={0}
          max={127}
          value={toneValue}
          onChange={(event) => {
            const tone = event.target.valueAsNumber;
            setToneValue(tone);
            synth.node.tone.value = tone;
          }}
        />
      )}
      {snap && <p>Snap:</p>}
      {snap && (
        <input
          type="range"
          min={0}
          max={127}
          step={1}
          value={snapValue}
          onChange={(event) => {
            const snap = event.target.valueAsNumber;
            setToneValue(snap);
            synth.node.snap.value = snap;
          }}
        />
      )}
    </div>
  );
}

export class Drum8Synth {
  node: Drum8WorkletNode;
  constructor(context: AudioContext, type: Drum8ModuleType) {
    this.node = createDrum8(context, type);
    this.node.connect(context.destination);
  }
}
