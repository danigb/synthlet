/*
 * Two oscillators, one of which is never allowed to finish a cycle.
 *
 * Hard sync is the one modulation in this chapter that is not a signal on a
 * parameter in the usual sense: the master's rising edge *restarts* the slave,
 * so the slave's waveform is chopped into pieces the length of the master's
 * period. Part 43 states the two rules that follow, and the patch exists to let
 * a reader check both of them:
 *
 *   1. the output frequency is always the master's, whatever the slave is
 *      doing - so the pitch is the master's;
 *   2. with the master below the slave, moving the slave changes the *timbre*
 *      and nothing else.
 *
 * Only the slave is heard. The master's square is wired to `slave.sync` and
 * nowhere else, which is exactly how Reid's Figure 9 patches it: the master's
 * square output into the slave's Sync In, the slave's sawtooth into the mixer.
 *
 * `AdEnv` on the slave's frequency is the second half of rule 2 - Reid's
 * Figures 11 and 12, the triggered contour that sweeps the slave and makes the
 * "zeeeooooww" of a Prodigy. The envelope's own `gain` is the size of that
 * sweep in hertz, so one knob is the whole effect.
 */

import {
  AdEnv,
  Compound,
  Gain,
  PolyblepOscillator,
  PolyblepOscillatorType,
} from "synthlet";
import { definePatch } from "../define";

/** The pitch. Low enough that the slave has room to run well above it. */
const MASTER = 220;
/** Exactly three times the master, which is a plain ramp: the starting point. */
const SLAVE = 660;

/** How far the envelope pushes the slave up, in hertz. */
const SWEEP = 2000;
const DECAY = 0.4;
/** A sync'd sawtooth is all edges. Trimmed to about -18 dB, as chapter 1 was. */
const LEVEL = 0.125;

function build(ac: AudioContext) {
  // The master is a modulator here and not a voice: its square goes to the
  // slave's sync port and to nothing else, so it is never heard.
  const master = PolyblepOscillator(ac, {
    type: PolyblepOscillatorType.Square,
    frequency: MASTER,
  });
  const slave = PolyblepOscillator(ac, {
    type: PolyblepOscillatorType.Sawtooth,
    frequency: SLAVE,
  });
  // `sync` is a-rate, and it has to be: a reset quantised to a render quantum
  // would be a sync 2.9 ms late, which at these frequencies is a different
  // waveform. The param clamps the square's -1 to 0, and the rising edge - the
  // library's one gate contract - is what restarts the phase.
  master.connect(slave.sync);

  // Reid's Figures 11 and 12: a contour on the slave's pitch. `gain` is how far
  // it travels, so it is the sweep knob; the slave's own frequency stays the
  // intrinsic value the envelope is added to, which is what makes the two
  // controls independent.
  const env = AdEnv(ac, { attack: 0.002, decay: DECAY, gain: SWEEP });
  env.connect(slave.frequency);

  const level = Gain.val(ac, LEVEL);
  const analyser = ac.createAnalyser();
  analyser.fftSize = 8192;
  analyser.smoothingTimeConstant = 0.6;
  analyser.minDecibels = -100;
  analyser.maxDecibels = -10;

  // A short window for the scope: a few cycles of the master, so the reader can
  // count the slave's aborted cycles inside one of them. That picture is the
  // whole of Part 43's Figures 5 to 7.
  const scopeAnalyser = ac.createAnalyser();
  scopeAnalyser.fftSize = 2048;

  // Last and at zero, with the analysers before it: a silent widget still draws.
  const out = Gain.val(ac, 0);
  slave.connect(level);
  level.connect(scopeAnalyser);
  level.connect(analyser).connect(out);

  return Compound({
    output: out,
    owns: [master, slave, env, level, analyser, scopeAnalyser],
    exposes: { master, slave, env, analyser, scopeAnalyser },
  });
}

export default definePatch({
  id: "modulation/sync",
  label: "Hard sync",
  build,
  controls: [
    {
      id: "master",
      kind: "slider",
      label: "Master",
      help: "The oscillator doing the resetting. Whatever it is, it is the pitch.",
      param: (s) => s.master.frequency,
      min: 55,
      max: 880,
      scale: "log",
      unit: "Hz",
      default: MASTER,
    },
    {
      id: "slave",
      kind: "slider",
      label: "Slave",
      help: "The oscillator being reset. It is the timbre, not the pitch.",
      param: (s) => s.slave.frequency,
      min: 110,
      max: 6000,
      scale: "log",
      unit: "Hz",
      default: SLAVE,
    },
    {
      id: "sweep",
      kind: "slider",
      label: "Sweep",
      help: "How far a trigger pushes the slave up, in hertz.",
      param: (s) => s.env.gain,
      min: 0,
      max: 5000,
      step: 10,
      unit: "Hz",
      default: SWEEP,
    },
    {
      id: "decay",
      kind: "slider",
      label: "Sweep decay",
      help: "How long the slave takes to fall back to where you set it.",
      param: (s) => s.env.decay,
      min: 0.02,
      max: 2,
      scale: "time",
      unit: "s",
      default: DECAY,
    },
    {
      id: "trigger",
      kind: "gate",
      label: "Trigger",
      help: "Fire the sweep. Without it the slave sits still and so does the tone.",
      param: (s) => s.env.trigger,
      mode: "trigger",
    },
  ],
  views: [
    {
      kind: "spectrum",
      label: "The sound",
      // Two claims, drawn. The left mark is the master, and rule 1 says the
      // lowest peak never leaves it however far the slave travels. The right
      // mark is where the slave is running at rest, which is where the
      // spectrum's energy piles up - and a trigger sweeps that pile up past the
      // mark and back down to it.
      source: (s) => s.analyser,
      options: {
        marks: (s) => [s.master.frequency.value, s.slave.frequency.value],
      },
    },
    { kind: "scope", label: "Waveform", source: (s) => s.scopeAnalyser },
    { kind: "diagram" },
  ],
  /*
   * Reid's Figure 10, with the contour of Figure 11 added.
   *
   * The master is drawn as a *controller* and not as a source, which is the
   * honest picture and also the only one the layout can draw: it makes no sound
   * of its own here, and an audio cable from it would put it in the same row as
   * the slave (ticket 11c). Its cable is a control edge arriving at `sync`,
   * which is what the code does too.
   */
  diagram: {
    nodes: [
      {
        id: "slave",
        label: "PolyblepOscillator",
        kind: "source",
        exposedAs: "slave",
      },
      { id: "out", label: "out", kind: "output" },
      {
        id: "master",
        label: "PolyblepOscillator",
        kind: "controller",
        exposedAs: "master",
      },
      {
        id: "env",
        label: "AdEnv",
        kind: "controller",
        exposedAs: "env",
        controls: ["sweep", "decay", "trigger"],
      },
    ],
    edges: [
      { from: "slave", to: "out" },
      { from: "master", to: "slave", param: "sync" },
      { from: "env", to: "slave", param: "frequency" },
    ],
  },
});
