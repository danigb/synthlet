"use client";

import { useEffect, useState } from "react";
import { midiToFreq } from "src/midiToFreq";
import { Adsr, AdsrNode, Lfo, LfoNode, loadSynthlet } from "synthlet";
import { ConnectMidi } from "../ConnectMidi";
import { PianoKeyboard } from "../PianoKeyboard";
import { Slider } from "../Slider";
import { getAudioContext } from "../audio-context";

class LfoExampleSynth {
  osc: OscillatorNode;
  lfo: LfoNode;
  env: AdsrNode;

  constructor(public context: AudioContext) {
    this.osc = new OscillatorNode(context);
    this.lfo = Lfo(context, { frequency: 20, gain: 100 });
    this.env = Adsr(context, {
      attack: 0.1,
      decay: 0.1,
      sustain: 0.8,
      release: 1,
    });
    this.lfo.connect(this.osc.detune);
    this.osc.connect(this.env).connect(context.destination);
    this.osc.start();
  }

  pressKey({ note }: { note: number }) {
    this.osc.frequency.value = midiToFreq(note);
    this.env.gate.setValueAtTime(1, this.context.currentTime);
  }
  releaseKey({ note }: { note: number }) {
    this.env.gate.setValueAtTime(0, this.context.currentTime);
  }

  destroy() {
    this.osc.disconnect();
    this.env.disconnect();
    this.lfo.disconnect();
  }
}

export function LfoExample({ className }: { className?: string }) {
  const [synth, setSynth] = useState<LfoExampleSynth | undefined>(undefined);
  const [frequency, setFrequency] = useState(0.01);

  useEffect(() => {
    let synth: LfoExampleSynth | undefined = undefined;
    loadSynthlet(getAudioContext()).then(() => {
      synth = new LfoExampleSynth(getAudioContext());
      setSynth(synth);
    });

    return () => {
      synth?.destroy();
    };
  }, []);

  return (
    <div className={className}>
      <div className="flex gap-2 items-end mb-2">
        <h1 className="text-3xl text-cyan-500">Lfo </h1>
        <p>
          A<span className="text-cyan-600"> Lfo </span>
          oscillator controlling the detune of an OscillatorNode
        </p>
      </div>

      <label className="text-zinc-200">Lfo</label>
      <div className="flex gap-2 mb-2 text-zinc-400">
        <Slider
          name="Detune"
          value={frequency}
          min={0.1}
          max={200}
          onChange={setFrequency}
          param={synth?.osc.frequency}
        />
      </div>
      <div className="flex gap-2 mt-4 mb-2">
        <ConnectMidi
          instrument={{
            start(note) {
              synth?.pressKey(note);
            },
            stop(note) {
              synth?.releaseKey({ note: note.stopId });
            },
          }}
        />
      </div>
      <div className="">
        <PianoKeyboard
          borderColor="border-cyan-700"
          onPress={(note) => {
            console.log({ synth });
            synth?.pressKey(note);
          }}
          onRelease={(note) => {
            synth?.releaseKey({ note });
          }}
        />
      </div>
    </div>
  );
}
