"use client";

import {
  Compound,
  Gain,
  Lfo,
  Oscillator,
  Param,
  PolyblepOscillator,
} from "synthlet";
import { useState } from "react";
import { ExamplePane } from "./components/ExamplePane";
import { SelectorParam } from "./components/Selector";
import { Slider } from "./components/Slider";
import { Spectrum } from "./components/Spectrum";
import { useSynth } from "./useSynth";

/**
 * `PolyblepOscillatorType` is `Sine = 0, Triangle = 1, Sawtooth = 2,
 * Square = 3` - brightness order, which happens to be exactly the order
 * `OscillatorNode` spells as strings. So one selector index drives both
 * oscillators with an array lookup and no mapping table.
 */
const WAVEFORMS = ["sine", "triangle", "sawtooth", "square"] as const;
const WAVEFORM_NAMES = ["Sine", "Triangle", "Saw", "Square"];

const BASE_FREQUENCY = 440;

/** Slider positions the reset buttons return to. */
const DEFAULT_FM_DEPTH = 0;
const DEFAULT_FM_RATE = 1;
const DEFAULT_VIBRATO = 0;
const DEFAULT_WIDTH = 0.5;
const DEFAULT_SYNC = 0;
const DEFAULT_VOLUME_DB = -24;

const POLY_COLOR = "#0ea5e9";
const NATIVE_COLOR = "#f59e0b";

/** Index into this is what `setAudible` takes; 0 is the PolyBLEP side. */
const AUDIBLE = ["PolyBLEP", "OscillatorNode"] as const;
const AUDIBLE_COLORS = [POLY_COLOR, NATIVE_COLOR];

/**
 * Both arms get the same analyser settings, so the two pictures are the same
 * measurement. It sits *before* the mute gain in each chain, which is what lets
 * the switch change what you hear without changing what you see.
 */
function createAnalyser(ac: AudioContext) {
  const node = ac.createAnalyser();
  node.fftSize = 4096;
  node.smoothingTimeConstant = 0.6;
  node.minDecibels = -100;
  node.maxDecibels = -10;
  return node;
}

function PolyblepSynth(ac: AudioContext) {
  const volume = Param.db(ac, DEFAULT_VOLUME_DB);

  // Through-zero FM: the LFO is connected to `frequency`, not to `detune`, so
  // the AudioParam *sums* it with the base pitch. That is linear FM, and once
  // the depth passes the base pitch the sum goes negative and the oscillator
  // runs its phase backwards instead of clamping flat.
  const fm = Lfo(ac, { frequency: DEFAULT_FM_RATE, gain: DEFAULT_FM_DEPTH });

  // Vibrato, for contrast: the same kind of node into `detune` instead, where
  // the units are cents and the effect is proportional. Having both on screen
  // is what makes "FM here is *linear*" audible rather than a claim - it is one
  // LFO shape doing two entirely different things depending on the inlet. The
  // rate is fixed at a musical 5.5 Hz; the FM arm keeps a rate slider because
  // sweeping *that* one into the audio range is the part worth hearing.
  const vibrato = Lfo(ac, { frequency: 5.5, gain: DEFAULT_VIBRATO });

  // Hard sync: a second oscillator, patched into the first one's `sync`. Every
  // rising zero crossing of the master's sawtooth restarts the slave's phase
  // mid-cycle, band-limited - so the master sets the pitch you hear and the
  // slave's Frequency slider sweeps the timbre instead of the note. It is the
  // one sound Web Audio cannot make at all: `OscillatorNode` has no reset.
  //
  // The master's own output is never connected to the speakers; it exists to
  // be an edge. At frequency 0 the phase freezes and it holds a constant -1,
  // which never crosses zero, so the bottom of the Sync slider is sync *off*
  // and the example opens as a plain oscillator.
  const master = PolyblepOscillator(ac, { frequency: DEFAULT_SYNC });

  const osc = PolyblepOscillator(ac, {
    frequency: fm,
    detune: vibrato,
    sync: master,
  });

  // The comparison arm. `Oscillator` is synthlet's wrapper around the native
  // `OscillatorNode` (`packages/synthlet/src/waa.ts`), so it is built with the
  // same `connectParams` and the same `disposable` as the worklet above - the
  // two chains differ in the oscillator and in nothing else. Both LFOs drive
  // it too, because a comparison where only one side is modulated is not one.
  const native = Oscillator(ac, {
    type: "sawtooth",
    frequency: fm,
    detune: vibrato,
  });

  // `connectParams` writes 0 into every connected param, so the base pitch has
  // to be put back - on both sides, identically. It is also what the Frequency
  // slider reads its initial position from.
  osc.frequency.value = BASE_FREQUENCY;
  native.frequency.value = BASE_FREQUENCY;

  const polyAnalyser = createAnalyser(ac);
  const nativeAnalyser = createAnalyser(ac);
  const polyGain = Gain.val(ac, 1);
  const nativeGain = Gain.val(ac, 0);
  const mix = Gain(ac, { gain: volume });

  // The mute gain, and the last node in the chain. It is deliberately *after*
  // the volume gain and after both analysers: muting therefore never writes to
  // the Volume slider's param - unmuting returns to whatever level was already
  // dialled in - and the two spectra keep drawing while the page is silent, so
  // a muted example is still a working demonstration.
  //
  // It starts at 0. An example that opens making a 440 Hz sawtooth at whatever
  // the machine's volume happens to be is a rude way to arrive on a docs page.
  const out = Gain.val(ac, 0);

  osc.connect(polyAnalyser).connect(polyGain).connect(mix);
  native.connect(nativeAnalyser).connect(nativeGain).connect(mix);
  mix.connect(out);

  // Two controls have to reach both oscillators at once, and `Slider` and
  // `SelectorParam` are typed against `{ value: number }` rather than
  // `AudioParam` - so a plain accessor object is all a fan-out needs.
  const waveform = {
    get value() {
      return osc.type.value;
    },
    set value(index: number) {
      osc.type.value = index;
      native.type = WAVEFORMS[index] ?? "sawtooth";
    },
  };

  const pitch = {
    get value() {
      return osc.frequency.value;
    },
    set value(hz: number) {
      osc.frequency.value = hz;
      native.frequency.value = hz;
    },
  };

  const setAudible = (index: number) => {
    const poly = index === 0;
    polyGain.gain.value = poly ? 1 : 0;
    nativeGain.gain.value = poly ? 0 : 1;
  };

  const setMuted = (muted: boolean) => {
    out.gain.value = muted ? 0 : 1;
    // Unmuting is a click, which is the user gesture the autoplay policy wants.
    // The context is a module-level singleton shared by every example on the
    // page, so it may well have been created while suspended.
    if (!muted && ac.state === "suspended") void ac.resume();
  };

  return Compound({
    output: out,
    owns: [
      osc,
      native,
      fm,
      vibrato,
      master,
      volume,
      polyGain,
      nativeGain,
      mix,
      // Raw `AnalyserNode`s have no `dispose`, so the cascade disconnects them;
      // the native oscillator keeps running once disconnected, so it is stopped
      // by hand. The audio context is a module-level singleton and outlives the
      // page, which is exactly why neither can be left behind.
      polyAnalyser,
      nativeAnalyser,
      () => native.stop(),
    ],
    exposes: {
      osc,
      fm,
      vibrato,
      master,
      waveform,
      pitch,
      polyAnalyser,
      nativeAnalyser,
      setAudible,
      setMuted,
      volume: volume.input,
    },
  });
}

function Example() {
  const synth = useSynth(PolyblepSynth);
  // Both mirror node state the synth owns: the mute gain opens at 0, and the
  // PolyBLEP arm is the one wired audible at construction.
  const [muted, setMuted] = useState(true);
  const [audible, setAudible] = useState(0);
  if (!synth) return null;

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
        <Spectrum
          analyser={synth.polyAnalyser}
          label="PolyblepOscillator"
          color={POLY_COLOR}
        />
        <Spectrum
          analyser={synth.nativeAnalyser}
          label="OscillatorNode (native)"
          color={NATIVE_COLOR}
        />
      </div>

      <div className="grid grid-cols-4 gap-4">
        <SelectorParam
          name="Waveform"
          inputClassName="col-span-2"
          param={synth.waveform}
          valueNames={WAVEFORM_NAMES}
        />

        <div>Audible</div>
        <button
          type="button"
          className="col-span-2 border px-2 py-1 rounded bg-fd-secondary"
          style={{ color: AUDIBLE_COLORS[audible] }}
          title="Switch which oscillator you hear. Both keep drawing."
          onClick={() => {
            const next = audible === 0 ? 1 : 0;
            setAudible(next);
            synth.setAudible(next);
          }}
        >
          {AUDIBLE[audible]}
        </button>
        <div />

        <Slider
          label="Frequency"
          inputClassName="col-span-2"
          min={20}
          max={8000}
          units="Hz"
          param={synth.pitch}
          defaultValue={BASE_FREQUENCY}
        />

        <Slider
          label="FM depth"
          inputClassName="col-span-2"
          min={0}
          max={3000}
          units="Hz"
          param={synth.fm.gain}
          defaultValue={DEFAULT_FM_DEPTH}
        />

        <Slider
          label="FM rate"
          inputClassName="col-span-2"
          min={1}
          max={1000}
          units="Hz"
          param={synth.fm.frequency}
          defaultValue={DEFAULT_FM_RATE}
        />

        <Slider
          label="Vibrato"
          inputClassName="col-span-2"
          min={0}
          max={100}
          units="c"
          param={synth.vibrato.gain}
          defaultValue={DEFAULT_VIBRATO}
        />

        <Slider
          label="Width *"
          inputClassName="col-span-2"
          min={0}
          max={1}
          param={synth.osc.width}
          defaultValue={DEFAULT_WIDTH}
        />

        <Slider
          label="Sync *"
          inputClassName="col-span-2"
          min={0}
          max={1000}
          units="Hz"
          param={synth.master.frequency}
          defaultValue={DEFAULT_SYNC}
        />
      </div>

      <p className="text-xs mt-2 opacity-70">
        * Width and Sync move the PolyBLEP side only — the native{" "}
        <code>OscillatorNode</code> has no equivalent for either. Everything
        else drives both at once, so the two spectra are the same signal from
        two oscillators.
      </p>

      <div className="flex items-center px-1 pt-2 mt-2 border-t border-fd-border gap-4">
        <button
          type="button"
          className="border px-2 py-1 rounded bg-fd-secondary text-nowrap"
          aria-pressed={muted}
          onClick={() => {
            const next = !muted;
            setMuted(next);
            synth.setMuted(next);
          }}
        >
          {muted ? "Unmute" : "Mute"}
        </button>
        {muted && (
          <span className="text-xs text-nowrap" style={{ color: NATIVE_COLOR }}>
            Unmute to hear
          </span>
        )}
        <Slider
          label="Volume"
          inputClassName="flex-grow"
          min={-36}
          max={0}
          param={synth.volume}
          units="dB"
          defaultValue={DEFAULT_VOLUME_DB}
        />
      </div>
    </>
  );
}

export default () => (
  <ExamplePane label="Polyblep oscillator">
    <Example />
  </ExamplePane>
);
