"use client";

import { createSynthAudioContext } from "@/app/audio-context";
import { useEffect, useRef, useState } from "react";
import { Granite, type GraniteWorkletNode } from "synthlet";
import { CheckboxParam } from "./components/CheckboxParam";
import { ExamplePane } from "./components/ExamplePane";
import { Slider } from "./components/Slider";

// The same clip `TimestretchAudioSourceExample` loads.
const CLIP = "/synthlet/track14.mp3";

function GraniteExample() {
  const [status, setStatus] = useState<"loading" | "ready" | "playing">(
    "loading",
  );
  const [granite, setGranite] = useState<GraniteWorkletNode | null>(null);
  // granite has no source of its own on purpose - it granulates whatever is
  // patched into it - so the demo owns the buffer and the node that plays it.
  const context = useRef<AudioContext | null>(null);
  const buffer = useRef<AudioBuffer | null>(null);
  const source = useRef<AudioBufferSourceNode | null>(null);
  const disposed = useRef(false);

  useEffect(() => {
    disposed.current = false;
    let node: GraniteWorkletNode | undefined;

    createSynthAudioContext()
      .then(async (ac) => {
        const bytes = await fetch(CLIP).then((r) => r.arrayBuffer());
        const decoded = await ac.decodeAudioData(bytes);
        if (disposed.current) return;

        node = Granite(ac, { rate: 40, duration: 60, wet: 1 });
        node.connect(ac.destination);

        context.current = ac;
        buffer.current = decoded;
        setGranite(node);
        setStatus("ready");
      })
      .catch(() => setStatus("ready"));

    return () => {
      disposed.current = true;
      source.current?.stop();
      source.current = null;
      node?.dispose();
    };
  }, []);

  const toggle = () => {
    const ac = context.current;
    if (!ac || !granite || !buffer.current) return;
    if (source.current) {
      source.current.stop();
      source.current = null;
      setStatus("ready");
      return;
    }
    const player = ac.createBufferSource();
    player.buffer = buffer.current;
    // Looped, so you can leave it running and turn the knobs instead.
    player.loop = true;
    player.connect(granite);
    player.start();
    source.current = player;
    setStatus("playing");
  };

  if (!granite) return <div className="p-2">Loading…</div>;

  return (
    <>
      <div className="flex items-center gap-4 mb-4 flex-wrap">
        <button
          className="border px-2 py-1 rounded bg-fd-primary text-fd-primary-foreground disabled:opacity-50"
          disabled={status === "loading"}
          onClick={toggle}
        >
          {status === "playing" ? "Stop" : "Play"}
        </button>
        <CheckboxParam name="Freeze" param={granite.freeze} />
        <span className="text-sm opacity-70">
          Freeze stops recording — the last 4 seconds become a playable object,
          and everything below still moves.
        </span>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <div className="col-span-4 text-sm opacity-70 border-b">The stream</div>

        <Slider
          label="Rate"
          labelClassName="text-right"
          inputClassName="col-span-2"
          min={0}
          max={400}
          step={1}
          units=" grains/s"
          param={granite.rate}
        />
        <div className="text-sm opacity-70">independent of duration</div>

        <Slider
          label="Duration"
          labelClassName="text-right"
          inputClassName="col-span-2"
          min={1}
          max={500}
          step={1}
          units=" ms"
          param={granite.duration}
        />
        <div className="text-sm opacity-70">rate × duration is the overlap</div>

        <Slider
          label="Jitter"
          labelClassName="text-right"
          inputClassName="col-span-2"
          min={0}
          max={1}
          param={granite.jitter}
        />
        <div className="text-sm opacity-70">off the grid, same density</div>

        <Slider
          label="Intermittency"
          labelClassName="text-right"
          inputClassName="col-span-2"
          min={0}
          max={1}
          param={granite.intermittency}
        />
        <div className="text-sm opacity-70">drops grains, lowers density</div>

        <div className="col-span-4 text-sm opacity-70 border-b mt-2">
          The grain
        </div>

        <Slider
          label="Position"
          labelClassName="text-right"
          inputClassName="col-span-2"
          min={0}
          max={1}
          param={granite.position}
        />
        <div className="text-sm opacity-70">0 is the freshest audio</div>

        <Slider
          label="Spray"
          labelClassName="text-right"
          inputClassName="col-span-2"
          min={0}
          max={1}
          param={granite.spray}
        />
        <div className="text-sm opacity-70">smears the origin backwards</div>

        <Slider
          label="Pitch"
          labelClassName="text-right"
          inputClassName="col-span-2"
          min={-24}
          max={24}
          step={1}
          units=" st"
          param={granite.pitch}
        />
        <div className="text-sm opacity-70">±2 octaves</div>

        <Slider
          label="Pitch spread"
          labelClassName="text-right"
          inputClassName="col-span-2"
          min={0}
          max={24}
          param={granite.pitchSpread}
        />
        <div className="text-sm opacity-70">12 spans one octave</div>

        <Slider
          label="Reverse"
          labelClassName="text-right"
          inputClassName="col-span-2"
          min={0}
          max={1}
          param={granite.reverse}
        />
        <div className="text-sm opacity-70">probability, not a rate</div>

        <Slider
          label="Shape"
          labelClassName="text-right"
          inputClassName="col-span-2"
          min={0}
          max={1}
          param={granite.shape}
        />
        <div className="text-sm opacity-70">expodec → bell → reversed</div>

        <Slider
          label="Pan spread"
          labelClassName="text-right"
          inputClassName="col-span-2"
          min={0}
          max={1}
          param={granite.panSpread}
        />
        <div className="text-sm opacity-70">a cloud, spatially</div>

        <div className="col-span-4 text-sm opacity-70 border-b mt-2">
          The write head, and the output
        </div>

        <Slider
          label="Feedback"
          labelClassName="text-right"
          inputClassName="col-span-2"
          min={0}
          max={0.95}
          param={granite.feedback}
        />
        <div className="text-sm opacity-70">with pitch up, stacked octaves</div>

        <Slider
          label="Wet"
          labelClassName="text-right"
          inputClassName="col-span-2"
          min={0}
          max={1}
          param={granite.wet}
        />
        <div className="text-sm opacity-70">0 is an exact bypass</div>
      </div>
    </>
  );
}

export default () => (
  <ExamplePane
    label="Granite"
    header={
      <span className="text-sm opacity-70 mr-4 self-center">
        Song by{" "}
        <a
          className="underline"
          href="https://freemusicarchive.org/music/Handheld_Recordings/Wolaita__Derashe_Ethiopia_2009/14_Track_14_1/"
        >
          Handheld Recordings
        </a>
      </span>
    }
  >
    <GraniteExample />
  </ExamplePane>
);
