"use client";

import { useEffect, useState } from "react";
import { Slider } from "src/Slider";
import {
  Adsr,
  AdsrNode,
  Lfo,
  LfoNode,
  LfoWaveform,
  PcmOscillator,
  PcmOscillatorNode,
  loadSynthlet,
} from "synthlet";
import { ConnectMidi } from "../ConnectMidi";
import { PianoKeyboard } from "../PianoKeyboard";
import { getAudioContext } from "../audio-context";

class Synth {
  lfo: LfoNode;
  pcm: PcmOscillatorNode;
  env: AdsrNode;

  static params = {
    osc: {
      frequency: 440,
    },
    lfo: {
      frequency: 4,
      gain: 1000,
      waveform: LfoWaveform.RandSampleHold,
    },
    pcm: {
      frequency: 100,
      resonance: 0.8,
    },
  };

  constructor(public context: AudioContext, audioBuffer: AudioBuffer) {
    this.lfo = Lfo(context, {
      waveform: LfoWaveform.Sine,
      frequency: 0.01,
    });
    this.pcm = PcmOscillator(context, {
      source: audioBuffer,
      speed: 1,
    });
    this.lfo.connect(this.pcm.speed);
    this.env = Adsr(context);
    this.pcm.connect(this.env).connect(context.destination);
  }

  pressKey({ note }: { note: number }) {
    this.env.gate.setValueAtTime(1, this.context.currentTime);
  }
  releaseKey({ note }: { note: number }) {
    this.env.gate.setValueAtTime(0, this.context.currentTime);
  }

  destroy() {
    this.lfo.disconnect();
    this.pcm.disconnect();
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
  "https://smpldsnds.github.io/archiveorg-mellotron/MKII%20VIBES/C2%20VIBES.m4a"
);

export function PcmOscillatorExample({ className }: { className?: string }) {
  const [active, setActive] = useState(false);
  const [synth, setSynth] = useState<Synth | undefined>(undefined);
  const [speed, setSpeed] = useState(1);

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
        <h1 className="text-3xl text-teal-500">PcmOscillator</h1>
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
          An oscillator though
          <span className="text-teal-600"> Filter </span>
          controlled by a<span className="text-teal-600"> Lfo </span>
          and an
          <span className="text-teal-600"> Adsr </span>
          envelope
        </p>

        <label className="text-zinc-200">PcmOscillator</label>
        <div className="flex gap-2 mb-2 text-zinc-400">
          <Slider
            name="Speed"
            value={speed}
            min={-3}
            max={3}
            onChange={setSpeed}
            param={synth?.pcm.speed}
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
