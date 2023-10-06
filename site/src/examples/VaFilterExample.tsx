"use client";

import { useEffect, useState } from "react";
import { Slider } from "src/Slider";
import {
  Adsr,
  AdsrNode,
  VA_FILTER_TYPE_NAMES,
  VaFilter,
  VaFilterNode,
  VaFilterType,
  loadSynthlet,
} from "synthlet";
import { ConnectMidi } from "../ConnectMidi";
import { PianoKeyboard } from "../PianoKeyboard";
import { getAudioContext } from "../audio-context";
import { midiToFreq } from "../midiToFreq";

class Synth {
  osc: OscillatorNode;
  filter: VaFilterNode;
  env: AdsrNode;

  static params = {
    osc: {
      frequency: 440,
    },
    filter: {
      type: VaFilterType.VF_LP,
      frequency: 1000,
    },
  };

  constructor(public context: AudioContext) {
    this.osc = new OscillatorNode(context, {
      type: "triangle",
      frequency: 440,
    });
    this.osc.start();
    this.filter = VaFilter(context, Synth.params.filter);
    this.env = Adsr(context);
    this.osc
      .connect(this.filter)
      .connect(this.env)
      .connect(context.destination);
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

export function VaFilterExample({ className }: { className?: string }) {
  const [synth, setSynth] = useState<Synth | undefined>(undefined);
  const [filterType, seFilterType] = useState(Synth.params.filter.type);
  const [frequency, setFrequency] = useState(Synth.params.filter.frequency);

  useEffect(() => {
    let synth: Synth | undefined = undefined;
    loadSynthlet(getAudioContext()).then(() => {
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
        <h1 className="text-3xl text-purple-500">VaFilter</h1>
        <p>
          <span className="text-purple-600">An oscillator though </span>
          <span className="text-purple-600"> Filter </span>
          and an
          <span className="text-purple-600"> Adsr </span>
          envelope
        </p>
      </div>

      <label className="text-zinc-200">VaFilter</label>
      <div className="flex gap-2 mb-2 text-zinc-400">
        <select
          className="bg-zinc-700 rounded py-[2px]"
          value={filterType}
          onChange={(e) => {
            const waveform = parseInt(e.target.value) as VaFilterType;
            //synth?.filter.type.setValueAtTime(waveform, 0);
            seFilterType(waveform);
          }}
        >
          {VA_FILTER_TYPE_NAMES.map((name, index) => (
            <option key={name} value={"" + index}>
              {name}
            </option>
          ))}
        </select>
        <Slider
          name="Frequency"
          value={frequency}
          min={0}
          max={10000}
          onChange={setFrequency}
          param={synth?.filter.frequency}
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
          borderColor="border-purple-700"
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
