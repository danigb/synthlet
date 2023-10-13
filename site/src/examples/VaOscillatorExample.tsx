"use client";

import { useEffect, useState } from "react";
import {
  Adsr,
  AdsrNode,
  VA_OSCILLATOR_WAVEFORM_NAMES,
  VaOscillator,
  VaOscillatorNode,
  VaOscillatorWaveform,
  loadSynthletNodes,
} from "synthlet";
import { ConnectMidi } from "../ConnectMidi";
import { PianoKeyboard } from "../PianoKeyboard";
import { Slider } from "../Slider";
import { getAudioContext } from "../audio-context";
import { midiToFreq } from "../midiToFreq";

class Synth {
  env: AdsrNode;
  osc: VaOscillatorNode;

  static params = {
    osc: {
      frequency: 440,
      waveform: VaOscillatorWaveform.Triangle,
    },
  };

  constructor(public context: AudioContext) {
    this.osc = VaOscillator(context, Synth.params.osc);
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

export function VaOscillatorExample({ className }: { className?: string }) {
  const [synth, setSynth] = useState<Synth | undefined>(undefined);
  const [detune, setDetune] = useState(0.01);
  const [waveform, setWaveform] = useState(Synth.params.osc.waveform);

  useEffect(() => {
    let synth: Synth | undefined = undefined;
    loadSynthletNodes(getAudioContext()).then(() => {
      synth = new Synth(getAudioContext());
      setSynth(synth);
    });

    return () => {
      synth?.destroy();
    };
  }, []);

  return (
    <div className={className}>
      <div className="flex gap-2 items-end mb-2">
        <h1 className="text-3xl text-lime-500">VaOscillator</h1>
        <p>
          <span className="text-lime-600">VaOscillator </span>
          oscillator with an<span className="text-lime-600"> Adsr </span>
          envelope
        </p>
      </div>

      <label className="text-zinc-200">VaOscillator Oscillator</label>
      <div className="flex gap-2 mb-2 text-zinc-400">
        <select
          className="bg-zinc-700 rounded py-[2px]"
          value={waveform}
          onChange={(e) => {
            const waveform = parseInt(e.target.value) as VaOscillatorWaveform;
            synth?.osc.waveform.setValueAtTime(waveform, 0);
            setWaveform(waveform);
          }}
        >
          {VA_OSCILLATOR_WAVEFORM_NAMES.map((name, index) => (
            <option key={name} value={"" + index}>
              {name}
            </option>
          ))}
        </select>
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
          borderColor="border-lime-700"
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
