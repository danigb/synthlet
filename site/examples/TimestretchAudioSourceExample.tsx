"use client";

import { createSynthAudioContext } from "@/app/audio-context";
import { useEffect, useRef, useState } from "react";
import {
  TimestretchAudioSource,
  type TimestretchAudioSourceWorkletNode,
} from "synthlet";
import { CheckboxParam } from "./components/CheckboxParam";
import { ExamplePane } from "./components/ExamplePane";
import { Slider } from "./components/Slider";

// The same clip the granite example loads.
const CLIP = "/synthlet/track14.mp3";

function TimestretchAudioSourceExample() {
  const [status, setStatus] = useState<"loading" | "ready" | "playing">(
    "loading",
  );
  const [source, setSource] =
    useState<TimestretchAudioSourceWorkletNode | null>(null);
  // The clip's length, so the region sliders can be in seconds of *this* clip
  // rather than of the parameter's arbitrary 0..3600 range.
  const [duration, setDuration] = useState(0);
  const disposed = useRef(false);

  useEffect(() => {
    disposed.current = false;
    let node: TimestretchAudioSourceWorkletNode | undefined;

    createSynthAudioContext()
      .then(async (ac) => {
        const bytes = await fetch(CLIP).then((r) => r.arrayBuffer());
        const buffer = await ac.decodeAudioData(bytes);
        if (disposed.current) return;

        node = TimestretchAudioSource(ac, { playbackRate: 1, detune: 0 });
        node.setBuffer(buffer);
        node.connect(ac.destination);
        node.onended = () => setStatus("ready");
        setDuration(node.naturalDuration);
        setSource(node);
        setStatus("ready");
      })
      .catch(() => setStatus("ready"));

    return () => {
      disposed.current = true;
      node?.dispose();
    };
  }, []);

  if (!source) return <div className="p-2">Loading…</div>;

  return (
    <>
      <div className="flex items-center gap-4 mb-4">
        <button
          className="border px-2 py-1 rounded bg-fd-primary text-fd-primary-foreground disabled:opacity-50"
          disabled={status === "loading"}
          onClick={() => {
            if (status === "playing") {
              source.stop();
              setStatus("ready");
            } else {
              source.start();
              setStatus("playing");
            }
          }}
        >
          {status === "playing" ? "Stop" : "Play"}
        </button>
        <CheckboxParam name="Reverse" param={source.reverse} />
        <CheckboxParam name="Loop" param={source.loop} />
        <span className="text-sm opacity-70">
          Move everything while it plays: nothing here rewinds.
        </span>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <Slider
          label="Speed"
          labelClassName="text-right"
          inputClassName="col-span-2"
          min={0.25}
          max={2}
          step={0.01}
          param={source.playbackRate}
        />
        <div className="text-sm opacity-70">pitch unchanged</div>

        <Slider
          label="Pitch"
          labelClassName="text-right"
          inputClassName="col-span-2"
          min={-1200}
          max={1200}
          step={1}
          units="cents"
          param={source.detune}
        />
        <div className="text-sm opacity-70">duration unchanged</div>

        <Slider
          label="Start"
          labelClassName="text-right"
          inputClassName="col-span-2"
          min={0}
          max={duration}
          step={0.01}
          units="s"
          param={source.startOffset}
        />
        <div className="text-sm opacity-70">region start</div>

        <Slider
          label="End"
          labelClassName="text-right"
          inputClassName="col-span-2"
          min={0}
          max={duration}
          step={0.01}
          units="s"
          param={source.endOffset}
        />
        <div className="text-sm opacity-70">0 = end of clip</div>
      </div>
    </>
  );
}

export default () => (
  <ExamplePane label="Timestretch Audio Source">
    <TimestretchAudioSourceExample />
  </ExamplePane>
);
