/*
 * Two layers, and the honest verdict at the end of them.
 *
 * Parts 42 to 45 take the Roland JX10's *Piano 1-B* apart. DCO1 is an 8'
 * square and is the master; DCO2 is a 4' sawtooth with Cross Mod set to Sync1,
 * Tune +2 and Fine Tune +10 - so the slave sits **fourteen semitones and ten
 * cents** above the master, and Envelope Depth 99 throws it up and drops it
 * back in a quarter of a second. That sweep through the sync is the "huge
 * tonal blip" Reid uses for the hammer strike, and it is the whole of the
 * thunk.
 *
 * The master is audible too, at about a quarter of the mix (his Mixer 24/99),
 * which is why the note changes character as it goes on rather than just
 * getting quieter.
 *
 * Layer B is *Piano 1-A*, whose Envelope Depth is zero: a plain detuned saw
 * through a low-pass, at Dual Detune +13. Reid's rule for why layering works
 * is that the two sounds have to be "similar enough to be indistinguishable
 * within the composite, but different enough to create a sound that is more
 * interesting than either" - 1-B supplies the thunk and 1-A the body.
 *
 * And then Part 45's verdict, which the lesson does not hide: even carefully
 * programmed on a large modular, it sounds like a Wurlitzer or a Pianet. It
 * does not sound like a Bosendorfer.
 *
 * No diagram: two layers is two sources, and 13b explains why that cannot be
 * drawn yet.
 */

import {
  AdEnv,
  AdsrAmp,
  Compound,
  Gain,
  Param,
  PolyblepOscillator,
  PolyblepOscillatorType,
  Svf,
  SvfType,
  toFrequency,
  toMidi,
} from "synthlet";
import { definePatch } from "../define";

const DEFAULT_NOTE = "C3";

/** Tune +2, Fine Tune +10: fourteen semitones and ten cents above the master. */
const SLAVE = Math.pow(2, 14.1 / 12);

/** Reid's Mixer 24/99: the master is a quarter of the layer, and it matters. */
const MASTER_LEVEL = 0.25;

const DEFAULT_SWEEP = 3000;
const DEFAULT_SWEEP_DECAY = 0.25;
const DEFAULT_DETUNE = 13;
const DEFAULT_DECAY = 1.2;
const DEFAULT_BALANCE = 0.5;

/** A fixed trim, after the analyser. */
const LEVEL = 0.125;
const CROSSFADE = 0.01;

function build(ac: AudioContext) {
  const start = toFrequency(toMidi(DEFAULT_NOTE));
  const gate = Param(ac);

  // --- Layer A: the thunk (Piano 1-B) -------------------------------------
  const master = PolyblepOscillator(ac, {
    type: PolyblepOscillatorType.Square,
    frequency: start,
  });
  const slave = PolyblepOscillator(ac, {
    type: PolyblepOscillatorType.Sawtooth,
    frequency: start * SLAVE,
    sync: master,
  });
  const sweepEnv = AdEnv(ac, {
    attack: 0.001,
    decay: DEFAULT_SWEEP_DECAY,
    gain: DEFAULT_SWEEP,
  });
  const masterGain = Gain.val(ac, MASTER_LEVEL);
  const layerA = Gain.val(ac, 1);
  const ampA = AdsrAmp(ac, {
    gate,
    attack: 0.002,
    decay: DEFAULT_DECAY,
    sustain: 0,
    release: 0.3,
  });
  const gainA = Gain.val(ac, 1 - DEFAULT_BALANCE);

  // --- Layer B: the body (Piano 1-A) --------------------------------------
  const oscB = PolyblepOscillator(ac, {
    type: PolyblepOscillatorType.Sawtooth,
    frequency: start,
    detune: DEFAULT_DETUNE,
  });
  const body = Svf(ac, {
    type: SvfType.LowPass,
    frequency: 2500,
    Q: Math.SQRT1_2,
  });
  const ampB = AdsrAmp(ac, {
    gate,
    attack: 0.002,
    decay: DEFAULT_DECAY,
    sustain: 0,
    release: 0.3,
  });
  const gainB = Gain.val(ac, DEFAULT_BALANCE);

  const mix = Gain.val(ac, 1);

  const analyser = ac.createAnalyser();
  analyser.fftSize = 4096;
  analyser.smoothingTimeConstant = 0.6;

  const level = Gain.val(ac, LEVEL);
  const out = Gain.val(ac, 0);

  master.connect(masterGain).connect(layerA);
  slave.connect(layerA);
  layerA.connect(ampA).connect(gainA).connect(mix);
  // Envelope Depth 99: the slave is thrown up and falls back through the sync.
  sweepEnv.connect(slave.frequency);

  oscB.connect(body).connect(ampB).connect(gainB).connect(mix);
  mix.connect(analyser).connect(level).connect(out);

  let balanceAmount = DEFAULT_BALANCE;
  const balance = {
    get value() {
      return balanceAmount;
    },
    set value(next: number) {
      balanceAmount = Math.min(1, Math.max(0, next));
      const now = ac.currentTime;
      gainA.gain.setTargetAtTime(1 - balanceAmount, now, CROSSFADE);
      gainB.gain.setTargetAtTime(balanceAmount, now, CROSSFADE);
    },
  };

  let decayTime = DEFAULT_DECAY;
  const decay = {
    get value() {
      return decayTime;
    },
    set value(next: number) {
      decayTime = Math.max(0.2, next);
      ampA.decay.value = decayTime;
      ampB.decay.value = decayTime;
    },
  };

  const held = new Set<string>();
  const play = (note: string) => {
    held.add(note);
    const frequency = toFrequency(toMidi(note));
    master.frequency.value = frequency;
    slave.frequency.value = frequency * SLAVE;
    oscB.frequency.value = frequency;
    gate.input.value = 1;
    const now = ac.currentTime;
    sweepEnv.trigger.cancelScheduledValues(now);
    sweepEnv.trigger.setValueAtTime(1, now);
    sweepEnv.trigger.setValueAtTime(0, now + 0.005);
  };
  const stop = (note: string) => {
    held.delete(note);
    if (held.size === 0) gate.input.value = 0;
  };

  return Compound({
    output: out,
    owns: [
      gate,
      master,
      slave,
      sweepEnv,
      masterGain,
      layerA,
      ampA,
      gainA,
      oscB,
      body,
      ampB,
      gainB,
      mix,
      analyser,
      level,
    ],
    exposes: {
      master,
      slave,
      sweepEnv,
      ampA,
      oscB,
      body,
      ampB,
      analyser,
      balance,
      decay,
      play,
      stop,
    },
  });
}

export default definePatch({
  id: "recipes/piano",
  label: "Piano",
  build,
  controls: [
    {
      id: "sweep",
      kind: "slider",
      label: "Sync sweep",
      help: "Envelope Depth 99: how far the synced oscillator is thrown at note-on.",
      param: (s) => s.sweepEnv.gain,
      min: 0,
      max: 6000,
      step: 10,
      unit: "Hz",
      default: DEFAULT_SWEEP,
    },
    {
      id: "sweepDecay",
      kind: "slider",
      label: "Sweep decay",
      help: "How long the blip lasts. A hammer strike is over before the note is.",
      param: (s) => s.sweepEnv.decay,
      min: 0.02,
      max: 1,
      scale: "time",
      unit: "s",
      default: DEFAULT_SWEEP_DECAY,
    },
    {
      id: "balance",
      kind: "slider",
      label: "Layer balance",
      help: "All thunk at zero, all body at one. Neither alone is a piano.",
      param: (s) => s.balance,
      min: 0,
      max: 1,
      step: 0.01,
      default: DEFAULT_BALANCE,
    },
    {
      id: "detune",
      kind: "slider",
      label: "Detune",
      help: "Dual Detune +13: how far the body layer sits from the thunk.",
      param: (s) => s.oscB.detune,
      min: 0,
      max: 30,
      step: 1,
      unit: "cents",
      default: DEFAULT_DETUNE,
    },
    {
      id: "decay",
      kind: "slider",
      label: "Decay",
      help: "Both layers together. A piano has no sustain level, only a long fall.",
      param: (s) => s.decay,
      min: 0.2,
      max: 4,
      scale: "time",
      unit: "s",
      default: DEFAULT_DECAY,
    },
  ],
  views: [
    {
      kind: "keyboard",
      label: "Keyboard",
      noteOn: (s) => (note) => s.play(note),
      noteOff: (s) => (note) => s.stop(note),
      options: { from: "C2", octaves: 3 },
    },
    { kind: "spectrum", label: "Spectrum", source: (s) => s.analyser },
    { kind: "scope", label: "Waveform", source: (s) => s.analyser },
  ],
});
