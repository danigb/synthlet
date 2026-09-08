/**
 * @jest-environment ./scripts/offline-audio-env.mjs
 */
import { AdsrAmp, registerAdsrWorklet } from "@synthlet/adsr";
import {
  PolyblepOscillator,
  PolyblepOscillatorType,
  registerPolyblepOscillatorWorklet,
} from "@synthlet/polyblep-oscillator";
import { registerAllWorklets } from "./index";
import { MonoSynth } from "./synths/mono";
import { registerMonoSynth } from "./synths/registrars";

// Rendering offline, and getting the same audio.
//
// `docs/vision.md` principle 2: *"type everything against `BaseAudioContext`,
// because rendering offline is how a host verifies without listening"*. The
// type half of that is a compile-time claim - `tsc --noEmit` is its test. This
// file is the other half: an `OfflineAudioContext` really does register this
// library's worklets and really does render them, and it renders the same
// samples twice.
//
// The harness is `node-web-audio-api`, injected by
// `scripts/offline-audio-env.mjs`; the docblock above is what selects it, and
// that file explains why an environment rather than an import.
//
// What is *not* asserted here is a comparison against a live `AudioContext`:
// recording one needs a `MediaStreamAudioDestinationNode` and a browser. What
// stands in for it is determinism - two renders of one graph, sample for
// sample - which is the property play's "the render sounds like what I heard"
// actually rests on.

const SAMPLE_RATE = 48000;
const DURATION = 1;
const WINDOW = 0.01; // 10 ms, the resolution the envelope is measured at

const GATE_ON = 0.1;
const GATE_OFF = 0.4;

/** Root mean square of the 10 ms window starting at `time`. */
function rmsAt(samples: Float32Array, time: number): number {
  const from = Math.round(time * SAMPLE_RATE);
  const to = Math.min(samples.length, from + Math.round(WINDOW * SAMPLE_RATE));
  let sum = 0;
  for (let i = from; i < to; i++) sum += samples[i] * samples[i];
  return Math.sqrt(sum / (to - from));
}

/**
 * A note: a sawtooth through an ADSR amplifier, gated on at 0.1 s and off at
 * 0.4 s, rendered to a one-second mono buffer. Deliberately definition-free -
 * two worklets and a connection - so a failure is the platform's and not the
 * instrument's.
 */
async function renderNote(): Promise<Float32Array> {
  const context = new OfflineAudioContext(
    1,
    SAMPLE_RATE * DURATION,
    SAMPLE_RATE,
  );

  // The registrars take a `BaseAudioContext`: this is the ticket's type change
  // exercised at runtime rather than only by `tsc`.
  await registerPolyblepOscillatorWorklet(context);
  await registerAdsrWorklet(context);

  const osc = PolyblepOscillator(context, {
    type: PolyblepOscillatorType.Sawtooth,
    frequency: 220,
  });
  const amp = AdsrAmp(context, {
    attack: 0.01,
    decay: 0.05,
    sustain: 0.8,
    release: 0.1,
  });
  amp.gate.setValueAtTime(1, GATE_ON);
  amp.gate.setValueAtTime(0, GATE_OFF);

  osc.connect(amp);
  amp.connect(context.destination);

  const buffer = await context.startRendering();
  // **Copied, not viewed.** `getChannelData` hands back a view of the render
  // thread's own buffer and the next context reuses that memory, so a
  // `Float32Array` held across a second `startRendering` reads garbage - which
  // is the determinism assertion below failing for the harness's reason rather
  // than for the library's.
  return Float32Array.from(buffer.getChannelData(0));
}

// Compile-time only, never called: the widening must not cost a caller the type
// it already had. `site/app/audio-context.ts` is
// `Promise<AudioContext> = registerAllWorklets(new AudioContext())`, and it
// still compiles because the registrars are generic in the context rather than
// returning the base type. `tsc --noEmit` is the assertion here; jest only has
// to not run it.
async function _contextTypesSurviveRegistration(
  live: AudioContext,
  offline: OfflineAudioContext,
) {
  const stillLive: AudioContext = await registerAllWorklets(live);
  const stillOffline: OfflineAudioContext = await registerAllWorklets(offline);
  const monoLive: AudioContext = await registerMonoSynth(live);
  const monoOffline: OfflineAudioContext = await registerMonoSynth(offline);
  return [stillLive, stillOffline, monoLive, monoOffline];
}

describe("an OfflineAudioContext renders synthlet worklets", () => {
  let samples: Float32Array;

  beforeAll(async () => {
    samples = await renderNote();
  });

  it("renders a buffer of the requested length", () => {
    expect(samples.length).toBe(SAMPLE_RATE * DURATION);
  });

  it("is silent before the gate opens", () => {
    expect(rmsAt(samples, 0.0)).toBe(0);
    expect(rmsAt(samples, 0.05)).toBe(0);
    expect(rmsAt(samples, GATE_ON - WINDOW)).toBe(0);
  });

  it("has a rising edge at the gate", () => {
    // The window the gate opens in is already audible, and the one after it is
    // at full amplitude: a 10 ms attack inside a 10 ms window.
    expect(rmsAt(samples, GATE_ON)).toBeGreaterThan(0.05);
    expect(rmsAt(samples, GATE_ON + WINDOW)).toBeGreaterThan(0.3);
  });

  it("sustains while the gate is open", () => {
    for (let t = 0.2; t < GATE_OFF; t += 0.05) {
      expect(rmsAt(samples, t)).toBeGreaterThan(0.3);
    }
  });

  it("decays after the gate closes", () => {
    const held = rmsAt(samples, GATE_OFF - WINDOW);
    expect(rmsAt(samples, GATE_OFF + 0.05)).toBeLessThan(held);
    // A 0.1 s release is an exponential, so "silent" is a floor rather than a
    // zero: by 0.2 s past the gate it is two orders of magnitude down.
    expect(rmsAt(samples, GATE_OFF + 0.2)).toBeLessThan(held / 100);
  });

  it("is not silent overall", () => {
    let peak = 0;
    for (const s of samples) peak = Math.max(peak, Math.abs(s));
    expect(peak).toBeGreaterThan(0.5);
  });
});

// The claim that makes an offline render usable as a reference at all. The
// spec renders an `OfflineAudioContext` deterministically; a processor that
// carried state across renders, or seeded itself from a clock, would break it
// here rather than in someone's ear.
it("renders the same graph identically twice", async () => {
  const first = await renderNote();
  const second = await renderNote();

  expect(second.length).toBe(first.length);
  let differences = 0;
  for (let i = 0; i < first.length; i++) {
    if (first[i] !== second[i]) differences++;
  }
  expect(differences).toBe(0);
});

// Every registrar in the library, on an offline context: the type change is
// only worth anything if all 24 modules can actually be registered on one.
it("registers every worklet on an offline context", async () => {
  const context = new OfflineAudioContext(1, 128, SAMPLE_RATE);
  await expect(registerAllWorklets(context)).resolves.toBe(context);
  // `node-web-audio-api` runs the worklet global scope in a worker thread and
  // shuts it down at the end of `startRendering`. A context that registers
  // modules and never renders leaves that thread running, and jest then reports
  // that it "did not exit one second after the test run has completed" - so
  // render the (empty) quantum and let the context close itself.
  await context.startRendering();
});

// A real compound, offline. `gate-path.test.ts` says of the topology mock that
// "there is no `AudioContext` in node - so a real compound cannot be rendered
// here"; that is no longer true of this file, and `MonoSynth` - five worklets,
// two `Param` inlets and a native `GainNode` behind one `gate` - is the biggest
// graph the library has today. Rendering it offline is the closest thing there
// is to the instrument render [ticket 06] will add on top of it.
describe("a compound renders offline", () => {
  let samples: Float32Array;

  beforeAll(async () => {
    const context = new OfflineAudioContext(
      1,
      SAMPLE_RATE * DURATION,
      SAMPLE_RATE,
    );
    await registerMonoSynth(context);

    const synth = MonoSynth(context, { frequency: 220 });
    synth.connect(context.destination);
    synth.gate.setValueAtTime(1, GATE_ON);
    synth.gate.setValueAtTime(0, GATE_OFF);

    const buffer = await context.startRendering();
    samples = Float32Array.from(buffer.getChannelData(0));
  });

  it("is silent before the gate and audible after it", () => {
    expect(rmsAt(samples, GATE_ON - WINDOW)).toBe(0);
    expect(rmsAt(samples, 0.2)).toBeGreaterThan(0.1);
  });

  it("holds while the gate is open", () => {
    for (let t = 0.15; t < GATE_OFF; t += 0.05) {
      expect(rmsAt(samples, t)).toBeGreaterThan(0.1);
    }
  });

  it("decays once the gate closes", () => {
    // The default release is 0.3 s, so a quarter of a second past the gate is
    // most of the way down but not yet at zero.
    expect(rmsAt(samples, GATE_OFF + 0.25)).toBeLessThan(
      rmsAt(samples, 0.2) / 100,
    );
  });
});
