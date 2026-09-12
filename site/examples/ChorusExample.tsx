"use client";

import { useState } from "react";
import {
  AdsrAmp,
  Chorus,
  ChorusMode,
  CHORUS_MODE_DEFAULTS,
  Compound,
  Gain,
  Oscillator,
  Param,
} from "synthlet";
import { ExamplePane, GateButton } from "./components/ExamplePane";
import { Slider } from "./components/Slider";
import { useSynth } from "./useSynth";

// A detuned saw stack, not the single 440 Hz sine this demo used to have. A
// chorus on one oscillator demonstrates nothing: the effect is about what
// happens to a *stack*, and three saws seven cents apart is the source people
// actually reach for it with.
const DETUNE = [-7, 0, 7];

function ChorusSynth(ac: AudioContext) {
  const gate = Param(ac, { input: 0 });
  const volume = Param.db(ac, -14);
  const oscillators = DETUNE.map((detune) =>
    Oscillator(ac, { type: "sawtooth", frequency: 110, detune }),
  );
  const amp = AdsrAmp(ac, { gate, attack: 0.02, decay: 0.3, sustain: 0.8 });
  const chorus = Chorus(ac);
  const out = Gain(ac, { gain: volume });

  for (const osc of oscillators) osc.connect(amp);
  amp.connect(chorus).connect(out);

  return Compound({
    output: out,
    owns: [...oscillators, amp, chorus, gate, volume],
    exposes: { chorus, gate: gate.input, volume: volume.input },
  });
}

const VOICINGS = [
  {
    mode: ChorusMode.Juno,
    name: "Juno",
    what: "Two voices in antiphase on a 3 ms centre. The synth chorus - put it on anything.",
  },
  {
    mode: ChorusMode.Ensemble,
    name: "Ensemble",
    what: "Three taps 120° apart on two incommensurate LFOs. String-machine density, for stacks and pads.",
  },
  {
    mode: ChorusMode.Dimension,
    name: "Dimension",
    what: "Antiphase with a difference output. Wide without the vibrato - for sustained pads and buses.",
  },
];

function Example() {
  const synth = useSynth(ChorusSynth);
  // The voicing is the choice that matters, so it comes first and the knobs
  // follow it: selecting a mode applies that mode's own defaults, which is
  // what makes each one a complete answer rather than a starting point.
  const [mode, setMode] = useState<number>(ChorusMode.Juno);
  const [bypassed, setBypassed] = useState(false);
  const [mix, setMix] = useState(CHORUS_MODE_DEFAULTS[ChorusMode.Juno].mix);

  if (!synth) return null;

  const applyMode = (next: number) => {
    const defaults = CHORUS_MODE_DEFAULTS[next];
    synth.chorus.mode.value = next;
    synth.chorus.rate.value = defaults.rate;
    synth.chorus.depth.value = defaults.depth;
    synth.chorus.width.value = defaults.width;
    setMix(defaults.mix);
    if (!bypassed) synth.chorus.mix.value = defaults.mix;
    setMode(next);
  };

  const toggleBypass = (next: boolean) => {
    setBypassed(next);
    // `mix: 0` is an exact bypass - the dry gain is `1 - 0.5*mix`, so at 0 the
    // output is the input sample for sample.
    synth.chorus.mix.value = next ? 0 : mix;
  };

  return (
    <>
      <div className="grid grid-cols-4 gap-2 items-center">
        <div>Voicing</div>
        <select
          className="col-span-2"
          value={mode}
          onChange={(e) => applyMode(parseInt(e.target.value))}
        >
          {VOICINGS.map((voicing) => (
            <option key={voicing.mode} value={voicing.mode}>
              {voicing.name}
            </option>
          ))}
        </select>
        <label className="text-sm">
          <input
            className="mr-2"
            type="checkbox"
            checked={bypassed}
            onChange={(e) => toggleBypass(e.target.checked)}
          />
          Bypass
        </label>

        <div className="col-span-4 text-sm opacity-70">
          {VOICINGS.find((v) => v.mode === mode)?.what}
        </div>

        <Slider
          key={`rate-${mode}`}
          label="Rate"
          inputClassName="col-span-2"
          param={synth.chorus.rate}
          min={0}
          max={7}
          units="Hz"
        />
        <Slider
          key={`depth-${mode}`}
          label="Depth"
          inputClassName="col-span-2"
          param={synth.chorus.depth}
        />
        <Slider
          key={`mix-${mode}-${bypassed}`}
          label="Mix"
          inputClassName="col-span-2"
          param={synth.chorus.mix}
        />
        <Slider
          key={`width-${mode}`}
          label="Width"
          inputClassName="col-span-2"
          param={synth.chorus.width}
        />
      </div>
      <GateButton gate={synth.gate} />
    </>
  );
}

export default () => (
  <ExamplePane label="Chorus">
    <Example />
  </ExamplePane>
);
