"use client";

import { createSynthAudioContext } from "@/audio-context";
import { Drum8WorkletNode } from "@synthlet/drum8";
import { useEffect, useState } from "react";
import { createDrum8 } from "synthlet";

export function Drum8() {
  const [synth, setSynth] = useState<Drum8Synth | null>(null);
  useEffect(() => {
    createSynthAudioContext().then((context) => {
      setSynth(new Drum8Synth(context));
    });
  }, []);

  if (!synth) return null;

  return (
    <div className="flex flex-col bg-orange-600 p-4 rounded border border-orange-400">
      <h1 className="text-xl border-b border-orange-400">
        Drum8 drums synthesizer
      </h1>
      <button
        onMouseDown={() => {
          synth.kick.gateOn();
        }}
        onMouseUp={() => {
          synth.kick.gateOff();
        }}
      >
        Gate
      </button>
    </div>
  );
}

export class Drum8Synth {
  kick: Drum8WorkletNode;
  constructor(context: AudioContext) {
    this.kick = createDrum8(context, {});
    this.kick.connect(context.destination);
  }
}
