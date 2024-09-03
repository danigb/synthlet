"use client";

import { createSynthAudioContext } from "@/audio-context";
import { Slider } from "@/components/Slider";
import { Drum8WorkletNode } from "@synthlet/drum8";
import { useEffect, useState } from "react";
import { ClockWorkletNode, createClock, createDrum8 } from "synthlet";

export function ClockExample() {
  const [synth, setSynth] = useState<ClockSynth | null>(null);

  useEffect(() => {
    let synth: ClockSynth;
    createSynthAudioContext().then((context) => {
      synth = new ClockSynth(context);
      setSynth(synth);
    });
    return () => {
      console.log("disconnecting");
      synth?.disconnect();
    };
  }, []);

  if (!synth) return null;

  return (
    <div>
      <h2>Clock</h2>
      <p>Test clock module</p>
      <Slider
        label="Tempo"
        initial={120}
        min={10}
        max={240}
        step={1}
        onChange={(bpm) => {
          synth.clock.bpm.setValueAtTime(bpm, 0);
        }}
      />
      <Slider
        label="Volume"
        initial={0}
        min={0}
        max={1}
        step={0.1}
        onChange={(gain) => {
          synth.out.gain.setValueAtTime(gain, 0);
        }}
        initialize
      />
    </div>
  );
}

class ClockSynth {
  clock: ClockWorkletNode;
  kick: Drum8WorkletNode;
  out: GainNode;

  constructor(context: AudioContext) {
    this.out = new GainNode(context);
    this.clock = createClock(context);
    this.kick = createDrum8(context, "kick", {
      gate: 0,
    });
    this.kick.connect(this.out).connect(context.destination);
    this.clock.connect(this.kick.gate);
  }

  disconnect() {
    this.clock.disconnect();
    this.kick.disconnect();
    this.out.disconnect();
  }
}
