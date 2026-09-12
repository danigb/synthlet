import { Instrument } from "@synthlet/instrument";
import { AudioNodeMock, createAudioContextMock } from "../test-utils";
import * as drums from "./drums";
import { MonoSynth } from "./mono";
import { monoVoice } from "./mono-voice";

// Every teardown path in `disposable` ends in a disconnect(): a dependency with
// a dispose() is disposed (which disconnects it), one without is disconnected
// directly. So "reached by dispose()" is exactly "disconnect() was called".
const leaked = (nodes: AudioNodeMock[]) =>
  nodes.filter((node) => node.disconnectCount === 0).map((node) => node.kind);

const compounds = [
  { name: "MonoSynth", build: MonoSynth },
  // An instrument is a compound too, and a bigger one: three of the compound
  // above, three per-voice gains, sixteen fan-out nodes and an output. It is
  // built asynchronously, so `build` may return something with a `ready` on it.
  {
    name: "Instrument(monoVoice)",
    build: (context: BaseAudioContext) =>
      Instrument(context, monoVoice, { voices: 3 }),
  },
  // Every drum: a compound that forgets to own one of its sources leaks it,
  // and only running all ten catches the one that does.
  ...Object.entries(drums)
    .filter(
      (entry): entry is [string, typeof drums.KickDrum] =>
        typeof entry[1] === "function",
    )
    .map(([name, build]) => ({ name, build })),
];

describe.each(compounds)("$name", ({ build }) => {
  it("disposes every node it created", async () => {
    const { context, nodes } = createAudioContextMock();
    const synth = build(context);
    await (synth as { ready?: Promise<void> }).ready;

    // Guard against the assertion below passing vacuously.
    expect(nodes.length).toBeGreaterThan(5);

    synth.dispose();

    expect(leaked(nodes)).toEqual([]);
  });

  it("dispose is idempotent", async () => {
    const { context, nodes } = createAudioContextMock();
    const synth = build(context);
    await (synth as { ready?: Promise<void> }).ready;

    synth.dispose();
    const counts = nodes.map((node) => node.disconnectCount);
    synth.dispose();

    expect(nodes.map((node) => node.disconnectCount)).toEqual(counts);
  });
});

describe("MonoSynth", () => {
  it("disposes the vibrato LFO", () => {
    // The vibrato is connected by hand to osc.frequency, so it is reachable
    // only as a declared module. Asserted on its own so a refactor that drops
    // it from `modules` fails here rather than silently leaking again.
    const { context } = createAudioContextMock();
    const synth = MonoSynth(context);

    synth.dispose();

    const vibrato = synth.vibrato as unknown as AudioNodeMock;
    expect(vibrato.disconnectCount).toBeGreaterThan(0);
  });
});
