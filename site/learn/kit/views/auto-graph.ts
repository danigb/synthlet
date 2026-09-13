import * as synthlet from "synthlet";
import {
  fromLibraryGraph,
  type DiagramControl,
  type DiagramGraph,
  type LibraryGraph,
} from "./layout";

/*
 * `diagram: "auto"`, and the check that keeps it harmless until it works.
 *
 * The honest source for a diagram is the running graph, and the library cannot
 * enumerate one yet: `graph()` is `thoughts/tickets/graph-introspection.md` and
 * has not landed. So the export is looked for rather than imported, and a patch
 * that asks for `"auto"` today draws nothing instead of failing to build. The
 * day the ticket lands this file becomes `import { graph } from "synthlet"` and
 * the three lines below become one; nothing else in the kit changes, because
 * `layout.ts` already speaks that ticket's `Graph`.
 *
 * The namespace import is the cost of the check. It is a small one here:
 * `app/audio-context.ts` imports `registerAllWorklets`, which reaches every
 * package's index, so every module this pulls in is already in the bundle - what
 * is retained that would not otherwise be is a handful of named exports from
 * modules that are there either way.
 */

type GraphFn = (
  synth: unknown,
  options?: { depth?: number },
) => LibraryGraph | undefined;

/** `graph()`, or `undefined` until the library has one. */
export function libraryGraph(): GraphFn | undefined {
  const candidate = (synthlet as unknown as Record<string, unknown>).graph;
  return typeof candidate === "function" ? (candidate as GraphFn) : undefined;
}

/**
 * The running compound, as a graph the renderer can draw.
 *
 * `depth: 1` because an `Instrument` is *n* copies of one voice behind a
 * fan-out, and the lesson means the voice: the introspection ticket's option for
 * "draw one voice, not eight". Nothing is drawn before the reader has touched
 * the widget, because nothing is built before then either.
 */
export function readAutoGraph(
  synth: unknown,
  controls: DiagramControl[],
): DiagramGraph | undefined {
  const graph = libraryGraph();
  if (!graph || synth === null || synth === undefined) return undefined;
  try {
    const enumerated = graph(synth, { depth: 1 });
    if (!enumerated || enumerated.nodes.length === 0) return undefined;
    return fromLibraryGraph(enumerated, controls);
  } catch {
    // A diagram is never worth a blank lesson. The declared form is checked by
    // a test; this one is at the mercy of whatever the library returns.
    return undefined;
  }
}
