"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getPatchSource } from "@/learn/patches";
import playgroundPatch from "@/learn/patches/playground";
import type { Control, ParamRef, XYControl } from "@/learn/patches/define";
import { CodeView } from "@/learn/kit/CodeView";
import { XY } from "@/learn/kit/controls/XY";
import { renderControl } from "@/learn/kit/controls";
import { PlayToggle } from "@/learn/kit/PlayToggle";
import { useLessonPatch, type PatchRuntime } from "@/learn/kit/useLessonPatch";
import { useTokenColors } from "@/learn/kit/useTokenColors";
import { MeterView, renderView } from "@/learn/kit/views";
import { LEARN_VOICE_GROUPS, type LearnVoiceGroup } from "@/learn/voice";
import { CopyLink } from "./CopyLink";
import { Gallery } from "./Gallery";
import { padControl, padHome, padMapping, padValues } from "./pad";
import {
  changedParams,
  encodePlaygroundState,
  type PlaygroundState,
} from "./state";
import {
  DEFAULT_VOICES,
  PLAYGROUND_PARAMS,
  presetValues,
  stateValues,
  type PlaygroundValues,
} from "./values";

/*
 * The Playground, around the patch.
 *
 * It is not a `LessonWidget`, and the reason is arithmetic: a lesson shows two
 * or three controls and one flat grid is the right frame for that; this shows
 * thirty-five, and thirty-five knobs in one column is a preset list with the
 * names taken off. So the frame here is the voice's own five groups, the
 * gallery above them and the pad between - and everything inside it is the
 * kit's, rendered through the same `renderControl` and `renderView` every
 * lesson uses, so a redesign still reaches it.
 *
 * ## The three things this file knows that a lesson never needs
 *
 * **The link is the state.** Every change rewrites the fragment with
 * `history.replaceState`, so "Copy link" is `location.href` and there is no
 * second store to keep in step, and the reader can see what they are about to
 * send. It is read once, after mount, by `Playground.tsx`.
 *
 * **The page keeps its own model of the sound.** The kit's controls write
 * through `runtime.write` and tell nobody, so the writes are recorded on the way
 * past: the manifest's `param` accessors are closures made once at module scope,
 * which makes them usable as map keys, and the map turns a write into a named
 * value. That model is what the link's "changed parameters" are measured
 * against, and `AudioParam` has no memory of where it started.
 *
 * **A slider that was moved from underneath re-reads.** `Slider` asks its
 * parameter where it is when it mounts; a preset or a pad sweep moves thirty-one
 * of them at once, so the grid is keyed and remounts. The audio graph is above
 * the key and never notices.
 */

const GROUP_TITLES: Record<LearnVoiceGroup, string> = {
  oscillators: "Oscillators",
  pitch: "Pitch",
  filter: "Filter",
  envelopes: "Envelopes",
  lfo: "LFO",
};

/** How long a pad sweep's ramp needs before a slider can read the end of it. */
const SETTLE_MS = 150;

/** A knob move is not a navigation, but a hundred of them should not be either. */
const HASH_MS = 200;

const byId = new Map<string, Control<any>>(
  playgroundPatch.controls.map((control) => [control.id, control]),
);

const paramOf = (id: string): ParamRef<any> =>
  (byId.get(id) as { param: ParamRef<any> }).param;

const PAD = byId.get("pad") as XYControl<any>;

/**
 * Which control a write belongs to.
 *
 * Keyed by the accessor itself. A manifest's `param` is a closure built once
 * when the module is evaluated, so its identity is stable for the life of the
 * page and is the only handle the kit passes back out.
 */
const NAMED_WRITES = new Map<ParamRef<any>, string>([
  ...PLAYGROUND_PARAMS.map(
    (name) => [paramOf(name), name] as [ParamRef<any>, string],
  ),
  [paramOf("glide"), "glide"],
  [paramOf("voices"), "voices"],
  [PAD.x.param, "pad-x"],
  [PAD.y.param, "pad-y"],
]);

export function PlaygroundRig({
  seed,
}: {
  /** The sound this build starts from, read off the link after mount. */
  seed: PlaygroundState;
}) {
  const start = useMemo<PlaygroundValues>(() => stateValues(seed), [seed]);

  // A new object every render would rebuild the audio graph.
  const options = useMemo(
    () => ({ preset: start.preset, voices: start.voices }),
    [start],
  );
  const runtime = useLessonPatch(playgroundPatch, options);
  const { colors, markers } = useTokenColors();

  const [preset, setPreset] = useState(start.preset);
  // Bumped whenever something moved the parameters from underneath the
  // controls. It keys the grid, and remounting is how they re-read.
  const [revision, setRevision] = useState(0);

  const mapping = useMemo(() => padMapping(preset), [preset]);

  // The live sound. A ref, because a pad sweep changes it sixty times a second
  // and none of those sixty are a render.
  const live = useRef<PlaygroundValues>({
    ...start,
    xy: start.xy ?? padHome(padMapping(start.preset), start.values),
  });

  const hashTimer = useRef<ReturnType<typeof setTimeout>>();
  const settleTimer = useRef<ReturnType<typeof setTimeout>>();

  /** The link, as small as it can be: only what differs from what it names. */
  const currentState = useCallback((): PlaygroundState => {
    const now = live.current;
    const base = presetValues(now.preset);
    const params = changedParams(now.values, base.values);
    const home = padHome(padMapping(now.preset), base.values);
    const xy = now.xy ?? home;

    return {
      preset: now.preset,
      params: Object.keys(params).length > 0 ? params : undefined,
      // A pad that has not been moved off the sound's own position says nothing.
      xy: xy[0] === home[0] && xy[1] === home[1] ? undefined : xy,
      voices: now.voices === DEFAULT_VOICES ? undefined : now.voices,
      glide: now.glide === base.glide ? undefined : now.glide,
    };
  }, []);

  const writeHash = useCallback(() => {
    const fragment = encodePlaygroundState(currentState());
    const { pathname, search } = window.location;
    // `replaceState`, not a navigation: the reader is turning a knob, not
    // moving through a history they would then have to press Back through.
    window.history.replaceState(null, "", `${pathname}${search}#${fragment}`);
  }, [currentState]);

  const scheduleHash = useCallback(() => {
    clearTimeout(hashTimer.current);
    hashTimer.current = setTimeout(writeHash, HASH_MS);
  }, [writeHash]);

  useEffect(
    () => () => {
      clearTimeout(hashTimer.current);
      clearTimeout(settleTimer.current);
    },
    [],
  );

  /** Every write the reader makes, on its way to the audio thread. */
  const record = useCallback(
    (name: string | undefined, value: number) => {
      const now = live.current;
      if (name === "glide") now.glide = value;
      else if (name === "voices") now.voices = Math.round(value);
      else if (name === "pad-x" || name === "pad-y") {
        const xy: [number, number] =
          name === "pad-x"
            ? [value, now.xy?.[1] ?? 0]
            : [now.xy?.[0] ?? 0, value];
        now.xy = xy;
        // The pad's bindings are the sound now, so the model follows them: the
        // link's "changed parameters" is what makes a swept pad shareable.
        Object.assign(now.values, padValues(padMapping(now.preset), xy));
      } else if (name && name in now.values) {
        now.values[name as keyof typeof now.values] = value;
      }
      scheduleHash();
    },
    [scheduleHash],
  );

  const tracked = useMemo<PatchRuntime>(
    () => ({
      ...runtime,
      write(ref, value) {
        record(NAMED_WRITES.get(ref), value);
        runtime.write(ref, value);
      },
    }),
    [runtime, record],
  );

  /** Load a sound: all thirty-one, the glide, the pad and its bindings. */
  const apply = useCallback(
    (values: PlaygroundValues, next: [number, number]) => {
      for (const name of PLAYGROUND_PARAMS) {
        runtime.write(paramOf(name), values.values[name]);
      }
      runtime.write(paramOf("glide"), values.glide);
      runtime.call((synth) => {
        synth.bindPad(padMapping(values.preset));
        // Placed, not swept: the parameters above are already the sound, and a
        // sweep would drag the axis's second binding away from what the preset
        // asked for. The pad takes over the moment it is touched.
        synth.placePad(next[0], next[1]);
      });
      setRevision((at) => at + 1);
    },
    [runtime],
  );

  // The build has finished: hand it the sound the link asked for. Until this
  // runs nothing exists - a Playground, like a lesson, arrives having built
  // nothing at all.
  useEffect(() => {
    if (!runtime.synth) return;
    const now = live.current;
    apply(now, now.xy ?? padHome(padMapping(now.preset), now.values));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runtime.synth]);

  const choose = useCallback(
    (name: string | undefined) => {
      const { values, glide } = presetValues(name);
      const next = padHome(padMapping(name), values);
      live.current = {
        preset: name,
        values,
        glide,
        voices: live.current.voices,
        xy: next,
      };
      setPreset(name);
      apply(live.current, next);
      clearTimeout(hashTimer.current);
      writeHash();
    },
    [apply, writeHash],
  );

  const pad = useMemo(
    () =>
      padControl(
        PAD,
        mapping,
        live.current.xy ?? padHome(mapping, live.current.values),
      ),
    // The pad is rebuilt when the mapping changes and when the grid remounts,
    // which are exactly the two moments its dot could be somewhere else.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mapping, revision],
  );

  /**
   * A control that knows what sound it is part of.
   *
   * A control's `default` is two things to the kit: where the knob sits before
   * there is a graph to ask, and where the reset returns it to. Left as the
   * manifest's, a Playground opened from a link would spend its first moments
   * showing `Init`'s thirty-one numbers rather than the ones in the link -
   * because nothing is built until the reader touches something, and until then
   * there is nothing to read. So the current sound is handed to the controls as
   * their default, which fixes the arrival *and* makes the reset mean the more
   * useful of the two things it could mean: back to this preset, not back to the
   * bare voice. The bare voice has a tile of its own.
   */
  const seeded = (control: Control<any>): Control<any> => {
    // Only the two kinds that have one. A pad's position is already seeded
    // through `padControl`, and the keys have no value to be at.
    if (control.kind !== "slider" && control.kind !== "select") return control;

    const now = live.current;
    const value =
      control.id === "voices"
        ? now.voices
        : control.id === "glide"
          ? now.glide
          : now.values[control.id as keyof typeof now.values];

    return value === undefined ? control : { ...control, default: value };
  };

  /*
   * "View the code", after mount only.
   *
   * `?raw` does not hand the kit the patch's *source*: Next's own loaders reach
   * the file first, so what `getPatchSource` returns is the *compiled* module -
   * and the server and the client compile it for different targets, so a patch
   * whose source contains `?.` or `??` produces two different strings. React
   * finds them different, throws a hydration error, and re-renders the whole
   * document from scratch, which on this page is a visible flash and a lost
   * first paint. `learn/patches/playground.ts` has both syntaxes, as does
   * `voice.ts`; `sound/harmonics.ts` has neither, which is why nobody hit this
   * before there were two patches like it.
   *
   * The bug is ticket 08b's. Rendering the panel only after mount means the
   * server and the first client render agree - on nothing - and the code appears
   * a frame later, which for a panel behind a `<summary>` costs the reader
   * exactly nothing. **Delete this gate when 08b lands.**
   */
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const meter = playgroundPatch.views.find((view) => view.kind === "meter");
  const pictures = playgroundPatch.views.filter(
    (view) => view.kind !== "meter",
  );

  return (
    <div data-playground className="max-w-learn">
      {markers}

      <Gallery chosen={preset} onChoose={choose} />

      <figure className="my-6 overflow-hidden rounded-learn border border-learn-border bg-learn-surface p-learn text-learn-ink">
        <figcaption className="flex flex-wrap items-center justify-between gap-2">
          <span className="min-w-0 font-learn-text text-sm font-medium">
            {playgroundPatch.label}
            {preset ? (
              <span className="text-learn-ink-muted"> · {preset}</span>
            ) : null}
          </span>
          <span className="flex items-center gap-3">
            {meter && meter.kind === "meter" ? (
              <MeterView
                source={meter.source}
                label={meter.label}
                options={meter.options}
                runtime={runtime}
              />
            ) : null}
            <PlayToggle runtime={runtime} />
          </span>
        </figcaption>

        <div className="mt-learn grid grid-cols-1 gap-learn sm:grid-cols-2">
          {pictures.map((view, index) => (
            <div
              key={`${view.kind}-${index}`}
              data-view={view.kind}
              className={view.kind === "keyboard" ? "sm:col-span-2" : undefined}
            >
              {renderView(view, runtime, colors)}
            </div>
          ))}
        </div>

        <div key={revision}>
          <div data-control="pad" className="mt-learn">
            <XY
              control={pad}
              runtime={tracked}
              onGesture={(phase) => {
                if (phase !== "end") return;
                // The ramp is still arriving; the sliders read the end of it.
                clearTimeout(settleTimer.current);
                settleTimer.current = setTimeout(
                  () => setRevision((at) => at + 1),
                  SETTLE_MS,
                );
              }}
            />
          </div>

          {(Object.keys(LEARN_VOICE_GROUPS) as LearnVoiceGroup[]).map(
            (group) => (
              <Group
                key={group}
                title={GROUP_TITLES[group]}
                ids={[...LEARN_VOICE_GROUPS[group]]}
                runtime={tracked}
                seeded={seeded}
              />
            ),
          )}

          <Group
            title="The instrument"
            ids={["voices", "glide"]}
            runtime={tracked}
            seeded={seeded}
          />
        </div>

        <CopyLink />

        {mounted ? (
          <CodeView
            id={playgroundPatch.id}
            source={getPatchSource(playgroundPatch.id)}
            code={playgroundPatch.code}
          />
        ) : null}
      </figure>
    </div>
  );
}

/** One of the voice's groups: a heading and the knobs that belong under it. */
function Group({
  title,
  ids,
  runtime,
  seeded,
}: {
  title: string;
  ids: string[];
  seeded: (control: Control<any>) => Control<any>;
  runtime: PatchRuntime;
}) {
  return (
    <section className="mt-learn border-t border-learn-border pt-learn">
      <h2 className="font-learn-text text-xs font-semibold uppercase tracking-wide text-learn-ink-muted">
        {title}
      </h2>
      <div className="mt-learn grid grid-cols-1 gap-learn sm:grid-cols-2">
        {ids.map((id) => {
          const control = byId.get(id);
          if (!control) return null;
          return (
            <div key={id} data-control={id} className="min-w-0">
              {renderControl(seeded(control), runtime)}
            </div>
          );
        })}
      </div>
    </section>
  );
}
