/*
 * One kick drum, from two synthesisers, at the same time.
 *
 * Part 33 builds it the obvious way: a sine whose pitch falls as fast as its
 * loudness, with a click at the front. Part 34 then builds the same drum on an
 * ARP Axxe that has **no free oscillator left**, by winding the resonance to
 * maximum, the cutoff to minimum, and hitting the filter with a trigger -
 * "ADSR to VCF about 50 %, A 0, D = R about 50 %, S 0, no keyboard CV",
 * transposed two octaves down, with the resonance backed off "a tad" so a
 * little of the oscillator gets through. Which is why route 1's resonance is
 * 0.98 and not 1.
 *
 * Both routes run all the time off one `trigger`, so the select is a
 * comparison rather than a rebuild, and the reader hears that they are the
 * same drum.
 *
 * The pitch envelope is Reid's number and not `drums.ts`'s. He measured that
 * "the pitch of a typical kick drum can shift by a couple of semitones from
 * start to finish" - the VCA's gain changes by 100 % while the pitch changes
 * by about 10 % - so the depth here is about six hertz on a fifty hertz drum.
 * `KickDrum` in `packages/synthlet/src/synths/drums.ts` uses fifty, which is an
 * octave and a half and is what everybody actually does; this patch is that
 * factory's inside, with the book's number in it.
 *
 * The clip's 5 and 0.6 are `drums.ts`'s own. "View the code" cannot open that
 * file - `getPatchSource` returns the patch and the library publishes no path
 * into `src/` - which is ticket 13c.
 *
 * No diagram: two sources into a mixer, twice over (13b).
 */

import {
  AdAmp,
  AdEnv,
  ClipAmp,
  ClipType,
  Compound,
  Gain,
  Impulse,
  Oscillator,
  Param,
  VirtualAnalogFilter,
} from "synthlet";
import { definePatch } from "../define";

const DEFAULT_TONE = 50;
const DEFAULT_DECAY = 0.35;
const DEFAULT_CLICK = 0.4;
const DEFAULT_DRIVE = 5;

/** A couple of semitones at fifty hertz, which is what Part 33 measured. */
const PITCH_AMOUNT = 6;

/** Route 1's sweep: the Axxe's cutoff falls from here down to the tone. */
const SWEEP_AMOUNT = 400;

const ROUTES = ["Oscillator + pitch envelope", "Self-oscillating ladder"];

/** A fixed trim, after the analyser. */
const LEVEL = 0.125;
const CROSSFADE = 0.01;

function build(ac: AudioContext) {
  // One trigger for everything, so the two routes fire together.
  const trigger = Param.input(ac, 0);
  const tone = Param.input(ac, DEFAULT_TONE);
  const decay = Param.input(ac, DEFAULT_DECAY);

  // --- Route 0: Part 33, the oscillator ------------------------------------
  const pitchEnv = AdEnv(ac, {
    trigger,
    attack: 0.002,
    decay,
    offset: tone,
    gain: PITCH_AMOUNT,
  });
  const osc = Oscillator(ac, { type: "sine", frequency: pitchEnv });
  const click = Impulse(ac, { trigger });
  const clickGain = Gain.val(ac, DEFAULT_CLICK);
  const mix = Gain.val(ac, 1);
  const amp = AdAmp(ac, { trigger, attack: 0.002, decay });
  const clip = ClipAmp(ac, {
    type: ClipType.Tanh,
    preGain: DEFAULT_DRIVE,
    postGain: 0.6,
  });
  const routeA = Gain.val(ac, 1);

  // --- Route 1: Part 34, the Axxe ------------------------------------------
  const sweepEnv = AdEnv(ac, {
    trigger,
    attack: 0,
    decay,
    offset: tone,
    gain: SWEEP_AMOUNT,
  });
  const ladder = VirtualAnalogFilter(ac, {
    type: VirtualAnalogFilter.MOOG_LADDER,
    resonance: 0.98,
    frequency: sweepEnv,
  });
  const amp2 = AdAmp(ac, { trigger, attack: 0.002, decay });
  const routeB = Gain.val(ac, 0);

  const bus = Gain.val(ac, 1);

  const analyser = ac.createAnalyser();
  analyser.fftSize = 4096;
  analyser.smoothingTimeConstant = 0.5;

  const level = Gain.val(ac, LEVEL);
  const out = Gain.val(ac, 0);

  osc.connect(mix);
  click.connect(clickGain).connect(mix);
  mix.connect(amp).connect(clip).connect(routeA).connect(bus);

  // No oscillator at all: the filter is the oscillator, and the click is the
  // stick hitting it.
  click.connect(ladder).connect(amp2).connect(routeB).connect(bus);

  bus.connect(analyser).connect(level).connect(out);

  let which = 0;
  const route = {
    get value() {
      return which;
    },
    set value(next: number) {
      which = Math.min(1, Math.max(0, Math.round(next)));
      const now = ac.currentTime;
      routeA.gain.setTargetAtTime(which === 0 ? 1 : 0, now, CROSSFADE);
      routeB.gain.setTargetAtTime(which === 0 ? 0 : 1, now, CROSSFADE);
    },
  };

  return Compound({
    output: out,
    owns: [
      trigger,
      tone,
      decay,
      pitchEnv,
      osc,
      click,
      clickGain,
      mix,
      amp,
      clip,
      routeA,
      sweepEnv,
      ladder,
      amp2,
      routeB,
      bus,
      analyser,
      level,
    ],
    exposes: {
      trigger,
      tone,
      decay,
      pitchEnv,
      osc,
      clickGain,
      amp,
      clip,
      sweepEnv,
      ladder,
      analyser,
      route,
    },
  });
}

export default definePatch({
  id: "recipes/kick",
  label: "Kick",
  build,
  controls: [
    {
      id: "tone",
      kind: "slider",
      label: "Tone",
      help: "Where the drum lands. Both routes read the same number.",
      param: (s) => s.tone.input,
      min: 20,
      max: 120,
      scale: "log",
      unit: "Hz",
      default: DEFAULT_TONE,
    },
    {
      id: "decay",
      kind: "slider",
      label: "Decay",
      help: "The pitch falls and the loudness falls over the same time. That is the drum.",
      param: (s) => s.decay.input,
      min: 0.05,
      max: 1.5,
      scale: "time",
      unit: "s",
      default: DEFAULT_DECAY,
    },
    {
      id: "click",
      kind: "slider",
      label: "Click",
      help: "The beater. With attack at zero the amplifier's own discontinuity is one too.",
      param: (s) => s.clickGain.gain,
      min: 0,
      max: 1,
      step: 0.01,
      default: DEFAULT_CLICK,
    },
    {
      id: "drive",
      kind: "slider",
      label: "Drive",
      help: "How hard route 0 hits the saturator. It is what turns a thud into a wall.",
      param: (s) => s.clip.preGain,
      min: 1,
      max: 10,
      step: 0.1,
      default: DEFAULT_DRIVE,
    },
    {
      id: "route",
      kind: "select",
      label: "Route",
      help: "Reid gives two recipes. They are the same drum from two synthesisers.",
      param: (s) => s.route,
      options: ROUTES,
      default: 0,
    },
    {
      id: "trigger",
      kind: "gate",
      label: "Hit it",
      help: "One trigger, both routes. Only the one you chose is audible.",
      param: (s) => s.trigger.input,
      mode: "trigger",
    },
  ],
  views: [
    {
      kind: "scope",
      label: "Contour",
      source: (s) => s.analyser,
      options: { window: "contour", seconds: 2 },
    },
    { kind: "spectrum", label: "Spectrum", source: (s) => s.analyser },
  ],
});
