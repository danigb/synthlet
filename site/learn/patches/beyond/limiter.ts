/*
 * The last node every web-audio app needs, and the two meters that prove it.
 *
 * Nothing in Synth Secrets is about this, because in 2004 the thing on the end
 * of the chain was somebody else's hardware. In a browser it is yours: the
 * output of a patch goes straight to a converter with no headroom past 0 dBFS
 * and no console to ride, and a synth that sums four voices will find that
 * ceiling on its own.
 *
 * `LookaheadLimiter` delays the signal by a couple of milliseconds so that it
 * can see a peak coming and be already turned down when it arrives. Below the
 * threshold it is a bit-exact passthrough, delayed; above it, it takes exactly
 * as much off as it has to.
 *
 * Three decisions worth knowing about, because each one is a place the patch
 * could have lied:
 *
 * - **The drive is a `Gain` in front of the split, not the limiter's own
 *   `gain`.** That parameter is a drive *before the detector*, so it would
 *   vanish along with the limiter when the bypass switched, and the toggle
 *   would then be changing two things at once.
 * - **The bypass is a crossfade between two arms, with a `DelayNode` on the dry
 *   one.** Web Audio has no automatic latency compensation, so a dry path that
 *   was not delayed by `limiter.latencyTime` would arrive early and the toggle
 *   would be a comb filter as well as a bypass.
 * - **Both meters tap inside the patch**, so they move whether or not Play is
 *   open. They are the instrument's meters, not the reader's; a meter after the
 *   output gain would be drawing the Play state instead of the limiter's work.
 *
 * The kit's meter can show peak, RMS and LUFS and **cannot show true peak**,
 * which is the unit the threshold is written in - a sample peak can sit under
 * the ceiling while the waveform between two samples goes over it. Ticket 14b
 * is the missing mode.
 *
 * No `diagram`: the bypass is a second audio chain and `DelayNode` is a native
 * node, and the kit can draw neither (tickets 10b, 10c).
 */

import {
  AdsrAmp,
  Clock,
  Compound,
  Gain,
  LookaheadLimiter,
  Noise,
  NoiseType,
  PolyblepOscillator,
  PolyblepOscillatorType,
} from "synthlet";
import { definePatch } from "../define";

const BPM = 110;
/** Wide enough to be a note rather than a click, short enough to leave a gap. */
const PULSE_WIDTH = 0.25;

const FREQUENCY = 110;
const DETUNE = 9;
/** Four sources summed here, so the stack peaks near 1 rather than near 4. */
const SUM = 0.3;
/** Enough hiss to put something at the top of the spectrum for the ceiling. */
const NOISE = 0.08;

const THRESHOLD = -1;
const RELEASE = 168;
/** A gain, because the control's scale is `db`: 1 is 0 dB. */
const DRIVE = 1;

const CROSSFADE = 0.01;
const LEVEL = 0.125;

function build(ac: AudioContext) {
  const clock = Clock(ac, { bpm: BPM, pulseWidth: PULSE_WIDTH });

  const saw = PolyblepOscillator(ac, {
    type: PolyblepOscillatorType.Sawtooth,
    frequency: FREQUENCY,
    detune: -DETUNE,
  });
  const saw2 = PolyblepOscillator(ac, {
    type: PolyblepOscillatorType.Sawtooth,
    frequency: FREQUENCY,
    detune: DETUNE,
  });
  const square = PolyblepOscillator(ac, {
    type: PolyblepOscillatorType.Square,
    frequency: FREQUENCY * 2,
  });
  const noise = Noise(ac, { type: NoiseType.White });
  const noiseLevel = Gain.val(ac, NOISE);
  const mix = Gain.val(ac, SUM);

  // A fast attack and a short decay, because transients are what a limiter is
  // for: a drone finds its ceiling once and then sits on it, which shows
  // nothing.
  const amp = AdsrAmp(ac, {
    gate: clock.gate,
    attack: 0.002,
    decay: 0.12,
    sustain: 0.35,
    release: 0.08,
  });

  const drive = Gain.val(ac, DRIVE);
  const limiter = LookaheadLimiter(ac, {
    threshold: THRESHOLD,
    release: RELEASE,
    gain: 0,
  });

  const dryDelay = new DelayNode(ac, {
    maxDelayTime: 0.02,
    delayTime: limiter.latencyTime,
  });
  const limited = Gain.val(ac, 1);
  const bypassed = Gain.val(ac, 0);
  const sum = Gain.val(ac, 1);

  const analyser = ac.createAnalyser();
  analyser.fftSize = 2048;

  const level = Gain.val(ac, LEVEL);
  const out = Gain.val(ac, 0);

  saw.connect(mix);
  saw2.connect(mix);
  square.connect(mix);
  noise.connect(noiseLevel).connect(mix);
  mix.connect(amp).connect(drive);

  drive.connect(limiter).connect(limited).connect(sum);
  drive.connect(dryDelay).connect(bypassed).connect(sum);
  sum.connect(analyser).connect(level).connect(out);

  let bypassing = 0;
  const bypass = {
    get value() {
      return bypassing;
    },
    set value(next: number) {
      bypassing = next > 0 ? 1 : 0;
      const now = ac.currentTime;
      limited.gain.setTargetAtTime(bypassing ? 0 : 1, now, CROSSFADE);
      bypassed.gain.setTargetAtTime(bypassing ? 1 : 0, now, CROSSFADE);
    },
  };

  return Compound({
    output: out,
    owns: [
      clock,
      saw,
      saw2,
      square,
      noise,
      noiseLevel,
      mix,
      amp,
      drive,
      limiter,
      dryDelay,
      limited,
      bypassed,
      sum,
      analyser,
      level,
    ],
    // `drive`, never `gain`: a compound is `Object.assign(output, exposes)` on a
    // `GainNode`, so a key called `gain` would replace the output's own
    // `AudioParam` and the kit's Play toggle would have nothing to open.
    exposes: {
      clock,
      saw,
      saw2,
      square,
      noise,
      amp,
      drive,
      limiter,
      limited,
      bypassed,
      sum,
      analyser,
      bypass,
    },
  });
}

export default definePatch({
  id: "beyond/limiter",
  label: "Loud without clipping",
  build,
  controls: [
    {
      id: "threshold",
      kind: "slider",
      label: "Threshold",
      help: "The ceiling. Below it the limiter is a delay and nothing else.",
      param: (s) => s.limiter.threshold,
      min: -24,
      max: 0,
      step: 0.1,
      unit: "dBTP",
      default: THRESHOLD,
    },
    {
      id: "gain",
      kind: "slider",
      label: "Gain",
      help: "How hard the signal is pushed into it. Watch the two meters diverge.",
      param: (s) => s.drive.gain,
      min: -12,
      max: 24,
      scale: "db",
      default: DRIVE,
    },
    {
      id: "release",
      kind: "slider",
      label: "Release",
      help: "How long the gain takes to come back after a peak.",
      param: (s) => s.limiter.release,
      min: 10,
      max: 1000,
      scale: "log",
      unit: "ms",
      default: RELEASE,
    },
    {
      id: "bypass",
      kind: "toggle",
      label: "Bypass",
      help: "The same signal, undelayed by the same amount, with no limiting.",
      param: (s) => s.bypass,
      default: 0,
    },
  ],
  views: [
    {
      kind: "meter",
      label: "Before",
      source: (s) => s.drive,
      options: { show: ["peak"] },
    },
    {
      kind: "meter",
      label: "After",
      source: (s) => s.limited,
      options: { show: ["peak", "lufs"] },
    },
    { kind: "scope", label: "Waveform", source: (s) => s.analyser },
  ],
});
