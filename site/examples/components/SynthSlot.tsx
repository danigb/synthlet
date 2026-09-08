"use client";

import { createContext, useContext, useState } from "react";
import type { Synth } from "../useSynth";

/**
 * How the pane finds the synth its children built.
 *
 * The meter is chrome, so it belongs to `ExamplePane` and not to `useSynth` -
 * but every example calls `useSynth` *inside* the pane, so the synth is always
 * below the thing that wants to meter it. A context solves that in the right
 * direction: the pane creates the slot, `useSynth` fills it, and the pane's
 * header reads it. No example component changes, and two panes on one page each
 * get their own.
 */
export type SynthSlot = {
  set(synth: Synth | null): void;
  get(): Synth | null;
  subscribe(listener: () => void): () => void;
};

const SynthSlotContext = createContext<SynthSlot | null>(null);

export function createSynthSlot(): SynthSlot {
  let synth: Synth | null = null;
  const listeners = new Set<() => void>();
  return {
    set(next) {
      if (next === synth) return;
      synth = next;
      for (const listener of Array.from(listeners)) listener();
    },
    get: () => synth,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

/** A stable slot for the life of the component that owns it. */
export function useSynthSlot(): SynthSlot {
  const [slot] = useState(createSynthSlot);
  return slot;
}

export const SynthSlotProvider = SynthSlotContext.Provider;

/** The slot to publish into, or `null` outside a pane. */
export function useEnclosingSynthSlot(): SynthSlot | null {
  return useContext(SynthSlotContext);
}
