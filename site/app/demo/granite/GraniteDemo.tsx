"use client";

import { createSynthAudioContext } from "@/app/audio-context";
import { useMemo, useState } from "react";

export function GraniteDemo() {
  const [status, setStatus] = useState("loading");
  const player = useMemo(() => new GranitePlayer(setStatus), [setStatus]);
  return (
    <div className="flex-grow p-4">
      <button
        className="bg-blue-900 px-4 py-2 rounded-md disabled:bg-gray-500"
        disabled={status === "loading"}
        onClick={() => {
          player.isPlaying() ? player.stop() : player.start();
        }}
      >
        {player.isPlaying() ? "Stop" : "Play"}
      </button>
    </div>
  );
}

class GranitePlayer {
  buffer: AudioBuffer | null = null;
  source: AudioBufferSourceNode | null = null;
  ac: AudioContext | null = null;

  constructor(private readonly onChange: (status: string) => void) {
    onChange("loading");
    createSynthAudioContext()
      .then((ac) => {
        this.ac = ac;
        return ac;
      })
      .then((ac) => {
        fetch("/synthlet/track14.mp3")
          .then((r) => r.arrayBuffer())
          .then((buffer) => ac.decodeAudioData(buffer))
          .then((buffer) => {
            this.buffer = buffer;
            onChange("ready");
          });
      });
  }

  isReady() {
    return !!this.ac && !!this.buffer;
  }

  isPlaying() {
    return !!this.source;
  }

  start() {
    if (!this.isReady() || this.isPlaying()) return;

    const source = this.ac!.createBufferSource();
    source.buffer = this.buffer;
    source.connect(this.ac!.destination);
    source.start();
    this.onChange("playing");
    this.source = source;
  }

  stop() {
    if (!this.source) return;
    this.source.stop();
    this.source = null;
    this.onChange("ready");
  }
}
