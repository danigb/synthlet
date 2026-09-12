import { registerAllWorklets } from "../index";
import { AudioNodeMock, createAudioContextMock } from "../test-utils";
import * as drums from "./drums";
import { MonoSynth } from "./mono";
import { registerDrums, registerMonoSynth } from "./registrars";

// createRegistrar caches its promise on the context under "__NAME__", so the
// keys a context ends up with are exactly the worklets that were registered.
const registered = (context: AudioContext) =>
  Object.keys(context)
    .filter((key) => key.startsWith("__") && key.endsWith("__"))
    .sort();

// The processor each package registers, and the registrar that provides it.
const PROCESSOR_KEYS: Record<string, string> = {
  AdProcessor: "__AD__",
  AdsrProcessor: "__ADSR__",
  ClipAmpProcessor: "__CLIP_AMP__",
  ImpulseProcessor: "__IMPULSE__",
  KsProcessor: "__KS-OSC__",
  LfoProcessor: "__LFO__",
  NoiseWorkletProcessor: "__NOISE__",
  ParamProcessor: "__PARAM__",
  PolyBLEProcessor: "__POLY_BLEP__",
  SvfProcessor: "__SVF__",
};

/** The registrar keys a compound's worklet nodes needed to be constructed. */
const keysUsedBy = (nodes: AudioNodeMock[]) => {
  const worklets = nodes
    .map((node) => node.kind)
    .filter((kind) => /Processor/.test(kind));
  const unknown = worklets.filter((kind) => !PROCESSOR_KEYS[kind]);
  // A processor missing from the table above would silently pass the check.
  expect(unknown).toEqual([]);
  return [...new Set(worklets.map((kind) => PROCESSOR_KEYS[kind]))].sort();
};

describe("registerMonoSynth", () => {
  it("registers the five worklets MonoSynth builds", async () => {
    const { context } = createAudioContextMock();

    await expect(registerMonoSynth(context)).resolves.toBe(context);

    expect(registered(context)).toEqual([
      "__ADSR__",
      "__LFO__",
      "__PARAM__",
      "__POLY_BLEP__",
      "__SVF__",
    ]);
  });

  it("registers everything MonoSynth needs", async () => {
    const { context, nodes } = createAudioContextMock();
    await registerMonoSynth(context);
    const keys = registered(context);

    MonoSynth(context);

    expect(keysUsedBy(nodes).filter((key) => !keys.includes(key))).toEqual([]);
  });
});

describe("registerDrums", () => {
  it("registers the seven worklets the drums build", async () => {
    const { context } = createAudioContextMock();

    await expect(registerDrums(context)).resolves.toBe(context);

    expect(registered(context)).toEqual([
      "__AD__",
      "__CLIP_AMP__",
      "__IMPULSE__",
      "__KS-OSC__",
      "__LFO__",
      "__NOISE__",
      "__PARAM__",
    ]);
  });

  it.each(Object.keys(drums))("registers everything %s needs", async (name) => {
    const { context, nodes } = createAudioContextMock();
    await registerDrums(context);
    const keys = registered(context);

    (drums as any)[name](context);

    expect(keysUsedBy(nodes).filter((key) => !keys.includes(key))).toEqual([]);
  });
});

describe("registration is cached", () => {
  it("adds each module once, however many registrars ask for it", async () => {
    const { context, addedModules } = createAudioContextMock();

    await registerMonoSynth(context);
    const afterMono = addedModules.length;
    await registerMonoSynth(context);

    expect(addedModules.length).toBe(afterMono);

    // The drums share param and lfo with MonoSynth: five new, not seven.
    await registerDrums(context);
    expect(addedModules.length).toBe(afterMono + 5);

    // And registerAllWorklets afterwards only adds what is still missing.
    await registerAllWorklets(context);
    expect(addedModules.length).toBe(28);
    expect(registered(context)).toHaveLength(28);
  });
});
