"use client";

import {
  AdsrAmp,
  Compound,
  Gain,
  Param,
  PolyblepOscillator,
  WavetableOscillator,
} from "synthlet";
import { ExamplePane, GateButton } from "./components/ExamplePane";
import { Slider } from "./components/Slider";
import { useSynth } from "./useSynth";

const SyncSynth = (ac: AudioContext) => {
  const gate = Param(ac);
  const volume = Param.db(ac, -30);

  // The master. A sawtooth, because its one rising zero crossing per cycle *is*
  // the gate: synthlet's contract is "on while positive", so an oscillator
  // patched into a gate line fires once a cycle with no shaping in between.
  // Its own output goes nowhere - only its edges are used - and it is what the
  // ear hears as the pitch of the whole patch.
  const master = PolyblepOscillator(ac, { frequency: 110, type: 0 });

  // The slave. Sweep its frequency and the note stays at 110 Hz while the
  // formant moves, which is the sound hard sync exists for. Everything above
  // the master's pitch in this spectrum is the restart, so it is worth knowing
  // that the restart is band-limited: the step *and* the corner it makes are
  // corrected with the same 4-point B-spline kernels
  // `PolyblepOscillator` uses, which is worth 17.6 to 33.9 dB of alias
  // rejection over a plain phase-to-zero reset, and costs two samples of
  // latency.
  const slave = WavetableOscillator(ac, {
    frequency: 275,
    morph: 0.66,
    sync: master,
  });

  const amp = AdsrAmp(ac, { gate });
  const out = Gain(ac, { gain: volume });

  slave.connect(amp).connect(out);

  return Compound({
    output: out,
    owns: [master, slave, amp, gate, volume],
    exposes: {
      master: master.frequency,
      slave: slave.frequency,
      morph: slave.morph,
      gate: gate.input,
      volume: volume.input,
    },
  });
};

function WavetableSyncExample() {
  const synth = useSynth(SyncSynth);

  if (!synth) return null;

  return (
    <>
      <div className="grid grid-cols-4 gap-4">
        <Slider
          label="Master"
          labelClassName="text-right"
          inputClassName="col-span-2"
          min={55}
          max={440}
          units=" Hz"
          param={synth.master}
        />
        <Slider
          label="Slave"
          labelClassName="text-right"
          inputClassName="col-span-2"
          min={55}
          max={4000}
          units=" Hz"
          param={synth.slave}
        />
        <Slider
          label="Morph"
          labelClassName="text-right"
          inputClassName="col-span-2"
          min={0}
          max={1}
          step={0.01}
          param={synth.morph}
        />
      </div>
      <div className="flex mt-4">
        <GateButton gate={synth.gate} />
      </div>
      <div className="flex px-1 pt-2 mt-2 border-t border-fd-border gap-4">
        <Slider
          label="Volume"
          inputClassName="flex-grow"
          min={-36}
          max={0}
          units="dB"
          param={synth.volume}
        />
      </div>
    </>
  );
}

export default () => (
  <ExamplePane label="Wavetable hard sync">
    <WavetableSyncExample />
  </ExamplePane>
);
