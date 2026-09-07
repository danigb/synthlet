"use client";

import {
  AdsrAmp,
  Clock,
  Compound,
  Gain,
  Lfo,
  LfoType,
  Param,
  PolyblepOscillator,
} from "synthlet";
import { CheckboxParam } from "./components/CheckboxParam";
import { ExamplePane, GateButton } from "./components/ExamplePane";
import { Scope } from "./components/Scope";
import { SelectorParam } from "./components/Selector";
import { Slider } from "./components/Slider";
import { useSynth } from "./useSynth";

/** Every `LfoType`, in enum order, so the index *is* the parameter value. */
const SHAPES = [
  "None",
  "Sine",
  "Triangle",
  "RampUp",
  "RampDown",
  "Square",
  "ExpRampUp",
  "ExpRampDown",
  "ExpTriangle",
  "RandSampleHold",
  "Impulse",
  "RandSmooth",
  "Drift",
] as const;

const CARRIER = 220;

/**
 * The longest window an `AnalyserNode` will give: 32768 samples, 0.74 s at
 * 44.1 kHz. The default rate below is chosen so a couple of cycles fit in it.
 */
const SCOPE_WINDOW = 32768;

function LfoSynth(ac: AudioContext) {
  const gate = Param(ac);
  const bpm = Param(ac, { input: 120 });

  // A `Clock` for the tempo-sync demonstration. `clock` itself is a phase ramp
  // and `clock.gate` is the gate - the LFO wants the gate.
  const clock = Clock(ac, { bpm });

  // The switch is a **gain of zero**, not a disconnection: a gate line that
  // never crosses zero fires nothing, which is the contract's own answer, and
  // rewiring a graph from a React handler is how nodes get left behind.
  const sync = Param(ac, { input: clock.gate, gain: 0 });

  const lfo = Lfo(ac, {
    type: LfoType.Sine,
    frequency: 4,
    // `gain` stays at 1 so the scope draws the *shape*. The vibrato depth is a
    // `GainNode` between the LFO and its destination, which is what this
    // package's README recommends for exactly this reason - it is a-rate and
    // native, where `Lfo.gain` is read once per block.
    gain: 1,
    sync,
    gate,
  });

  const scope = ac.createAnalyser();
  scope.fftSize = SCOPE_WINDOW;

  // Hz of pitch deviation. `AudioParam` sums its inputs with the intrinsic
  // value, so this is `CARRIER + depth * lfo`.
  const depth = Gain(ac, { gain: 30 });

  const osc = PolyblepOscillator(ac, { frequency: CARRIER });
  const amp = AdsrAmp(ac, { gate, attack: 0.02, release: 0.3 });
  const volume = Param.db(ac, -12);
  const out = Gain(ac, { gain: volume });

  lfo.connect(scope);
  lfo.connect(depth).connect(osc.frequency);
  osc.connect(amp).connect(out);

  return Compound({
    output: out,
    // A raw `AnalyserNode` has no `dispose`, so the cascade disconnects it.
    owns: [lfo, depth, osc, amp, clock, sync, gate, bpm, volume, scope],
    exposes: {
      scope,
      type: lfo.type,
      frequency: lfo.frequency,
      delay: lfo.delay,
      attack: lfo.attack,
      depth: depth.gain,
      syncAmount: sync.gain,
      bpm: bpm.input,
      gate: gate.input,
    },
  });
}

function Example() {
  const synth = useSynth(LfoSynth);
  if (!synth) return null;

  return (
    <>
      <Scope analyser={synth.scope} label="LFO output" />

      <div className="grid grid-cols-[6rem_1fr_4rem] gap-2 items-center mt-4">
        <SelectorParam
          name="Shape"
          labelClassName="text-right"
          valueNames={SHAPES}
          param={synth.type}
        />
        <Slider
          label="Rate"
          labelClassName="text-right"
          min={0.1}
          max={20}
          step={0.1}
          units="Hz"
          param={synth.frequency}
        />
        <Slider
          label="Depth"
          labelClassName="text-right"
          min={0}
          max={200}
          step={1}
          units="Hz"
          param={synth.depth}
        />
      </div>

      <div className="mt-4 pt-2 border-t border-fd-border">
        <div className="text-sm mb-2">
          Delayed vibrato — hold the note and the depth fades in
        </div>
        <div className="grid grid-cols-[6rem_1fr_4rem] gap-2 items-center">
          <Slider
            label="Delay"
            labelClassName="text-right"
            min={0}
            max={2}
            step={0.01}
            units="s"
            param={synth.delay}
          />
          <Slider
            label="Attack"
            labelClassName="text-right"
            min={0}
            max={3}
            step={0.01}
            units="s"
            param={synth.attack}
          />
        </div>
        <div className="mt-2">
          <GateButton gate={synth.gate} />
        </div>
      </div>

      <div className="mt-4 pt-2 border-t border-fd-border">
        <div className="text-sm mb-2">
          Tempo sync — <code>clock.gate</code> into <code>lfo.sync</code>, so
          the LFO restarts on every beat
        </div>
        <div className="grid grid-cols-[6rem_1fr_4rem] gap-2 items-center">
          <Slider
            label="Tempo"
            labelClassName="text-right"
            min={40}
            max={240}
            step={1}
            units="bpm"
            param={synth.bpm}
          />
        </div>
        <CheckboxParam
          className="mt-2 inline-block"
          name="Sync to clock"
          param={synth.syncAmount}
        />
      </div>
    </>
  );
}

export default () => (
  <ExamplePane label="LFO">
    <Example />
  </ExamplePane>
);
