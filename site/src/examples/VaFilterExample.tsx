"use client";

import { useEffect, useState } from "react";
import { Slider } from "src/Slider";
import {
  Adsr,
  AdsrNode,
  Lfo,
  LfoNode,
  LfoWaveform,
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
  lfo: LfoNode;
  filter: VaFilterNode;
  env: AdsrNode;

  static params = {
    osc: {
      frequency: 440,
    },
    lfo: {
      frequency: 4,
      gain: 6000,
      waveform: LfoWaveform.RandSampleHold,
    },
    filter: {
      type: VaFilterType.Korg35_LP,
      frequency: 100,
      resonance: 0.8,
    },
  };

  constructor(public context: AudioContext) {
    this.osc = new OscillatorNode(context, {
      type: "triangle",
      frequency: 440,
    });
    this.lfo = Lfo(context, Synth.params.lfo);
    this.osc.start();
    this.filter = VaFilter(context, Synth.params.filter);
    this.env = Adsr(context);
    this.lfo.connect(this.filter.frequency);
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
    this.lfo.disconnect();
    this.osc.disconnect();
    this.filter.disconnect();
    this.env.disconnect();
  }
}

export function VaFilterExample({ className }: { className?: string }) {
  const [active, setActive] = useState(false);
  const [synth, setSynth] = useState<Synth | undefined>(undefined);
  const [filterType, seFilterType] = useState(Synth.params.filter.type);
  const [frequency, setFrequency] = useState(Synth.params.filter.frequency);
  const [resonance, setResonance] = useState(Synth.params.filter.resonance);

  useEffect(() => {
    if (!active) return;
    let synth: Synth | undefined = undefined;
    loadSynthlet(getAudioContext()).then(() => {
      synth = new Synth(getAudioContext());
      setSynth(synth);
    });

    return () => {
      synth?.destroy();
    };
  }, [active]);

  return (
    <div className={className}>
      <div className="flex gap-2 items-end">
        <h1 className="text-3xl text-purple-500">VaFilter</h1>
        <button
          className={`px-2 py-1 rounded ${
            active ? "bg-purple-500 text-zinc-800" : "bg-zinc-700"
          }`}
          onClick={() => setActive((active) => !active)}
        >
          {active ? "Off" : "On"}
        </button>
      </div>
      <div className={`${active ? "" : "opacity-25"}`}>
        <p className="mb-4">
          An oscillator though
          <span className="text-purple-600"> Filter </span>
          controlled by a<span className="text-purple-600"> Lfo </span>
          and an
          <span className="text-purple-600"> Adsr </span>
          envelope
        </p>

        <label className="text-zinc-200">VaFilter</label>
        <div className="flex gap-2 mb-2 text-zinc-400">
          <select
            className="bg-zinc-700 rounded py-[2px]"
            value={filterType}
            onChange={(e) => {
              const waveform = parseInt(e.target.value) as VaFilterType;
              synth?.filter.type.setValueAtTime(waveform, 0);
              seFilterType(waveform);
            }}
            disabled={!active}
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
            disabled={!active}
          />
          <Slider
            name="Resonance"
            value={resonance}
            min={0}
            max={1000}
            onChange={setResonance}
            param={synth?.filter.resonance}
            disabled={!active}
          />
        </div>
      </div>

      <div className="flex gap-2 mb-2">
        <ConnectMidi
          instrument={{
            start(note) {
              synth?.pressKey(note);
            },
            stop(note) {
              synth?.releaseKey({ note: note.stopId });
            },
          }}
          disabled={!active}
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
          hold
          disabled={!active}
        />
      </div>
    </div>
  );
}
