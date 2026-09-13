"use client";

import { useState } from "react";
import { Compound, Decimator, Gain, Oscillator, Param } from "synthlet";
import { CheckboxParam } from "./components/CheckboxParam";
import { ExamplePane } from "./components/ExamplePane";
import { Scope } from "@/components/audio/Scope";
import { Slider } from "./components/Slider";
import { Spectrum } from "@/components/audio/Spectrum";
import { useSynth } from "@/components/audio/useSynth";

// Synth Secrets Part 17 as a patch you can turn: one sine, one converter, and
// the two filters the chapter spends its second half on.
//
// The example opens on the *staircase* case - a low tone held slowly, where the
// `Scope` shows steps you can count - because that is the picture the chapter's
// most famous paragraph is arguing about. The three preset buttons jump to the
// book's own aliasing figures, which are a `Spectrum` story instead.

const DEFAULT_FREQUENCY = 500;
const DEFAULT_RATE = 8000;
const DEFAULT_BITS = 24;
const DEFAULT_VOLUME_DB = -20;

const SCOPE_COLOR = "#0ea5e9";
const SPECTRUM_COLOR = "#f59e0b";

/**
 * Reid's Figures 15, 17 and 18: one 10 kHz sine at three sample rates.
 *
 * Figure 15's 50 kHz is above the context's own rate, so the hold
 * short-circuits and the module is a literal wire - which is the honest
 * rendering of "more than sufficient to describe the sine wave accurately".
 */
const PRESETS = [
  {
    label: "Fig 15 · 50 kHz",
    title: "10 kHz sampled at 50 kHz: no aliasing, nothing happens",
    frequency: 10000,
    rate: 50000,
    reads: "10 kHz, where you put it",
  },
  {
    label: "Fig 17 · 13.33 kHz",
    title: "10 kHz sampled at 13.33 kHz: folds to 3.33 kHz",
    frequency: 10000,
    rate: 13333,
    reads: "3.33 kHz — the fold",
  },
  {
    label: "Fig 18 · 11.11 kHz",
    title: "10 kHz sampled at 11.11 kHz: folds to 1.11 kHz",
    frequency: 10000,
    rate: 11111,
    reads: "1.11 kHz — further down",
  },
];

/** The scope's window. See the comment at its call site. */
const SCOPE_FFT = 256;

function createAnalyser(ac: AudioContext, fftSize: number) {
  const node = ac.createAnalyser();
  node.fftSize = fftSize;
  node.smoothingTimeConstant = 0.6;
  node.minDecibels = -100;
  node.maxDecibels = -10;
  return node;
}

function createSynth(ac: AudioContext) {
  const frequency = Param(ac, { input: DEFAULT_FREQUENCY });
  const volume = Param.db(ac, DEFAULT_VOLUME_DB);

  const osc = Oscillator(ac, { type: "sine", frequency });
  const decimator = Decimator(ac, {
    rate: DEFAULT_RATE,
    bits: DEFAULT_BITS,
    antialias: 0,
    reconstruct: 0,
  });

  // A short window, so a held tone reads as steps rather than as a fuzzy sine:
  // 256 samples is 5.8 ms, which is six cycles of the 500 Hz default and about
  // four samples per step at `rate: 8000`. The spectrum wants the opposite -
  // resolution - so the two analysers are deliberately not one.
  const scopeAnalyser = createAnalyser(ac, SCOPE_FFT);
  const spectrumAnalyser = createAnalyser(ac, 4096);

  const level = Gain(ac, { gain: volume });
  // The mute gain is last, after both analysers and after the volume: muting
  // never writes to the Volume slider's param, and the two pictures keep
  // drawing while the page is silent, so a muted example still demonstrates
  // something. It opens at 0 - a docs page that starts emitting a 10 kHz tone
  // at whatever the machine's volume happens to be is a rude way to arrive.
  const out = Gain.val(ac, 0);

  osc
    .connect(decimator)
    .connect(scopeAnalyser)
    .connect(spectrumAnalyser)
    .connect(level)
    .connect(out);

  const setMuted = (muted: boolean) => {
    out.gain.value = muted ? 0 : 1;
    // Unmuting is the click the autoplay policy wants. The context is a
    // module-level singleton shared by every example on the page, so it may
    // well have been created while suspended.
    if (!muted && ac.state === "suspended") void ac.resume();
  };

  const applyPreset = (index: number) => {
    const preset = PRESETS[index];
    frequency.input.value = preset.frequency;
    decimator.rate.value = preset.rate;
  };

  return Compound({
    output: out,
    owns: [
      osc,
      decimator,
      level,
      frequency,
      volume,
      scopeAnalyser,
      spectrumAnalyser,
      // A native `OscillatorNode` keeps running once disconnected, and the
      // context outlives the page.
      () => osc.stop(),
    ],
    exposes: {
      decimator,
      scopeAnalyser,
      spectrumAnalyser,
      setMuted,
      applyPreset,
      frequency: frequency.input,
      volume: volume.input,
    },
  });
}

function Example() {
  const synth = useSynth(createSynth);
  const [muted, setMuted] = useState(true);
  // Bumped by every preset, and used as the sliders' `key`: `Slider` reads
  // `param.value` when it mounts and keeps its own state after that, so
  // remounting is how a preset moves the knobs it wrote behind their backs.
  const [applied, setApplied] = useState(0);
  const [reads, setReads] = useState<string | null>(null);
  if (!synth) return null;

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
        <Scope
          analyser={synth.scopeAnalyser}
          label="Output — the staircase"
          color={SCOPE_COLOR}
        />
        <Spectrum
          analyser={synth.spectrumAnalyser}
          label="Output — where the energy actually is"
          color={SPECTRUM_COLOR}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-4">
        {PRESETS.map((preset, index) => (
          <button
            key={preset.label}
            type="button"
            title={preset.title}
            className="border px-2 py-1 rounded bg-fd-secondary text-nowrap"
            onClick={() => {
              synth.applyPreset(index);
              setReads(preset.reads);
              setApplied((n) => n + 1);
            }}
          >
            {preset.label}
          </button>
        ))}
        <span className="text-sm opacity-70">
          {reads ? `reads ${reads}` : "a 10 kHz sine at three sample rates"}
        </span>
      </div>

      <div className="grid grid-cols-4 gap-4" key={applied}>
        <Slider
          label="Tone"
          inputClassName="col-span-2"
          min={100}
          max={12000}
          param={synth.frequency}
          units="Hz"
          defaultValue={DEFAULT_FREQUENCY}
        />
        <Slider
          label="Sample rate"
          inputClassName="col-span-2"
          min={1000}
          max={50000}
          param={synth.decimator.rate}
          units="Hz"
          defaultValue={DEFAULT_RATE}
        />
        <Slider
          label="Bit depth"
          inputClassName="col-span-2"
          min={1}
          max={24}
          step={0.5}
          param={synth.decimator.bits}
          units=" bits"
          defaultValue={DEFAULT_BITS}
        />
        <Slider
          label="Volume"
          inputClassName="col-span-2"
          min={-60}
          max={0}
          param={synth.volume}
          units="dB"
          defaultValue={DEFAULT_VOLUME_DB}
        />
      </div>

      <div className="flex flex-wrap items-center gap-6 mt-4 pt-2 border-t border-fd-border">
        <CheckboxParam
          name="Anti-alias (before the hold)"
          param={synth.decimator.antialias}
        />
        <CheckboxParam
          name="Reconstruct (after the quantiser)"
          param={synth.decimator.reconstruct}
        />
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
      </div>

      <p className="text-xs mt-3 opacity-70">
        Sample rate at or above 44.1 kHz is a bypass — the module is a wire, and
        that is what <em>Fig 15</em> sounds like. Below it, the hold clock runs
        free, so a rate that is not a divisor of the context&rsquo;s (13.33 kHz
        is a divisor of nothing) jitters the hold period by one sample, which is
        the low-level skirt either side of each peak. At <code>bits: 1</code>{" "}
        there are three levels — −1, 0 and 1 — because zero is a level rather
        than a band edge.
      </p>
    </>
  );
}

export default () => (
  <ExamplePane label="Decimator">
    <Example />
  </ExamplePane>
);
