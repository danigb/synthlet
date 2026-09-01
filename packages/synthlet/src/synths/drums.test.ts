import {
  AudioNodeMock,
  createAudioContextMock,
  OscillatorNodeMock,
} from "../test-utils";
import * as drums from "./drums";

// A drum's four knobs are its whole surface, so a knob wired to nothing is a
// control that silently does nothing - which `SnareDrum.tone` was.

const drumNames = Object.keys(drums) as (keyof typeof drums)[];

/** The Param node an exposed knob belongs to: the knob is that node's input. */
const nodeBehind = (knob: AudioParam, nodes: AudioNodeMock[]) =>
  nodes.find((node) => (node as any).input === knob);

/** The node driving an AudioParam, i.e. the one connected to it. */
const driverOf = (param: AudioParam | unknown, nodes: AudioNodeMock[]) =>
  nodes.find((node) => node.connections.includes(param)) as any;

describe.each(drumNames)("%s", (name) => {
  it.each(["trigger", "decay", "tone", "volume"] as const)(
    "its %s drives something",
    (knob) => {
      const { context, nodes } = createAudioContextMock();
      const drum = drums[name](context);

      const param = nodeBehind(drum[knob], nodes);
      expect(param).toBeDefined();
      expect(param!.connections.length).toBeGreaterThan(0);
    },
  );
});

describe("SnareDrum", () => {
  it("sits at 100 and 200 Hz at the default tone", () => {
    const { context, nodes } = createAudioContextMock();
    const snare = drums.SnareDrum(context);

    const oscs = nodes.filter(
      (node): node is OscillatorNodeMock => node instanceof OscillatorNodeMock,
    );
    const [freq, freq2] = oscs.map((osc) => driverOf(osc.frequency, nodes));

    // A Param outputs `convert(input + mod, min, max) * gain + offset`
    // (packages/param/src/worklet.ts): Param.lin is `min + input × (max - min)`
    // and Param.mul is `input × gain`.
    const tone = snare.tone.value; // toParams' default
    const base = freq.min.value + tone * (freq.max.value - freq.min.value);

    expect(oscs).toHaveLength(2);
    expect(base).toBe(100);
    expect(base * freq2.gain.value).toBe(200);
  });
});
