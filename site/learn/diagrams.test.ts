import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as webAudio from "node-web-audio-api";
import { registerAllWorklets } from "synthlet";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  controlNodes,
  describeDiagram,
  exposedKeys,
  fromLibraryGraph,
  layoutDiagram,
  toGraph,
  type DiagramControl,
  type LibraryGraph,
} from "./kit/views/layout";
import { loadPatches } from "./patches";
import type { DiagramNode, LessonPatch } from "./patches/define";

/*
 * A declared diagram is a claim about the code beside it. This is the test that
 * makes it one.
 *
 * The honest source for a diagram is the running graph, and the library cannot
 * enumerate one yet (`thoughts/tickets/graph-introspection.md`), so every
 * diagram in the tutorial is written by hand - and a picture written by hand is
 * a picture that drifts. What stops it is that the claims are all checkable:
 * a box says which keys on `exposes` it is, a control edge says which parameter
 * it arrives at, a box says which of the lesson's knobs belong to it. So this
 * file **builds the patch** and asks.
 *
 * Built, not mocked: `node-web-audio-api` is the same Rust implementation
 * `learn/voice/learn-voice.test.ts` and `packages/synthlet/src/offline.test.ts`
 * render with, its classes go into the globals here the way they do there, and
 * `registerAllWorklets` registers this library's processors on an
 * `OfflineAudioContext` exactly as a browser would. An environment without one
 * falls back to reading `exposes` out of the source, and the describe title
 * says which of the two happened, so the weaker path can never pass quietly for
 * the stronger one.
 */

for (const [name, value] of Object.entries(webAudio)) {
  if (name === "default" || name === "__esModule") continue;
  if (name === "mediaDevices") continue;
  (globalThis as Record<string, unknown>)[name] = value;
}

const LEARN = dirname(fileURLToPath(import.meta.url));

const CAN_BUILD =
  typeof (globalThis as Record<string, unknown>).OfflineAudioContext ===
  "function";
const HOW = CAN_BUILD
  ? "built on an OfflineAudioContext"
  : "parsed from source";

/*
 * The registry, loaded. It is a table of `() => import()` since 02c so that a
 * lesson carries its own patch; a test wants every one of them, and has no
 * bundle to care about.
 */
const patches = await loadPatches();

/** Every registered patch that draws itself. `"auto"` has nothing to check. */
const declared = Object.entries(patches).filter(
  ([, patch]) => patch.diagram !== undefined && patch.diagram !== "auto",
) as [string, LessonPatch][];

const nodesOf = (patch: LessonPatch): DiagramNode[] =>
  patch.diagram && patch.diagram !== "auto" ? patch.diagram.nodes : [];
const edgesOf = (patch: LessonPatch) =>
  patch.diagram && patch.diagram !== "auto" ? patch.diagram.edges : [];

/** How a failure names itself: the patch, then the box that is wrong. */
const at = (id: string, label: string) => `learn/patches/${id}.ts: "${label}"`;

// ---------------------------------------------------------------------------
// The compound, built once
// ---------------------------------------------------------------------------

const built = new Map<string, Record<string, unknown>>();

beforeAll(async () => {
  if (!CAN_BUILD) return;
  const context = new OfflineAudioContext(1, 128, 44100);
  await registerAllWorklets(context);

  for (const [id, patch] of declared) {
    // A build that throws is a failure and not a reason to fall back: the
    // fallback is for an environment with no Web Audio, not for a broken patch.
    const synth = patch.build(context as unknown as AudioContext) as Record<
      string,
      unknown
    >;
    // `Instrument`'s parameters do not exist until its worklets are up. The kit
    // waits for the same promise before it reads an accessor.
    await (synth as { ready?: Promise<unknown> }).ready;
    built.set(id, synth);
  }
}, 60_000);

afterAll(() => {
  for (const synth of built.values()) {
    (synth as { dispose?: () => void }).dispose?.();
  }
});

// ---------------------------------------------------------------------------
// The source, when there is no audio to ask
// ---------------------------------------------------------------------------

function source(id: string): string {
  return readFileSync(join(LEARN, "patches", `${id}.ts`), "utf8");
}

/** The text between a `{` and the `}` that closes it. */
function braced(text: string, from: number): string {
  const open = text.indexOf("{", from);
  if (open < 0) return "";
  let depth = 0;
  for (let index = open; index < text.length; index++) {
    if (text[index] === "{") depth++;
    else if (text[index] === "}" && --depth === 0) {
      return text.slice(open + 1, index);
    }
  }
  return "";
}

/**
 * The keys of `exposes: { … }`, read rather than run.
 *
 * Shorthand (`osc`) and long form (`gate: gate.input`) both, at the top level
 * only - a nested object belongs to a key, not beside it.
 */
function exposesFromSource(id: string): Set<string> {
  const body = braced(source(id), source(id).indexOf("exposes:"));
  const keys = new Set<string>();
  let depth = 0;
  let current = "";
  for (const character of body) {
    if ("{[(".includes(character)) depth++;
    else if ("}])".includes(character)) depth--;
    if (depth === 0 && character === ",") {
      const key = /^\s*([A-Za-z_$][\w$]*)/.exec(current)?.[1];
      if (key) keys.add(key);
      current = "";
    } else current += character;
  }
  const last = /^\s*([A-Za-z_$][\w$]*)/.exec(current)?.[1];
  if (last) keys.add(last);
  return keys;
}

/** The names a patch imported from the library, aliases included. */
function libraryImports(id: string): Set<string> {
  const names = new Set<string>();
  const pattern =
    /import\s+(?:type\s+)?\{([^}]*)\}\s+from\s+["'](?:synthlet|@synthlet\/[^"']+)["']/g;
  for (const [, clause] of source(id).matchAll(pattern)) {
    for (const part of clause.split(",")) {
      for (const name of part.trim().split(/\s+as\s+/)) {
        const identifier = /^[A-Za-z_$][\w$]*$/.exec(name.trim())?.[0];
        if (identifier) names.add(identifier);
      }
    }
  }
  return names;
}

/** What the box publishes, whichever way this run can ask. */
function exposed(id: string): Set<string> {
  const synth = built.get(id);
  if (!synth) return exposesFromSource(id);
  return new Set(Object.keys(synth));
}

/** An `AudioParam`, or the plain `{ value }` accessor a compound may expose. */
function isParameter(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const candidate = value as { value?: unknown; setValueAtTime?: unknown };
  return (
    typeof candidate.setValueAtTime === "function" ||
    typeof candidate.value === "number"
  );
}

// ---------------------------------------------------------------------------
// The rules
// ---------------------------------------------------------------------------

describe(`declared diagrams (${HOW})`, () => {
  it("finds diagrams to check", () => {
    expect(declared.length).toBeGreaterThan(0);
  });

  it("connects boxes that exist", () => {
    const violations: string[] = [];

    for (const [id, patch] of declared) {
      const nodes = nodesOf(patch);
      const edges = edgesOf(patch);
      const seen = new Set<string>();

      for (const node of nodes) {
        if (seen.has(node.id)) {
          violations.push(
            `${at(id, node.label)} - two boxes share the id "${node.id}"`,
          );
        }
        seen.add(node.id);
      }

      for (const edge of edges) {
        for (const end of [edge.from, edge.to]) {
          if (!seen.has(end)) {
            violations.push(
              `${at(id, end)} - an edge to a box that is not declared`,
            );
          }
        }
        if (edge.from === edge.to) {
          violations.push(`${at(id, edge.from)} - an edge to itself`);
        }
      }

      if (nodes.length > 1) {
        for (const node of nodes) {
          const connected = edges.some(
            (edge) => edge.from === node.id || edge.to === node.id,
          );
          if (!connected) {
            violations.push(`${at(id, node.label)} - a box with no cable`);
          }
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it("labels a box with a module the patch imports", () => {
    const violations: string[] = [];

    for (const [id, patch] of declared) {
      const imported = libraryImports(id);
      for (const node of nodesOf(patch)) {
        // `out` is the speaker and a controller is the reader's hands; neither
        // is a module, and neither has a name the library could confirm.
        if (node.kind === "output" || node.kind === "controller") continue;
        if (!/^[A-Z]/.test(node.label)) continue;
        if (!imported.has(node.label)) {
          violations.push(
            `${at(id, node.label)} - not a name this patch imports from ` +
              `synthlet (${[...imported].join(", ") || "nothing"}). A node ` +
              `label is the library's name for the module`,
          );
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it("is a box the compound exposes", () => {
    const violations: string[] = [];

    for (const [id, patch] of declared) {
      const keys = exposed(id);
      for (const node of nodesOf(patch)) {
        const declaredKeys = exposedKeys(node);
        if (node.kind === "output" || node.kind === "controller") {
          // Optional there, but still checked when it is given.
        } else if (declaredKeys.length === 0) {
          violations.push(
            `${at(id, node.label)} - no exposedAs. A source or a modifier is a ` +
              `module the compound owns, so it has a key on exposes`,
          );
        }
        for (const key of declaredKeys) {
          if (!keys.has(key)) {
            violations.push(
              `${at(id, node.label)} - exposedAs "${key}" is not on the ` +
                `compound (${[...keys].sort().join(", ")})`,
            );
          }
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it.skipIf(!CAN_BUILD)("arrives at a parameter that exists", () => {
    const violations: string[] = [];

    for (const [id, patch] of declared) {
      const synth = built.get(id);
      if (!synth) continue;
      const nodes = nodesOf(patch);

      for (const edge of edgesOf(patch)) {
        if (edge.param === undefined) continue;
        const target = nodes.find((node) => node.id === edge.to);
        if (!target) continue;

        const keys = exposedKeys(target);
        // The compound itself when the box is the output: `out` is the
        // compound's own node, and `gain` is a parameter on it.
        const carriers =
          keys.length > 0 ? keys.map((key) => synth[key]) : [synth];
        const found = carriers.some((carrier) =>
          isParameter((carrier as Record<string, unknown>)?.[edge.param!]),
        );

        if (!found) {
          violations.push(
            `${at(id, target.label)} - a control edge arrives at ` +
              `"${edge.param}", which is not a parameter of it`,
          );
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it("marks controls the patch has", () => {
    const violations: string[] = [];

    for (const [id, patch] of declared) {
      const known = new Set(patch.controls.map((control) => control.id));
      for (const node of nodesOf(patch)) {
        for (const control of node.controls ?? []) {
          if (!known.has(control)) {
            violations.push(
              `${at(id, node.label)} - marks "${control}", which is not one ` +
                `of this patch's controls (${[...known].join(", ")})`,
            );
          }
        }
      }
    }

    expect(violations).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// The drawing
// ---------------------------------------------------------------------------

const HARMONICS: DiagramControl[] = [
  { id: "harmonics", label: "Harmonics" },
  { id: "cutoff", label: "Cutoff" },
  { id: "strip", label: "Strip harmonics" },
];

function harmonicsGraph() {
  const patch = patches["sound/harmonics"];
  if (!patch.diagram || patch.diagram === "auto") {
    throw Error("sound/harmonics no longer declares a diagram");
  }
  return toGraph(patch.diagram, HARMONICS);
}

describe("a declared diagram, as a graph", () => {
  it("marks a control on the box that exposes it, and on the box that names it", () => {
    const graph = harmonicsGraph();
    const marks = Object.fromEntries(
      graph.nodes.map((node) => [
        node.id,
        node.controls.map((control) => control.id),
      ]),
    );

    expect(marks).toEqual({
      // `harmonics` is an exposes key *and* a control id, so nothing had to say
      // so; `cutoff` writes `s.filter.frequency` and is named by the box.
      osc: ["harmonics"],
      filter: ["cutoff", "strip"],
      out: [],
    });
    expect(controlNodes(graph).get("cutoff")).toBe("filter");
  });

  it("keeps the controls in the panel's order", () => {
    const graph = harmonicsGraph();
    const filter = graph.nodes.find((node) => node.id === "filter");
    expect(filter?.controls.map((control) => control.label)).toEqual([
      "Cutoff",
      "Strip harmonics",
    ]);
  });

  it("reads as a sentence", () => {
    expect(describeDiagram(harmonicsGraph())).toBe(
      "Signal flow: WavetableOscillator into Svf, Svf into out",
    );
  });

  it("drops an edge to a box that does not exist rather than throwing", () => {
    const graph = toGraph({
      nodes: [{ id: "a", label: "Gain" }],
      edges: [{ from: "a", to: "ghost" }],
    });
    expect(graph.edges).toEqual([]);
  });
});

describe("graph(), converted", () => {
  // The shape `thoughts/tickets/graph-introspection.md` specifies, by hand:
  // the auto branch is tested before there is anything to read it from.
  const enumerated: LibraryGraph = {
    root: 3,
    nodes: [
      {
        id: 1,
        label: "PolyblepOscillator",
        kind: "worklet",
        exposedAs: ["osc"],
      },
      {
        id: 2,
        label: "AdsrAmp",
        kind: "worklet",
        exposedAs: ["amp", "attack"],
      },
      { id: 3, label: "Gain", kind: "native" },
    ],
    edges: [
      { from: 1, to: 2 },
      { from: 2, to: 3 },
    ],
  };

  it("numbers become ids, and the root is the output", () => {
    const graph = fromLibraryGraph(enumerated, [
      { id: "attack", label: "Attack" },
    ]);
    expect(graph.nodes.map((node) => [node.id, node.kind])).toEqual([
      ["1", "source"],
      ["2", "modifier"],
      ["3", "output"],
    ]);
    expect(graph.edges).toEqual([
      { from: "1", to: "2", param: undefined },
      { from: "2", to: "3", param: undefined },
    ]);
  });

  it("marks a control on the node the library exposes it as", () => {
    const graph = fromLibraryGraph(enumerated, [
      { id: "attack", label: "Attack" },
    ]);
    expect(controlNodes(graph).get("attack")).toBe("2");
  });
});

describe("the layering pass", () => {
  it("puts the chain in a line, left to right", () => {
    const layout = layoutDiagram(harmonicsGraph());
    expect(
      layout.nodes.map((node) => [node.node.id, node.column, node.row]),
    ).toEqual([
      ["osc", 0, 0],
      ["filter", 1, 0],
      ["out", 2, 0],
    ]);
    expect(layout.edges.every((edge) => edge.kind === "audio")).toBe(true);
    expect(layout.edges).toHaveLength(2);
  });

  it("draws a straight cable between two boxes of a different width", () => {
    const layout = layoutDiagram(harmonicsGraph());
    // Boxes are centred in their column, so the middles line up and the cable
    // is one horizontal move.
    expect(layout.edges[0].path).not.toContain("V");
    expect(layout.edges[0].arrow).toBeTruthy();
  });

  it("stays inside a lesson's width and a handful of lines", () => {
    const layout = layoutDiagram(harmonicsGraph());
    expect(layout.width).toBeLessThan(700);
    expect(layout.height).toBeLessThan(60);
  });

  it("hangs a controller under the box it controls, with a port", () => {
    const graph = toGraph({
      nodes: [
        { id: "osc", label: "PolyblepOscillator", kind: "source" },
        { id: "amp", label: "AdsrAmp", kind: "modifier" },
        { id: "out", label: "out", kind: "output" },
        { id: "keys", label: "keyboard", kind: "controller" },
      ],
      edges: [
        { from: "osc", to: "amp" },
        { from: "amp", to: "out" },
        { from: "keys", to: "amp", param: "gate" },
      ],
    });
    const layout = layoutDiagram(graph);

    const keys = layout.nodes.find((node) => node.node.id === "keys");
    const amp = layout.nodes.find((node) => node.node.id === "amp");
    expect([keys?.column, keys?.row]).toEqual([amp?.column, 1]);

    const cable = layout.edges.find((edge) => edge.from === "keys");
    expect(cable?.kind).toBe("control");
    expect(cable?.param).toBe("gate");
    // Straight up from under it, into a port on the bottom edge.
    expect(cable?.path.startsWith(`M ${keys?.centerX}`)).toBe(true);
    expect(cable?.path).not.toContain("H");
    expect(cable?.port?.y).toBe((amp?.y ?? 0) + (amp?.height ?? 0));
  });

  it("drops the port labels when a lesson asks for a compact diagram", () => {
    const graph = toGraph({
      nodes: [
        { id: "lfo", label: "Lfo", kind: "controller" },
        { id: "osc", label: "PolyblepOscillator", kind: "source" },
        { id: "out", label: "out", kind: "output" },
      ],
      edges: [
        { from: "osc", to: "out" },
        { from: "lfo", to: "osc", param: "frequency" },
      ],
    });

    const cable = (compact: boolean) =>
      layoutDiagram(graph, { compact }).edges.find(
        (edge) => edge.kind === "control",
      );

    // The port stays - a cable has to arrive somewhere - and only its name goes.
    expect(cable(false)?.port?.label).toBeTruthy();
    expect(cable(true)?.port?.label).toBeUndefined();
    expect(cable(true)?.port?.x).toBe(cable(false)?.port?.x);
  });

  it("settles a feedback loop instead of running forever", () => {
    const graph = toGraph({
      nodes: [
        { id: "delay", label: "DigitalDelay" },
        { id: "back", label: "Gain" },
      ],
      edges: [
        { from: "delay", to: "back" },
        { from: "back", to: "delay" },
      ],
    });
    const layout = layoutDiagram(graph);
    expect(layout.nodes).toHaveLength(2);
    expect(layout.width).toBeGreaterThan(0);
  });
});
