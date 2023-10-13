"use client";

import { useEffect, useState } from "react";
import { Adsr, Mika, MikaNode, loadSynthletNodes } from "synthlet";
import { ConnectMidi } from "../ConnectMidi";
import { PianoKeyboard } from "../PianoKeyboard";
import { Slider } from "../Slider";
import { getAudioContext } from "../audio-context";
import { midiToFreq } from "../midiToFreq";

class MikaExampleSynth {
  env: MikaNode;
  osc: MikaNode;

  constructor(public context: AudioContext) {
    this.osc = Mika(context, { release: 1 });
    this.env = Adsr(context);
    this.osc.connect(this.env).connect(context.destination);
  }

  pressKey({ note }: { note: number }) {
    this.osc.frequency.setValueAtTime(midiToFreq(note), 0);
    this.env.gate.setValueAtTime(1, this.context.currentTime);
  }
  releaseKey({ note }: { note: number }) {
    this.env.gate.setValueAtTime(0, this.context.currentTime);
  }

  destroy() {
    this.osc.disconnect();
    this.env.disconnect();
  }
}

export function MikaExample({ className }: { className?: string }) {
  const [synth, setSynth] = useState<MikaExampleSynth | undefined>(undefined);
  const [attack, setAttack] = useState(0.1);
  const [decay, setDecay] = useState(0.1);
  const [sustain, setSustain] = useState(0.5);
  const [release, setRelease] = useState(1);
  const [detune, setDetune] = useState(0.01);

  useEffect(() => {
    let synth: MikaExampleSynth | undefined = undefined;
    loadSynthletNodes(getAudioContext()).then(() => {
      synth = new MikaExampleSynth(getAudioContext());
      setSynth(synth);
    });

    return () => {
      synth?.destroy();
    };
  }, []);

  return (
    <div className={className}>
      <div className="flex gap-2 items-end mb-2">
        <h1 className="text-3xl text-emerald-500">Mika</h1>
        <p>
          <span className="text-emerald-600">Mika </span>
          oscillator with a<span className="text-emerald-600"> Adsr </span>
          envelope
        </p>
      </div>

      <label className="text-zinc-200">Mika Oscillator</label>
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
      <label className="text-zinc-200">Envelope</label>
      <div className="flex gap-2 mb-2 text-zinc-400">
        <Slider
          name="Attack"
          value={attack}
          onChange={setAttack}
          param={synth?.env.attack}
        />
        <Slider
          name="Decay"
          value={decay}
          onChange={setDecay}
          param={synth?.env.decay}
        />
        <Slider
          name="Sustain"
          max={1}
          value={sustain}
          onChange={setSustain}
          param={synth?.env.sustain}
        />
        <Slider
          name="Release"
          value={release}
          onChange={setRelease}
          param={synth?.env.release}
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
          borderColor="border-emerald-700"
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
