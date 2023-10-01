"use client";

import { useEffect, useState } from "react";
import {
  KarplusStrongOscillator,
  KarplusStrongOscillatorNode,
  loadSynthlet,
} from "synthlet";
import { ConnectMidi } from "./ConnectMidi";
import { PianoKeyboard } from "./PianoKeyboard";
import { Slider } from "./Slider";
import { getAudioContext } from "./audio-context";

class KarplusExampleSynth {
  osc: KarplusStrongOscillatorNode;

  constructor(public context: AudioContext) {
    this.osc = KarplusStrongOscillator(context, { release: 1 });
    this.osc.connect(context.destination);
  }

  pressKey({ note }: { note: number }) {
    this.osc.gate.setValueAtTime(1, this.context.currentTime);
  }
  releaseKey({ note }: { note: number }) {
    this.osc.gate.setValueAtTime(0, this.context.currentTime);
  }

  destroy() {
    this.osc.disconnect();
  }
}

export function KarplusExample({ className }: { className?: string }) {
  const [synth, setSynth] = useState<KarplusExampleSynth | undefined>(
    undefined
  );
  const [attack, setAttack] = useState(0.1);
  const [decay, setDecay] = useState(0.1);
  const [sustain, setSustain] = useState(0.5);
  const [release, setRelease] = useState(1);
  const [detune, setDetune] = useState(0.01);

  useEffect(() => {
    let synth: KarplusExampleSynth | undefined = undefined;
    loadSynthlet(getAudioContext()).then(() => {
      synth = new KarplusExampleSynth(getAudioContext());
      setSynth(synth);
    });

    return () => {
      synth?.destroy();
    };
  }, []);

  return (
    <div className={className}>
      <div className="flex gap-2 items-end mb-2">
        <h1 className="text-3xl text-amber-500">Karplus Strong</h1>
        <p>
          <span className="text-amber-600">Karplus Strong</span>
          oscillator
        </p>
      </div>

      <label className="text-zinc-200">Karplus Oscillator</label>
      <div className="flex gap-2 mb-2 text-zinc-400">
        <Slider
          name="Detune"
          value={detune}
          min={0}
          max={0.5}
          onChange={setDetune}
          param={synth?.osc.detune}
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
          borderColor="border-amber-700"
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
