"use client";

import { useEffect, useState } from "react";
import {
  AdsrNode,
  ImpulseNode,
  createAdsrNode,
  createImpulseNode,
  loadSynthlet,
} from "synthlet";
import { ConnectMidi } from "./ConnectMidi";
import { PianoKeyboard } from "./PianoKeyboard";
import { getAudioContext } from "./audio-context";

const midiToFreq = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12);

class AdsrExampleSynth {
  osc: OscillatorNode;
  gain: GainNode;
  adsr: AdsrNode;
  gate: AudioParam | undefined;
  impulse: ImpulseNode;
  env: AdsrNode;

  constructor(public context: AudioContext) {
    this.osc = new OscillatorNode(context, { type: "sine", frequency: 880 });
    this.gain = new GainNode(context, { gain: 1 });
    this.adsr = createAdsrNode(context);
    this.env = createAdsrNode(context);
    this.impulse = createImpulseNode(context);
    this.impulse.connect(this.env.gate);
    this.osc.start();
    this.osc.connect(this.env).connect(this.adsr).connect(context.destination);
  }

  pressKey({ note }: { note: number }) {
    console.log("press", note, this.adsr.attack, this.adsr.release);
    this.osc.frequency.value = midiToFreq(note);
    this.adsr.gate.setValueAtTime(1, this.context.currentTime);
  }
  releaseKey({ note }: { note: number }) {
    console.log("release1", note, this.adsr.gate);
    this.adsr.gate.setValueAtTime(0, this.context.currentTime);
    console.log("release2", note, this.adsr.gate);
  }

  destroy() {
    this.gain.disconnect();
    this.osc.disconnect();
  }
}

function Slider({
  min = 0,
  max = 5,
  name,
  value,
  onChange,
  param,
}: {
  min?: number;
  max?: number;
  name: string;
  value: number;
  onChange: (value: number) => void;
  param?: AudioParam;
}) {
  return (
    <>
      {name} {value.toFixed(2)}
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        step="any"
        onChange={(e) => {
          const value = e.target.valueAsNumber;
          param?.setValueAtTime(value, 0);
          onChange(value);
        }}
      />
    </>
  );
}

export function AdsrExample({ className }: { className?: string }) {
  const [synth, setSynth] = useState<AdsrExampleSynth | undefined>(undefined);
  const [attack, setAttack] = useState(0.1);
  const [decay, setDecay] = useState(0.1);
  const [sustain, setSustain] = useState(0.5);
  const [release, setRelease] = useState(0.1);
  const [freq, setFreq] = useState(2);

  useEffect(() => {
    let synth: AdsrExampleSynth | undefined = undefined;
    loadSynthlet(getAudioContext()).then(() => {
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
        <h1 className="text-3xl">Adsr</h1>
        <p>
          <span className="text-rose-500">Adsr </span>
          envelope with a<span className="text-rose-500"> Impulse </span>
          trigger
        </p>
      </div>

      <label className="text-zinc-200">Adsr</label>
      <div className="flex gap-2 mb-2 text-zinc-400">
        <Slider
          name="Attack"
          value={attack}
          onChange={setAttack}
          param={synth?.adsr.attack}
        />
        <Slider
          name="Decay"
          value={decay}
          onChange={setDecay}
          param={synth?.adsr.decay}
        />
        <Slider
          name="Sustain"
          max={1}
          value={sustain}
          onChange={setSustain}
          param={synth?.adsr.sustain}
        />
        <Slider
          name="Release"
          value={release}
          onChange={setRelease}
          param={synth?.adsr.release}
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
