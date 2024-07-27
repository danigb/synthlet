"use client";

import { createSynthAudioContext } from "@/audio-context";
import { useEffect, useState } from "react";
import {
  AdsrWorkletNode,
  createPolyblepOscillator,
  createVca,
  PolyblepOscillatorWorkletNode,
} from "synthlet";

export function FlyMono() {
  const [synth, setSynth] = useState<FlyMonoSynth | null>(null);

  useEffect(() => {
    createSynthAudioContext().then((context) => {
      setSynth(new FlyMonoSynth(context));
    });
  }, []);

  return synth ? (
    <div className="flex flex-col bg-blue-600 p-4 rounded border border-blue-500">
      <h1>Fly Monophonic Synthesizer</h1>

      <div className="mt-4">
        <button
          className="border border-white px-1 rounded opacity-70 hover:opacity-80"
          onMouseDown={() => {
            synth.vca.gateOn();
          }}
          onMouseUp={() => {
            synth.vca.gateOff();
          }}
          onMouseLeave={() => {
            synth.vca.gateOff();
          }}
        >
          Gate
        </button>
      </div>
    </div>
  ) : (
    <p>Creating synth...</p>
  );
}

class FlyMonoSynth {
  osc: PolyblepOscillatorWorkletNode;
  vca: AdsrWorkletNode;
  constructor(public readonly context: AudioContext) {
    console.log("CREATE fly");
    this.osc = createPolyblepOscillator(context);
    this.vca = createVca(context);
    this.osc.connect(this.vca).connect(context.destination);
    console.log("ready");
  }
}
