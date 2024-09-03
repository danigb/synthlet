"use client";

import { createSynthAudioContext } from "@/app/audio-context";
import { Slider } from "@/app/components/Slider";
import { Drum8WorkletNode } from "@synthlet/drum8";
import { useEffect, useState } from "react";
import { ClockWorkletNode, createClockNode, createDrum8Node } from "synthlet";

export function ClockExample() {
  const [synth, setSynth] = useState<ClockSynth | null>(null);

  useEffect(() => {
    console.log("connecting");
    let bye = false;
    let synth: ClockSynth;
    createSynthAudioContext().then((context) => {
      if (bye) return;
      synth = new ClockSynth(context);
      console.log("connected", synth);
      setSynth(synth);
    });
    return () => {
      bye = true;
      console.log("disconnecting", synth);
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
    this.clock = createClockNode(context);
    this.kick = createDrum8Node(context, {
      type: "kick",
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
