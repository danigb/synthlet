"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import {
  ClaveDrum,
  Compound,
  Gain,
  LevelMeter,
  LevelMeterUI,
  type LevelMeterWorkletNode,
  Param,
  dbToUnit,
  formatDb,
} from "synthlet";
import { ExamplePane, TriggerButton } from "./components/ExamplePane";
import { Slider } from "./components/Slider";
import { useSynth } from "./useSynth";

const MIN_DB = -60;
const MAX_DB = 0;

function MeterSynth(ac: AudioContext) {
  // A percussive source, because a meter is about transients: peak jumps to the
  // top of the hit, RMS follows slowly behind it, the hold marker parks at the
  // maximum, and the clip latch stays lit once drive pushes it past 0 dBFS.
  const drum = ClaveDrum(ac);
  const drive = Param.db(ac, 0);
  const input = Gain(ac, { gain: drive });
  const meter = LevelMeter(ac);
  const out = Gain(ac);

  drum.connect(input).connect(meter).connect(out);

  return Compound({
    output: out,
    owns: [drum, drive, input, meter],
    exposes: { meter, trigger: drum.trigger, drive: drive.input },
  });
}

// The README's "Build your own" hook, pasted. `meter.subscribe` is stable for
// the life of the node, so React never resubscribes.
function useLevels(meter: LevelMeterWorkletNode) {
  useSyncExternalStore(
    meter.subscribe,
    () => meter.getLevels().version,
    () => 0,
  );
  return meter.getLevels();
}

// Recipe 1: no canvas. One row per channel, width from `dbToUnit`, a hold
// marker positioned the same way, and the clip latch as a colour.
function DomMeter({ meter }: { meter: LevelMeterWorkletNode }) {
  const levels = useLevels(meter);
  const channels = Math.max(1, levels.channelCount);

  return (
    <div className="flex flex-col gap-1">
      {Array.from({ length: channels }, (_, c) => (
        <div key={c} className="flex items-center gap-2">
          <div className="relative h-3 flex-grow overflow-hidden rounded-sm bg-black">
            <div
              className={
                levels.clipped(c)
                  ? "h-full bg-red-700"
                  : "h-full bg-green-600 transition-[width] duration-75"
              }
              style={{
                width: `${dbToUnit(levels.peak(c), MIN_DB, MAX_DB) * 100}%`,
              }}
            />
            <div
              className="absolute top-0 h-full w-0.5 bg-white"
              style={{
                left: `${dbToUnit(levels.hold(c), MIN_DB, MAX_DB) * 100}%`,
              }}
            />
          </div>
          <div className="w-14 text-right font-mono text-xs tabular-nums">
            {formatDb(levels.peak(c), 1)}
          </div>
        </div>
      ))}
    </div>
  );
}

// Recipe 3: the canvas renderer, reading the same meter. `attach` owns the
// animation frame, the devicePixelRatio sizing and the resize handling - and
// shares its frame with every other meter on the page, this one included.
function CanvasMeter({ meter }: { meter: LevelMeterWorkletNode }) {
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!canvas.current) return;
    const ui = new LevelMeterUI({ minDb: MIN_DB, maxDb: MAX_DB });
    ui.attach(canvas.current, meter);
    return () => ui.detach();
  }, [meter]);

  return <canvas ref={canvas} className="h-16 w-full" />;
}

function Example() {
  const synth = useSynth(MeterSynth);
  if (!synth) return null;

  return (
    <>
      {/* The same meter, drawn twice: the numbers are the product and the
          canvas is one way to look at them. */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <div className="mb-1 text-xs opacity-60">subscribe + dbToUnit</div>
          <DomMeter meter={synth.meter} />
        </div>
        <div>
          <div className="mb-1 text-xs opacity-60">LevelMeterUI</div>
          <CanvasMeter meter={synth.meter} />
        </div>
      </div>
      <div className="mt-4 grid grid-cols-4 gap-2">
        {/* Past about +12 dB the clip latch lights and stays lit. */}
        <Slider
          label="Drive"
          inputClassName="col-span-2"
          param={synth.drive}
          min={-24}
          max={24}
          units=" dB"
        />
      </div>
      <TriggerButton className="mt-4" trigger={synth.trigger} />
    </>
  );
}

export default () => (
  <ExamplePane label="LevelMeter">
    <Example />
  </ExamplePane>
);
