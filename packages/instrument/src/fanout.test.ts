import {
  AudioParamMock,
  ConstantSourceNodeMock,
  createAudioContextMock,
} from "../../synthlet/src/test-utils";
import { createFanouts, ParamSpec } from "./fanout";

/** The mock behind a node the module built against the DOM types. */
const mock = (node: ConstantSourceNode) =>
  node as unknown as ConstantSourceNodeMock;

const SPECS: Record<"cutoff" | "resonance", ParamSpec> = {
  cutoff: { default: 1200, min: 20, max: 20000, unit: "Hz" },
  resonance: { default: 0.7, min: 0, max: 1 },
};

describe("createFanouts", () => {
  it("builds one started node per declared parameter, at its default", () => {
    const { context, nodes } = createAudioContextMock();

    const { nodes: sources, params } = createFanouts(context, SPECS);

    expect(sources.length).toBe(2);
    expect(nodes.map((node) => node.kind)).toEqual([
      "ConstantSourceNode",
      "ConstantSourceNode",
    ]);
    // A source that is never started emits nothing, so the parameter would
    // read as silence rather than as its default.
    expect(sources.every((s) => (s as any).started)).toBe(true);
    expect((params.cutoff as unknown as AudioParamMock).value).toBe(1200);
    expect((params.resonance as unknown as AudioParamMock).value).toBe(0.7);
  });

  it("publishes each node's own offset as the parameter", () => {
    const { context } = createAudioContextMock();

    const { nodes: sources, params } = createFanouts(context, SPECS);

    expect(params.cutoff).toBe(mock(sources[0]).offset);
    expect(params.resonance).toBe(mock(sources[1]).offset);
  });

  it("hands out one inlet node per parameter, to be connected n times", () => {
    const { context } = createAudioContextMock();
    const { inlets, nodes: sources } = createFanouts(context, SPECS);

    const targets = [new AudioParamMock(), new AudioParamMock()];
    for (const target of targets) inlets.cutoff.connect(target as any);

    expect(inlets.cutoff).toBe(sources[0]);
    expect(mock(sources[0]).connections).toEqual(targets);
  });

  it("builds nothing for a definition with no parameters", () => {
    const { context, nodes } = createAudioContextMock();

    const { nodes: sources, inlets } = createFanouts(context, {});

    expect(sources).toEqual([]);
    expect(inlets).toEqual({});
    expect(nodes).toEqual([]);
  });
});
