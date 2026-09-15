"use client";

import { createSynthAudioContext } from "@/app/audio-context";
import { useCallback, useEffect, useRef, useState } from "react";
import type {
  LessonPatch,
  ParamRef,
  PatchBuildOptions,
} from "../patches/define";
import { addLevelProbe, hooksEnabled, trackLive } from "./test-hooks";

/*
 * The widget's whole relationship with the audio thread.
 *
 * Two rules shape it, and both come from the docs examples:
 *
 * 1. **A page must not arrive making a sound.** The tutorial takes that one
 *    step further than `useSynth` does: it must not arrive having *built*
 *    anything either. `createSynthAudioContext()` constructs an `AudioContext`
 *    on its first call, and a lesson page that calls it on mount has created
 *    one before the reader has done anything - which a browser will hold
 *    suspended, and which is still a resource a page took without being asked.
 *    So nothing is built until the reader touches the widget.
 *
 * 2. **Touching a knob is not the same as pressing Play.** Building is silent:
 *    the graph ends in a gain at 0. So any interaction may build - moving a
 *    slider before pressing Play leaves a live graph waiting - and only Play,
 *    or a note, opens the gain and resumes the context. That is also why a
 *    write that arrives before the build has finished is remembered rather than
 *    dropped; a reader who drags a slider the instant the page loads is right,
 *    and the widget is what is late.
 */

export type PatchStatus = "idle" | "building" | "ready" | "failed";

export interface PatchRuntime<S = any> {
  patch: LessonPatch<S>;
  /** The built compound, or `null` until the first interaction has landed. */
  synth: S | null;
  status: PatchStatus;
  playing: boolean;
  /** Build, silently. Every control calls it when it is touched. */
  ensure(): void;
  /** Open or close the output gain; opening resumes the context. */
  setPlaying(on: boolean): void;
  /** A parameter's value, or `fallback` while there is nothing to ask. */
  read(ref: ParamRef<S>, fallback: number): number;
  /** Write a parameter, now or as soon as there is one. */
  write(ref: ParamRef<S>, value: number): void;
  /** Do something to the synth - a button, a note - now or once it exists. */
  call(action: (synth: S) => void): void;
}

/**
 * The compound's own output gain, when it ends in one.
 *
 * Duck-typed rather than `instanceof AudioParam`: a compound *is* its output
 * node, so this is asking "does the patch end in a gain", and the answer has to
 * be the same in a browser and in a test that has no Web Audio at all.
 */
function outputGain(synth: unknown): AudioParam | undefined {
  const gain = (synth as GainNode | null)?.gain;
  return gain && typeof gain.setTargetAtTime === "function" ? gain : undefined;
}

function dispose(synth: unknown) {
  (synth as { dispose?: () => void } | null)?.dispose?.();
}

/** 20 ms, the shortest ramp that does not click. */
const GATE_SECONDS = 0.02;

export function useLessonPatch<S>(
  patch: LessonPatch<S>,
  options: PatchBuildOptions,
): PatchRuntime<S> {
  const [synth, setSynth] = useState<S | null>(null);
  const [status, setStatus] = useState<PatchStatus>("idle");
  const [playing, setPlayingState] = useState(false);

  // Everything below the render: the live graph, and the two queues that make
  // "touch it before it exists" work.
  const live = useRef<{ ac: AudioContext; synth: S } | null>(null);
  const writes = useRef<{ ref: ParamRef<S>; value: number }[]>([]);
  const actions = useRef<((synth: S) => void)[]>([]);
  const open = useRef(false);
  const unmounted = useRef(false);
  const started = useRef(false);

  // `patch` and `options` are a lesson's, fixed for the life of the page, and
  // reading them through a ref keeps them out of every callback's dependencies
  // - a rebuilt `ensure` would be a rebuilt audio graph.
  const current = useRef({ patch, options });
  current.current = { patch, options };

  const applyGate = useCallback((on: boolean) => {
    const graph = live.current;
    const gain = outputGain(graph?.synth);
    if (!graph || !gain) return;
    gain.setTargetAtTime(on ? 1 : 0, graph.ac.currentTime, GATE_SECONDS);
  }, []);

  const ensure = useCallback(() => {
    if (started.current) return;
    started.current = true;
    setStatus("building");

    createSynthAudioContext()
      .then(async (ac) => {
        const { patch, options } = current.current;
        const built = patch.build(ac, options);

        // `Instrument` is a node the instant it is made and useless until its
        // worklets are registered: `params` is empty, so a control accessor
        // would read `undefined`. A compound that has that problem says so with
        // a `ready`, and nothing here reads an accessor before it resolves.
        const ready = (built as { ready?: Promise<unknown> } | null)?.ready;
        if (ready && typeof ready.then === "function") await ready;

        if (unmounted.current) {
          dispose(built);
          return;
        }

        (built as unknown as AudioNode).connect(ac.destination);
        live.current = { ac, synth: built };

        for (const { ref, value } of writes.current.splice(0)) {
          try {
            ref(built).value = value;
          } catch {
            // A queued write whose accessor the built patch does not have is
            // the lesson's bug, not the reader's: the control simply does
            // nothing, and rule 3 is what turns it into a failing test.
          }
        }
        for (const action of actions.current.splice(0)) action(built);

        // The gate is applied last, so a reader who pressed Play while the
        // worklets were still downloading gets sound the moment they arrive.
        if (open.current) {
          void ac.resume();
          applyGate(true);
        }

        setSynth(built);
        setStatus("ready");
      })
      .catch((error) => {
        setStatus("failed");
        // A widget that cannot build is worth a console error: it is the one
        // failure a reader can see and nobody else can.
        console.error(
          `learn: ${current.current.patch.id} failed to build`,
          error,
        );
      });
  }, [applyGate]);

  const setPlaying = useCallback(
    (on: boolean) => {
      open.current = on;
      setPlayingState(on);
      if (!on) {
        applyGate(false);
        return;
      }
      ensure();
      // The click that unmutes is the click that resumes: a browser only lets
      // audio start from a gesture, and this is the gesture.
      void live.current?.ac.resume();
      applyGate(true);
    },
    [applyGate, ensure],
  );

  const read = useCallback((ref: ParamRef<S>, fallback: number) => {
    const graph = live.current;
    if (!graph) return fallback;
    try {
      const value = ref(graph.synth)?.value;
      return typeof value === "number" ? value : fallback;
    } catch {
      return fallback;
    }
  }, []);

  const write = useCallback(
    (ref: ParamRef<S>, value: number) => {
      const graph = live.current;
      if (!graph) {
        writes.current.push({ ref, value });
        ensure();
        return;
      }
      try {
        ref(graph.synth).value = value;
      } catch {
        // See above: a dead accessor is a manifest bug, not a render error.
      }
    },
    [ensure],
  );

  const call = useCallback(
    (action: (synth: S) => void) => {
      const graph = live.current;
      if (!graph) {
        actions.current.push(action);
        ensure();
        return;
      }
      action(graph.synth);
    },
    [ensure],
  );

  // Teardown. Navigating between lessons has to leave nothing running, which is
  // one `dispose()` per compound and the probe that was watching it.
  useEffect(() => {
    unmounted.current = false;
    return () => {
      unmounted.current = true;
      const graph = live.current;
      live.current = null;
      dispose(graph?.synth);
    };
  }, []);

  // The level a headless browser reads. A plain `AnalyserNode`, not a
  // `LevelMeter`: it costs no worklet, every widget gets one whether or not it
  // shows a meter, and it is gone from the deployed build with the hooks.
  useEffect(() => {
    if (!hooksEnabled || !synth) return;
    const graph = live.current;
    if (!graph) return;

    const analyser = graph.ac.createAnalyser();
    analyser.fftSize = 2048;
    (synth as unknown as AudioNode).connect(analyser);
    const samples = new Float32Array(analyser.fftSize);

    const releaseProbe = addLevelProbe(() => {
      analyser.getFloatTimeDomainData(samples);
      let peak = 0;
      for (const sample of samples) peak = Math.max(peak, Math.abs(sample));
      return peak > 0 ? 20 * Math.log10(peak) : -Infinity;
    });
    const releaseLive = trackLive();

    return () => {
      releaseProbe();
      releaseLive();
      analyser.disconnect();
    };
  }, [synth]);

  return {
    patch,
    synth,
    status,
    playing,
    ensure,
    setPlaying,
    read,
    write,
    call,
  };
}
