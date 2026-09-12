"use client";

import { Compound, Gain, Oscillator, Param, RingMod } from "synthlet";
import { ExamplePane } from "./components/ExamplePane";
import { Slider } from "./components/Slider";
import { useSynth } from "./useSynth";

// Reid's Figure 10 as a patch you can turn: a carrier, a modulator, and the
// one slider the ARP 2600 had as a switch. At `offset: 0` the two inputs are
// gone from the spectrum and only 100 Hz and 500 Hz remain; sweeping `offset`
// to 1 fades the 300 Hz carrier back in, which is the whole chapter in one
// gesture.
function createSynth(ac: AudioContext) {
  const carrierFrequency = Param(ac, { input: 300 });
  const modulatorFrequency = Param(ac, { input: 200 });
  const offset = Param(ac, { input: 0 });
  const volume = Param.db(ac, -12);

  const carrier = Oscillator(ac, { frequency: carrierFrequency });
  const modulator = Oscillator(ac, { frequency: modulatorFrequency });

  const ring = RingMod(ac, { modulator, offset });
  const out = Gain(ac, { gain: volume });

  carrier.connect(ring).connect(out);

  return Compound({
    output: out,
    owns: [carrier, ring, carrierFrequency, modulatorFrequency, offset, volume],
    exposes: {
      carrierFrequency: carrierFrequency.input,
      modulatorFrequency: modulatorFrequency.input,
      offset: offset.input,
      volume: volume.input,
    },
  });
}

function Example() {
  const synth = useSynth(createSynth);
  if (!synth) return null;

  return (
    <div className="grid grid-cols-4 gap-4">
      <Slider
        label="Carrier"
        inputClassName="col-span-2"
        min={50}
        max={2000}
        param={synth.carrierFrequency}
        units="Hz"
      />
      <Slider
        label="Modulator"
        inputClassName="col-span-2"
        min={1}
        max={2000}
        param={synth.modulatorFrequency}
        units="Hz"
      />
      <Slider
        label="Offset"
        inputClassName="col-span-2"
        min={0}
        max={1}
        step={0.01}
        param={synth.offset}
        defaultValue={0}
      />
      <Slider
        label="Volume"
        inputClassName="col-span-2"
        min={-60}
        max={0}
        param={synth.volume}
        units="dB"
      />
    </div>
  );
}

export default () => (
  <ExamplePane label="Ring modulator">
    <Example />
  </ExamplePane>
);
