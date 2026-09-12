"use client";

import { createSynthAudioContext } from "@/app/audio-context";
import { useEffect, useRef, useState } from "react";
import {
  EnvelopeFollower,
  EnvelopeFollowerType,
  Gain,
  Param,
  Svf,
  SvfType,
  TimestretchAudioSource,
  type TimestretchAudioSourceWorkletNode,
} from "synthlet";
import { ExamplePane } from "./components/ExamplePane";
import { Slider } from "./components/Slider";

// Part 15's Figure 9: "the loudness of the input is controlling the cutoff
// frequency of a VCF ... The envelope follower is, therefore, replacing the
// contour generators that you would find in a conventional configuration."
//
// An auto-wah, over the same clip the timestretch example loads. The dry
// signal goes through the filter; a tap off it goes through the follower and
// out to the filter's cutoff, which is what makes the effect play itself.
const CLIP = "/synthlet/track14.mp3";

type Wah = {
  source: TimestretchAudioSourceWorkletNode;
  follower: ReturnType<typeof EnvelopeFollower>;
  depth: { value: number };
  base: { value: number };
  dispose(): void;
};

function EnvelopeFollowerExample() {
  const [wah, setWah] = useState<Wah | null>(null);
  const [playing, setPlaying] = useState(false);
  const [type, setType] = useState(EnvelopeFollowerType.Peak);
  const disposed = useRef(false);

  useEffect(() => {
    disposed.current = false;
    let built: Wah | undefined;

    createSynthAudioContext()
      .then(async (ac) => {
        const bytes = await fetch(CLIP).then((r) => r.arrayBuffer());
        const buffer = await ac.decodeAudioData(bytes);
        if (disposed.current) return;

        const source = TimestretchAudioSource(ac, { playbackRate: 1 });
        source.setBuffer(buffer);
        source.loop.value = 1;

        const base = Param(ac, { input: 300 });
        const depth = Param(ac, { input: 5000 });
        const follower = EnvelopeFollower(ac, {
          type,
          gain: 4,
          attack: 0.01,
          release: 0.1,
        });
        const amount = Gain(ac, { gain: depth });
        const filter = Svf(ac, {
          type: SvfType.LowPass,
          frequency: base,
          Q: 6,
        });

        source.connect(filter).connect(ac.destination);
        source.connect(follower).connect(amount).connect(filter.frequency);

        built = {
          source,
          follower,
          depth: depth.input,
          base: base.input,
          dispose() {
            [source, follower, amount, filter, base, depth].forEach((node) =>
              node.dispose(),
            );
          },
        };
        setWah(built);
      })
      .catch(() => setWah(null));

    return () => {
      disposed.current = true;
      built?.dispose();
    };
  }, []);

  if (!wah) return <div className="p-2">Loading…</div>;

  return (
    <>
      <div className="flex items-center gap-4 mb-4">
        <button
          className="border px-2 py-1 rounded bg-fd-primary text-fd-primary-foreground"
          onClick={() => {
            if (playing) wah.source.stop();
            else wah.source.start();
            setPlaying(!playing);
          }}
        >
          {playing ? "Stop" : "Play"}
        </button>
        <select
          value={type}
          onChange={(e) => {
            const next = parseInt(e.target.value);
            setType(next);
            wah.follower.type.value = next;
          }}
        >
          <option value={EnvelopeFollowerType.Peak}>Peak</option>
          <option value={EnvelopeFollowerType.Rms}>RMS</option>
        </select>
        <span className="text-sm opacity-70">
          Drop the depth to zero to hear the filter without the follower.
        </span>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <Slider
          label="Attack"
          inputClassName="col-span-2"
          min={0}
          max={0.2}
          step={0.001}
          param={wah.follower.attack}
          units="s"
        />
        <Slider
          label="Release"
          inputClassName="col-span-2"
          min={0.01}
          max={1}
          step={0.01}
          param={wah.follower.release}
          units="s"
        />
        <Slider
          label="Input gain"
          inputClassName="col-span-2"
          min={0}
          max={20}
          step={0.1}
          param={wah.follower.gain}
        />
        <Slider
          label="Depth"
          inputClassName="col-span-2"
          min={0}
          max={8000}
          param={wah.depth}
          units="Hz"
        />
        <Slider
          label="Base cutoff"
          inputClassName="col-span-2"
          min={80}
          max={2000}
          param={wah.base}
          units="Hz"
        />
      </div>
    </>
  );
}

export default () => (
  <ExamplePane label="Envelope follower">
    <EnvelopeFollowerExample />
  </ExamplePane>
);
