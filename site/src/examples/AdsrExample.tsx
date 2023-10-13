"use client";

import { useEffect, useState } from "react";
import {
  Adsr,
  AdsrNode,
  Impulse,
  ImpulseNode,
  loadSynthletNodes,
} from "synthlet";
import { ConnectMidi } from "../ConnectMidi";
import { PianoKeyboard } from "../PianoKeyboard";
import { Slider } from "../Slider";
import { getAudioContext } from "../audio-context";
import { midiToFreq } from "../midiToFreq";

class AdsrExampleSynth {
  osc: OscillatorNode;
  env: AdsrNode;
  impulse: ImpulseNode;
  impEnv: AdsrNode;

  constructor(public context: AudioContext) {
    this.osc = new OscillatorNode(context, { type: "sine", frequency: 880 });
    this.env = Adsr(context, { release: 1 });
    this.impEnv = Adsr(context);
    this.impulse = Impulse(context, { frequency: 10 });
    this.impulse.connect(this.impEnv.gate);
    this.osc.start();
    this.osc
      .connect(this.impEnv)
      .connect(this.env)
      .connect(context.destination);
  }

  pressKey({ note }: { note: number }) {
    this.osc.frequency.value = midiToFreq(note);
    this.env.gate.setValueAtTime(1, this.context.currentTime);
  }
  releaseKey({ note }: { note: number }) {
    this.env.gate.setValueAtTime(0, this.context.currentTime);
  }

  destroy() {
    this.impulse.disconnect();
    this.impEnv.disconnect();
    this.osc.disconnect();
    this.env.disconnect();
  }
}

export function AdsrExample({ className }: { className?: string }) {
  const [synth, setSynth] = useState<AdsrExampleSynth | undefined>(undefined);
  const [attack, setAttack] = useState(0.1);
  const [decay, setDecay] = useState(0.1);
  const [sustain, setSustain] = useState(0.5);
  const [release, setRelease] = useState(1);
  const [freq, setFreq] = useState(10);

  useEffect(() => {
    let synth: AdsrExampleSynth | undefined = undefined;
    loadSynthletNodes(getAudioContext()).then(() => {
      synth = new AdsrExampleSynth(getAudioContext());
      setSynth(synth);
    });

    return () => {
      synth?.destroy();
    };
  }, []);

  return (
    <div className={className}>
      <div className="flex gap-2 items-end mb-2">
        <h1 className="text-3xl text-rose-500">Adsr</h1>
        <p>
          <span className="text-rose-600">Adsr </span>
          impEnvelope with a<span className="text-rose-600"> Impulse </span>
          trigger
        </p>
      </div>

      <label className="text-zinc-200">Adsr</label>
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
      <label className="text-zinc-200">Impulse</label>
      <div className="flex gap-2 mb-2 text-zinc-400">
        <Slider
          name="Freq"
          value={freq}
          min={1}
          max={20}
          onChange={setFreq}
          param={synth?.impulse.freq}
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
          borderColor="border-rose-700"
          onPress={(note) => {
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
