"use client";

import { createSynthAudioContext } from "@/app/audio-context";
import { useEffect, useRef, useState } from "react";
import {
  FlexAudioBufferSource,
  type FlexAudioBufferSourceWorkletNode,
} from "synthlet";
import { ExamplePane } from "./components/ExamplePane";
import { Slider } from "./components/Slider";

// The same clip the granite demo loads.
const CLIP = "/synthlet/track14.mp3";

function FlexAudioBufferSourceExample() {
  const [status, setStatus] = useState<"loading" | "ready" | "playing">(
    "loading",
  );
  const [source, setSource] = useState<FlexAudioBufferSourceWorkletNode | null>(
    null,
  );
  const disposed = useRef(false);

  useEffect(() => {
    disposed.current = false;
    let node: FlexAudioBufferSourceWorkletNode | undefined;

    createSynthAudioContext()
      .then(async (ac) => {
        const bytes = await fetch(CLIP).then((r) => r.arrayBuffer());
        const buffer = await ac.decodeAudioData(bytes);
        if (disposed.current) return;

        node = FlexAudioBufferSource(ac, { playbackRate: 1, detune: 0 });
        node.setBuffer(buffer);
        node.connect(ac.destination);
        node.onended = () => setStatus("ready");
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
        <span className="text-sm opacity-70">
          Move the sliders while it plays: speed and pitch are independent.
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
      </div>
    </>
  );
}

export default () => (
  <ExamplePane label="Flex Audio Buffer Source">
    <FlexAudioBufferSourceExample />
  </ExamplePane>
);
