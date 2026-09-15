/*
 * Two drums, one necklace.
 *
 * A Euclidean rhythm spreads `beats` hits as evenly as it can over `steps`
 * slots, and the answer is already most of the world's dance music: three in
 * eight is the tresillo, five in eight the cinquillo, five in sixteen the
 * bossa. Nothing here is a pattern anybody typed in - the module computes it
 * from two integers, and the grid above the widget draws the same array the
 * worklet is playing, because both come from the shipped `Euclid.pattern`.
 *
 * The hi-hat is not a second `Euclid`. One necklace is several parts at once,
 * so `.b` is the same pattern entered `spread` steps further in - one pattern
 * array, one step counter, nothing that can drift. At `spread: 0` every
 * channel is unison and the hat would double the kick, which is why this
 * arrives at 2.
 *
 * `Euclid` takes the clock *node* - the phase ramp - and not `.gate`: its
 * `subdivision` multiplies that phase, and a gate has no phase to multiply.
 */

import { Clock, Compound, Euclid, Gain, HiHatDrum, KickDrum } from "synthlet";
import { definePatch } from "../define";

const BPM = 110;

const STEPS = 8;
const BEATS = 3;
const ROTATION = 0;
const SPREAD = 2;

/** Eight steps across two beats: a bar of eighths at the tempo above. */
const SUBDIVISION = 2;

/** A drum's `volume` is decibels, so these are trims and not gains. */
const KICK_DB = 0;
const HAT_DB = -10;

const LEVEL = 0.125;

function build(ac: AudioContext) {
  const clock = Clock(ac, { bpm: BPM, pulseWidth: 0.5 });
  const rhythm = Euclid(ac, {
    clock,
    subdivision: SUBDIVISION,
    steps: STEPS,
    beats: BEATS,
    rotation: ROTATION,
    spread: SPREAD,
    pulseWidth: 0.3,
  });

  const kick = KickDrum(ac, { trigger: rhythm, volume: KICK_DB });
  const hat = HiHatDrum(ac, { trigger: rhythm.b, volume: HAT_DB });

  const mix = Gain.val(ac, 1);
  kick.connect(mix);
  hat.connect(mix);

  const analyser = ac.createAnalyser();
  analyser.fftSize = 4096;
  analyser.smoothingTimeConstant = 0.6;

  const level = Gain.val(ac, LEVEL);
  const out = Gain.val(ac, 0);
  mix.connect(analyser).connect(level).connect(out);

  return Compound({
    output: out,
    owns: [clock, rhythm, kick, hat, mix, analyser, level],
    exposes: { clock, rhythm, kick, hat, analyser },
  });
}

export default definePatch({
  id: "time/euclid",
  label: "Euclidean rhythms",
  build,
  controls: [
    {
      id: "steps",
      kind: "slider",
      label: "Steps",
      help: "How many slots the bar is divided into.",
      param: (s) => s.rhythm.steps,
      min: 1,
      max: 16,
      step: 1,
      default: STEPS,
    },
    {
      id: "beats",
      kind: "slider",
      label: "Beats",
      help: "How many of those slots are hits.",
      param: (s) => s.rhythm.beats,
      min: 1,
      max: 16,
      step: 1,
      default: BEATS,
    },
    {
      id: "rotation",
      kind: "slider",
      label: "Rotation",
      help: "Where the necklace is entered. The shape does not change.",
      param: (s) => s.rhythm.rotation,
      min: 0,
      max: 15,
      step: 1,
      default: ROTATION,
    },
    {
      id: "spread",
      kind: "slider",
      label: "Spread",
      help: "How far into the same necklace the hi-hat starts.",
      param: (s) => s.rhythm.spread,
      min: 0,
      max: 15,
      step: 1,
      default: SPREAD,
    },
  ],
  views: [
    {
      kind: "pattern",
      label: "The necklace",
      // Two rows, because two channels are patched: the kick reads a, the
      // hi-hat reads b.
      source: (s) => ({
        steps: s.rhythm.steps.value,
        beats: s.rhythm.beats.value,
        rotation: s.rhythm.rotation.value,
        spread: s.rhythm.spread.value,
        channels: 2,
      }),
    },
    { kind: "meter", label: "Output", options: { show: ["peak"] } },
  ],
  // No diagram: two drums are two audio chains into one mix, and the layout
  // puts every box an audio cable touches in one row (ticket `11c`).
});
