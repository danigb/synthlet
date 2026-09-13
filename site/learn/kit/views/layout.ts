import type {
  Diagram,
  DiagramNode,
  DiagramNodeKind,
} from "../../patches/define";

/*
 * A patch, laid out as Reid draws one.
 *
 * Every figure in Synth Secrets is the same picture: sources on the left,
 * modifiers in a line after them, the output on the right, and the controllers
 * hanging underneath with their cables running up into a named parameter. That
 * is not a general graph, and this file is not a general graph layout - it is a
 * layering pass over a handful of boxes, which is all any patch in the tutorial
 * has ever needed.
 *
 * It is deliberately pure: no React, no DOM, no measurement. Text width is
 * estimated from the monospace advance rather than measured, which costs a few
 * pixels of slack around a label and buys a layout that `diagrams.test.ts` can
 * assert on in node, with no browser anywhere.
 *
 * Two things feed it, and they converge here on purpose. A patch's declared
 * `diagram` is one; `graph()` - the library's own enumeration of a running
 * compound, `thoughts/tickets/graph-introspection.md` - is the other, and the
 * day it lands `fromLibraryGraph` is the only new code the drawing needs.
 */

/** A control as the panel shows it: the id a lesson wrote, and its label. */
export interface DiagramControl {
  id: string;
  label: string;
}

export interface DiagramGraphNode {
  id: string;
  label: string;
  kind: DiagramNodeKind;
  /** Every key on the compound's `exposes` this box is published under. */
  exposedAs: string[];
  /** The controls the lesson is showing that belong to this box, in panel order. */
  controls: DiagramControl[];
}

export interface DiagramGraphEdge {
  from: string;
  to: string;
  /** A control edge names the parameter port it arrives at; audio edges do not. */
  param?: string;
}

export interface DiagramGraph {
  nodes: DiagramGraphNode[];
  edges: DiagramGraphEdge[];
}

/** The declared half of `Diagram`: what a patch writes today. */
export type DeclaredDiagram = Exclude<Diagram, "auto">;

/*
 * `graph()`'s shape, restated.
 *
 * It is `thoughts/tickets/graph-introspection.md:131-136`, declared here rather
 * than imported because the library does not export it yet. Structural, so the
 * day it does the import replaces these three interfaces and nothing else
 * changes; `diagrams.test.ts` builds one by hand to prove the conversion works
 * before there is anything to convert.
 */
export interface LibraryGraphNode {
  id: number;
  label: string;
  kind: "worklet" | "native" | "compound";
  exposedAs?: string[];
}

export interface LibraryGraphEdge {
  from: number;
  to: number;
  param?: string;
}

export interface LibraryGraph {
  nodes: LibraryGraphNode[];
  edges: LibraryGraphEdge[];
  root: number;
}

/** `exposedAs` as a list, whichever of its two forms was written. */
export function exposedKeys(node: Pick<DiagramNode, "exposedAs">): string[] {
  const exposed = node.exposedAs;
  if (exposed === undefined) return [];
  return typeof exposed === "string" ? [exposed] : exposed;
}

/**
 * Which shelf a box sits on, when the patch did not say.
 *
 * The graph answers it: a box nothing feeds is a source, a box that feeds
 * nothing is the output, everything between is a modifier. A controller is the
 * one kind that cannot be inferred - a box whose only cable is a control edge
 * *is* a controller, and that is what the last case says.
 */
function inferKind(id: string, edges: DiagramGraphEdge[]): DiagramNodeKind {
  const audio = edges.filter((edge) => edge.param === undefined);
  const feeds = audio.some((edge) => edge.from === id);
  const fed = audio.some((edge) => edge.to === id);
  if (!feeds && !fed) return "controller";
  if (!fed) return "source";
  if (!feeds) return "output";
  return "modifier";
}

/**
 * The controls marked on one box.
 *
 * Two ways in, and both are declarations rather than derivations, because an
 * accessor is a function: `(s) => s.filter.frequency` cannot be asked which key
 * it went through. So a control whose id is one of the box's `exposes` keys is
 * tied by name - the common case, `harmonics` and `strip` - and `controls`
 * names the rest. `diagrams.test.ts` checks both against the patch.
 */
function markedControls(
  node: DiagramNode,
  controls: DiagramControl[],
): DiagramControl[] {
  const own = new Set([...exposedKeys(node), ...(node.controls ?? [])]);
  return controls.filter((control) => own.has(control.id));
}

/**
 * A declared diagram, as the renderer's graph.
 *
 * An edge naming a node that does not exist is dropped rather than thrown on:
 * a broken declaration should fail the test with the patch's id in the message,
 * not the lesson page in the reader's browser.
 */
export function toGraph(
  diagram: DeclaredDiagram,
  controls: DiagramControl[] = [],
): DiagramGraph {
  const ids = new Set(diagram.nodes.map((node) => node.id));
  const edges = diagram.edges.filter(
    (edge) => ids.has(edge.from) && ids.has(edge.to) && edge.from !== edge.to,
  );

  return {
    nodes: diagram.nodes.map((node) => ({
      id: node.id,
      label: node.label,
      kind: node.kind ?? inferKind(node.id, edges),
      exposedAs: exposedKeys(node),
      controls: markedControls(node, controls),
    })),
    edges: edges.map(({ from, to, param }) => ({ from, to, param })),
  };
}

/**
 * `graph(synth)`, as the renderer's graph.
 *
 * The library numbers its nodes and the drawing keys on strings, which is the
 * whole of the difference. `root` is the compound's own output, so it is the
 * box every other one ends at; the rest of the kinds are read off the edges,
 * because "worklet or native" is a fact about implementation and "source or
 * modifier" is the one the picture is about.
 */
export function fromLibraryGraph(
  graph: LibraryGraph,
  controls: DiagramControl[] = [],
): DiagramGraph {
  const edges = graph.edges.map((edge) => ({
    from: String(edge.from),
    to: String(edge.to),
    param: edge.param,
  }));

  return {
    nodes: graph.nodes.map((node) => {
      const id = String(node.id);
      const exposedAs = node.exposedAs ?? [];
      const own = new Set(exposedAs);
      return {
        id,
        label: node.label,
        kind: node.id === graph.root ? "output" : inferKind(id, edges),
        exposedAs,
        controls: controls.filter((control) => own.has(control.id)),
      };
    }),
    edges,
  };
}

/** Which box each control is marked on: the hover link, both directions. */
export function controlNodes(graph: DiagramGraph): Map<string, string> {
  const index = new Map<string, string>();
  for (const node of graph.nodes) {
    for (const control of node.controls) index.set(control.id, node.id);
  }
  return index;
}

/**
 * The diagram as a sentence, for a screen reader.
 *
 * A picture of a signal chain is a list of connections read aloud, which is
 * what `aria-label` gets. Labels rather than ids: they are the library's module
 * names, which is what the prose around the widget calls them.
 */
export function describeDiagram(graph: DiagramGraph): string {
  const label = new Map(graph.nodes.map((node) => [node.id, node.label]));
  const name = (id: string) => label.get(id) ?? id;

  const parts = graph.edges.map((edge) =>
    edge.param === undefined
      ? `${name(edge.from)} into ${name(edge.to)}`
      : `${name(edge.from)} into ${name(edge.to)}'s ${edge.param}`,
  );

  if (parts.length === 0) {
    return graph.nodes.map((node) => node.label).join(", ");
  }
  return `Signal flow: ${parts.join(", ")}`;
}

/* -------------------------------------------------------------------------
 * Geometry
 *
 * User units, and the SVG is drawn one to one, so they are CSS pixels. They
 * are numbers rather than tokens on purpose: rule 4 is about colour, font and
 * radius - the things a redesign changes - and a diagram's spacing is the
 * drawing itself. What the theme does change is the box: `--learn-radius`
 * rounds or squares it, and the two cable colours are its own.
 * ---------------------------------------------------------------------- */

/** 0.6 em is the advance of every font `--learn-font-mono` names. */
const ADVANCE = 0.6;
const LABEL_SIZE = 12;
const CONTROL_SIZE = 10;
const PORT_SIZE = 10;

const BOX_PADDING_X = 12;
const BOX_PADDING_Y = 9;
const LABEL_LINE = 14;
const CONTROL_LINE = 12;
const MIN_BOX_WIDTH = 64;

const COLUMN_GAP = 40;
const ROW_GAP = 26;

/** How far under the boxes a control cable runs when it cannot go straight up. */
const LANE_GAP = 16;
/** Room under a box for a port label, so the drawing does not clip it. */
const PORT_LABEL_DROP = 13;

const ARROW = 7;
const ARROW_HALF = 3.5;
/** The port itself: a dot where the cable meets the box. */
export const PORT_RADIUS = 2.5;

export interface PlacedNode {
  node: DiagramGraphNode;
  x: number;
  y: number;
  width: number;
  height: number;
  /** Text is centred in the box, so this is the anchor, not the left edge. */
  centerX: number;
  labelY: number;
  /** The controls line, when the box carries one. */
  controls?: { text: string; y: number };
  column: number;
  row: number;
}

export interface PlacedEdge {
  /** Unique within the diagram: React's key, and the test's handle. */
  id: string;
  kind: "audio" | "control";
  from: string;
  to: string;
  /** The cable, as SVG path data. */
  path: string;
  /** The arrowhead, as a closed path. */
  arrow: string;
  param?: string;
  /**
   * Where a control edge lands: the dot on the box's edge, and - unless the
   * lesson asked for a compact diagram - where the parameter's name goes.
   */
  port?: { x: number; y: number; label?: { x: number; y: number } };
}

export interface DiagramLayout {
  nodes: PlacedNode[];
  edges: PlacedEdge[];
  width: number;
  height: number;
}

/** What a string is wide, given the size it is drawn at. */
function textWidth(text: string, size: number): number {
  return text.length * size * ADVANCE;
}

function boxWidth(label: string, controls: string): number {
  const widest = Math.max(
    textWidth(label, LABEL_SIZE),
    textWidth(controls, CONTROL_SIZE),
  );
  return Math.max(MIN_BOX_WIDTH, Math.round(widest + 2 * BOX_PADDING_X));
}

function boxHeight(hasControls: boolean): number {
  return 2 * BOX_PADDING_Y + LABEL_LINE + (hasControls ? CONTROL_LINE : 0);
}

/** An arrowhead: a filled triangle whose tip is the point the cable arrives at. */
function arrowhead(x: number, y: number, direction: "right" | "up"): string {
  if (direction === "up") {
    return `M ${x} ${y} L ${x - ARROW_HALF} ${y + ARROW} L ${x + ARROW_HALF} ${y + ARROW} Z`;
  }
  return `M ${x} ${y} L ${x - ARROW} ${y - ARROW_HALF} L ${x - ARROW} ${y + ARROW_HALF} Z`;
}

const round = (value: number) => Math.round(value * 10) / 10;

/**
 * Which column each box sits in.
 *
 * Longest path over the audio edges alone, which is what makes the picture read
 * left to right in signal order: a box sits one column to the right of
 * everything that feeds it. Control edges are deliberately not part of it - an
 * LFO into a filter's cutoff is drawn *under* the filter, not before it, and
 * letting it push columns around would stretch the chain for a cable that is
 * not in it.
 *
 * The relaxation is capped at one pass per node, so a feedback loop - a delay
 * returning into its own input - settles instead of running forever.
 */
function columns(graph: DiagramGraph): Map<string, number> {
  const audio = graph.edges.filter((edge) => edge.param === undefined);
  const column = new Map<string, number>();

  const inChain = new Set<string>();
  for (const edge of audio) {
    inChain.add(edge.from);
    inChain.add(edge.to);
  }
  for (const node of graph.nodes)
    if (inChain.has(node.id)) column.set(node.id, 0);

  for (let pass = 0; pass < graph.nodes.length; pass++) {
    let moved = false;
    for (const edge of audio) {
      const from = column.get(edge.from);
      const to = column.get(edge.to);
      if (from === undefined || to === undefined) continue;
      if (to < from + 1) {
        column.set(edge.to, from + 1);
        moved = true;
      }
    }
    if (!moved) break;
  }

  // A controller is in no chain, so it takes the column of the first box it
  // controls and hangs under it. Anything left over - a box with no cable at
  // all, which the test calls an orphan - starts the diagram.
  for (const node of graph.nodes) {
    if (column.has(node.id)) continue;
    const target = graph.edges.find((edge) => edge.from === node.id)?.to;
    column.set(
      node.id,
      (target === undefined ? undefined : column.get(target)) ?? 0,
    );
  }

  // Close the gaps. A feedback loop leaves holes in the numbering - the
  // relaxation above pushes a box right once per pass until the cap stops it -
  // and a hole would be drawn as an empty column of nothing.
  const used = [...new Set(column.values())].sort((a, b) => a - b);
  const packed = new Map(used.map((value, index) => [value, index]));
  for (const [id, value] of column) column.set(id, packed.get(value) ?? 0);

  return column;
}

/** Row 0 is the chain; controllers stack underneath, one row each. */
function rows(
  graph: DiagramGraph,
  column: Map<string, number>,
): Map<string, number> {
  const audio = graph.edges.filter((edge) => edge.param === undefined);
  const inChain = new Set<string>();
  for (const edge of audio) {
    inChain.add(edge.from);
    inChain.add(edge.to);
  }

  const row = new Map<string, number>();
  const taken = new Map<number, number>();
  for (const node of graph.nodes) {
    if (inChain.has(node.id) || graph.nodes.length === 1) {
      row.set(node.id, 0);
    }
  }
  for (const node of graph.nodes) {
    if (row.has(node.id)) continue;
    const at = column.get(node.id) ?? 0;
    const next = (taken.get(at) ?? 0) + 1;
    taken.set(at, next);
    row.set(node.id, next);
  }
  return row;
}

/**
 * Boxes and cables, placed.
 *
 * Columns and rows first, then the widest box in a column decides its width and
 * the tallest in a row decides its height, and every box is centred in its
 * cell - which is what makes an audio cable between two boxes of different
 * widths a straight horizontal line rather than a staircase.
 */
export function layoutDiagram(
  graph: DiagramGraph,
  options: { compact?: boolean } = {},
): DiagramLayout {
  if (graph.nodes.length === 0) {
    return { nodes: [], edges: [], width: 0, height: 0 };
  }

  const column = columns(graph);
  const row = rows(graph, column);

  const measured = graph.nodes.map((node) => {
    const controls = node.controls.map((control) => control.label).join(" · ");
    return {
      node,
      controls,
      width: boxWidth(node.label, controls),
      height: boxHeight(controls.length > 0),
      column: column.get(node.id) ?? 0,
      row: row.get(node.id) ?? 0,
    };
  });

  const columnWidth: number[] = [];
  const rowHeight: number[] = [];
  for (const box of measured) {
    columnWidth[box.column] = Math.max(columnWidth[box.column] ?? 0, box.width);
    rowHeight[box.row] = Math.max(rowHeight[box.row] ?? 0, box.height);
  }

  const columnX: number[] = [];
  let x = 0;
  for (let index = 0; index < columnWidth.length; index++) {
    columnX[index] = x;
    x += (columnWidth[index] ?? 0) + COLUMN_GAP;
  }

  const rowY: number[] = [];
  let y = 0;
  for (let index = 0; index < rowHeight.length; index++) {
    rowY[index] = y;
    y += (rowHeight[index] ?? 0) + ROW_GAP;
  }

  const nodes: PlacedNode[] = measured.map((box) => {
    const left =
      columnX[box.column] + ((columnWidth[box.column] ?? 0) - box.width) / 2;
    const top = rowY[box.row] + ((rowHeight[box.row] ?? 0) - box.height) / 2;
    return {
      node: box.node,
      x: round(left),
      y: round(top),
      width: box.width,
      height: box.height,
      centerX: round(left + box.width / 2),
      labelY: round(top + BOX_PADDING_Y + LABEL_SIZE - 1),
      controls:
        box.controls.length > 0
          ? {
              text: box.controls,
              y: round(top + BOX_PADDING_Y + LABEL_LINE + CONTROL_SIZE - 1),
            }
          : undefined,
      column: box.column,
      row: box.row,
    };
  });

  const placed = new Map(nodes.map((node) => [node.node.id, node]));
  const boxesBottom = Math.max(...nodes.map((node) => node.y + node.height));
  const laneY = boxesBottom + LANE_GAP;
  let bottom = boxesBottom;

  const edges: PlacedEdge[] = [];
  for (const edge of graph.edges) {
    const from = placed.get(edge.from);
    const to = placed.get(edge.to);
    if (!from || !to) continue;

    const id = `${edge.from}-${edge.to}-${edge.param ?? "audio"}`;
    const control = edge.param !== undefined;
    const fromMiddle = round(from.y + from.height / 2);
    const toMiddle = round(to.y + to.height / 2);

    // An audio cable goes in the left side; a control cable comes up into the
    // bottom, which is where Reid puts every modulation input.
    if (!control && to.x >= from.x + from.width) {
      const startX = round(from.x + from.width);
      const endX = round(to.x);
      const path =
        fromMiddle === toMiddle
          ? `M ${startX} ${fromMiddle} H ${endX - ARROW}`
          : `M ${startX} ${fromMiddle} H ${round((startX + endX) / 2)} V ${toMiddle} H ${endX - ARROW}`;
      edges.push({
        id,
        kind: "audio",
        from: edge.from,
        to: edge.to,
        path,
        arrow: arrowhead(endX, toMiddle, "right"),
      });
      continue;
    }

    // Straight up when the box sits under the one it controls - the column is
    // the same, and boxes are centred in their column, so the cable is vertical.
    const tip = round(to.y + to.height);
    const straight = from.column === to.column && from.row > to.row;
    const path = straight
      ? `M ${from.centerX} ${round(from.y)} V ${tip + ARROW}`
      : `M ${from.centerX} ${round(from.y + from.height)} V ${round(laneY)} H ${to.centerX} V ${tip + ARROW}`;

    if (!straight) bottom = Math.max(bottom, laneY);

    const label =
      edge.param === undefined || options.compact
        ? undefined
        : {
            x: round(to.centerX + PORT_RADIUS + 4),
            y: round(tip + PORT_LABEL_DROP),
          };
    const port =
      edge.param === undefined ? undefined : { x: to.centerX, y: tip, label };
    if (label) bottom = Math.max(bottom, label.y + 3);

    edges.push({
      id,
      kind: control ? "control" : "audio",
      from: edge.from,
      to: edge.to,
      path,
      arrow: arrowhead(to.centerX, tip, "up"),
      param: edge.param,
      port,
    });
  }

  return {
    nodes,
    edges,
    width: Math.round(Math.max(...nodes.map((node) => node.x + node.width))),
    height: Math.round(bottom),
  };
}

/** The sizes the view draws text at, so the two files cannot disagree. */
export const DIAGRAM_TEXT = {
  label: LABEL_SIZE,
  controls: CONTROL_SIZE,
  port: PORT_SIZE,
};
