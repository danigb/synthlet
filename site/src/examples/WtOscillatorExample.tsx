"use client";

import { useEffect, useState } from "react";
import { Slider } from "src/Slider";
import { midiToFreq } from "src/midiToFreq";
import {
  Adsr,
  AdsrNode,
  Lfo,
  LfoNode,
  LfoWaveform,
  WtOscillator,
  WtOscillatorNode,
  loadSynthlet,
} from "synthlet";
import { ConnectMidi } from "../ConnectMidi";
import { PianoKeyboard } from "../PianoKeyboard";
import { getAudioContext } from "../audio-context";

class Synth {
  lfo: LfoNode;
  wt: WtOscillatorNode;
  env: AdsrNode;

  static params = {
    osc: {
      frequency: 440,
    },
    lfo: {
      frequency: 4,
      gain: 1,
      waveform: LfoWaveform.RandSampleHold,
    },
  };
  out: GainNode;

  constructor(public context: AudioContext, audioBuffer: AudioBuffer) {
    this.out = new GainNode(context, { gain: 0.1 });
    this.lfo = Lfo(context, {
      waveform: LfoWaveform.Sine,
      frequency: 0.01,
    });
    this.wt = WtOscillator(context, {
      source: audioBuffer,
      morphFrequency: 1,
    });
    // this.lfo.connect(this.wt.speed);
    this.env = Adsr(context);
    this.wt.connect(this.out).connect(context.destination); // this.env).connect(context.destination);
  }

  pressKey({ note }: { note: number }) {
    const freq = midiToFreq(note);
    console.log("pressKey", note, freq);
    this.wt.frequency.setValueAtTime(freq, this.context.currentTime);
    this.env.gate.setValueAtTime(1, this.context.currentTime);
  }
  releaseKey({ note }: { note: number }) {
    this.env.gate.setValueAtTime(0, this.context.currentTime);
  }

  destroy() {
    this.lfo.disconnect();
    this.wt.disconnect();
    this.env.disconnect();
  }
}

function audioBufferLoader(url: string) {
  let promise: Promise<AudioBuffer> | undefined = undefined;

  return () =>
    (promise ??= fetch(url)
      .then((res) => res.arrayBuffer())
      .then((audioData) => getAudioContext().decodeAudioData(audioData)));
}

const loadAudio = audioBufferLoader(
  "https://smpldsnds.github.io/wavedit-online/samples/FAIRLIGH.WAV"
);

export function WtOscillatorExample({ className }: { className?: string }) {
  const [active, setActive] = useState(false);
  const [synth, setSynth] = useState<Synth | undefined>(undefined);
  const [morphFrequency, setMorphFrequency] = useState(1);

  useEffect(() => {
    if (!active) return;

    let synth: Synth | undefined = undefined;

    loadSynthlet(getAudioContext())
      .then(loadAudio)
      .then((audioBuffer) => {
        synth = new Synth(getAudioContext(), audioBuffer);
        setSynth(synth);
      });

    return () => {
      synth?.destroy();
    };
  }, [active]);

  return (
    <div className={className}>
      <div className="flex gap-2 items-end">
        <h1 className="text-3xl text-teal-500">WtOscillator</h1>
        <button
          className={`px-2 py-1 rounded ${
            active ? "bg-teal-500 text-zinc-800" : "bg-zinc-700 text-teal-500"
          }`}
          onClick={() => setActive((active) => !active)}
        >
          {active ? "⭘ off" : "⏼ on"}
        </button>
      </div>
      <div className={`${active ? "" : "opacity-25"}`}>
        <p className="mb-4">
          A<span className="text-teal-600"> Wavetable Oscillator </span>
        </p>

        <label className="text-zinc-200">WtOscillator</label>
        <div className="flex gap-2 mb-2 text-zinc-400">
          <Slider
            name="Morph Frequency"
            value={morphFrequency}
            min={0}
            max={10}
            onChange={setMorphFrequency}
            param={synth?.wt.morphFrequency}
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
          borderColor="border-teal-700"
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
