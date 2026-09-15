"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Control } from "../../patches/define";
import type { DiagramControl } from "./layout";

/*
 * The line between a knob and the box it turns.
 *
 * The diagram and the control panel are two views of one patch, and the thing
 * that makes that legible is being able to point at either and see the other
 * light up. Both directions, because both questions get asked: "what does this
 * slider do to the sound" and "what can I change about this box".
 *
 * It is a context rather than props because of where the two halves sit. The
 * panel is `LessonWidget`'s, the diagram is one cell in the row of views above
 * it, and threading a hover through `renderView` would put a diagram's
 * parameter into the signature every view shares. The widget owns the state -
 * one `useState` - and publishes it; whoever cares reads it.
 *
 * The index the other way round (which box a control is marked on) is the
 * *diagram's* to know: it is the one that converted a declared diagram, or read
 * `graph()`, into boxes. So it hands the index back through a ref. A ref and
 * not state, deliberately - it is written during the diagram's effect and only
 * ever read during a render the hover already caused, so storing it in state
 * would be a second render for information nothing was waiting on.
 */

export type DiagramHover = { kind: "control" | "node"; id: string } | null;

export interface DiagramLink {
  /** The controls the lesson is showing, in panel order: what the boxes mark. */
  controls: DiagramControl[];
  hovered: DiagramHover;
  hover(target: DiagramHover): void;
  /** Publish which box each control is marked on. The diagram calls it. */
  setControlNodes(index: Map<string, string>): void;
  /** Is this control lit - because it, or the box it is marked on, is pointed at? */
  isLinked(controlId: string): boolean;
  /** Is this box lit? */
  isNodeLinked(nodeId: string): boolean;
  /** What a control's cell in the panel needs to join in. */
  cellProps(controlId: string): {
    onPointerEnter: () => void;
    onPointerLeave: () => void;
    onFocus: () => void;
    onBlur: () => void;
    "data-diagram-linked"?: string;
  };
}

/** A widget with no diagram: every member inert, nothing ever lights up. */
const INERT: DiagramLink = {
  controls: [],
  hovered: null,
  hover: () => {},
  setControlNodes: () => {},
  isLinked: () => false,
  isNodeLinked: () => false,
  cellProps: () => ({
    onPointerEnter: () => {},
    onPointerLeave: () => {},
    onFocus: () => {},
    onBlur: () => {},
  }),
};

const DiagramLinkContext = createContext<DiagramLink>(INERT);

/**
 * The widget's half: the state, and the props a control cell spreads.
 *
 * `hover` does nothing at all until a diagram has published an index, so a
 * lesson whose patch declares no diagram - most of them, today - renders and
 * re-renders exactly as it did before this existed.
 */
export function useDiagramLink(controls: Control[]): DiagramLink {
  const [hovered, setHovered] = useState<DiagramHover>(null);
  const index = useRef(new Map<string, string>());

  const shown = useMemo(
    () => controls.map(({ id, label }) => ({ id, label })),
    [controls],
  );

  const hover = useCallback((target: DiagramHover) => {
    if (index.current.size === 0) return;
    setHovered(target);
  }, []);

  const setControlNodes = useCallback((next: Map<string, string>) => {
    index.current = next;
  }, []);

  return useMemo(() => {
    const isLinked = (controlId: string) => {
      const node = index.current.get(controlId);
      if (node === undefined || hovered === null) return false;
      return hovered.kind === "control"
        ? hovered.id === controlId
        : hovered.id === node;
    };

    return {
      controls: shown,
      hovered,
      hover,
      setControlNodes,
      isLinked,
      isNodeLinked: (nodeId: string) => {
        if (hovered === null) return false;
        return hovered.kind === "node"
          ? hovered.id === nodeId
          : index.current.get(hovered.id) === nodeId;
      },
      cellProps: (controlId: string) => ({
        onPointerEnter: () => hover({ kind: "control", id: controlId }),
        onPointerLeave: () => hover(null),
        // Focus, not only the pointer: a reader tabbing through the knobs gets
        // the same link a reader with a mouse gets.
        onFocus: () => hover({ kind: "control", id: controlId }),
        onBlur: () => hover(null),
        "data-diagram-linked": isLinked(controlId) ? "true" : undefined,
      }),
    };
  }, [shown, hovered, hover, setControlNodes]);
}

export function DiagramLinkProvider({
  value,
  children,
}: {
  value: DiagramLink;
  children: ReactNode;
}) {
  return (
    <DiagramLinkContext.Provider value={value}>
      {children}
    </DiagramLinkContext.Provider>
  );
}

/** The diagram's half. Inert outside a widget, so the view renders anywhere. */
export function useDiagramLinkContext(): DiagramLink {
  return useContext(DiagramLinkContext);
}
